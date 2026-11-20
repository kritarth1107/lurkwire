use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use anyhow::{Context, Result};
use rusqlite::{params, Connection, OptionalExtension};
use sha2::{Digest, Sha256};

use crate::body_decode::{content_type, indexable_text as decode_indexable_text, preview_text as decode_preview_text};
use crate::scope::{ScopeKind, ScopeRule};
use crate::types::{
    url_from_parts, Finding, FindingDraft, FindingQuery, FlowDetail, FlowQuery, FlowSummary,
    HeaderPair, Project, Severity, PREVIEW_CHARS,
};

const SCHEMA: &str = r#"
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS flows (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  method TEXT NOT NULL,
  scheme TEXT NOT NULL,
  host TEXT NOT NULL,
  port INTEGER NOT NULL,
  path TEXT NOT NULL,
  query TEXT NOT NULL DEFAULT '',
  http_version TEXT NOT NULL,
  status INTEGER,
  req_headers TEXT NOT NULL,
  resp_headers TEXT,
  req_blob TEXT,
  resp_blob TEXT,
  req_len INTEGER NOT NULL DEFAULT 0,
  resp_len INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER,
  source TEXT NOT NULL,
  mime TEXT,
  in_scope INTEGER NOT NULL DEFAULT 1,
  truncated INTEGER NOT NULL DEFAULT 0,
  tags TEXT NOT NULL DEFAULT '[]',
  note TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE INDEX IF NOT EXISTS flows_project_ts ON flows(project_id, ts DESC);
CREATE INDEX IF NOT EXISTS flows_project_host ON flows(project_id, host);
CREATE INDEX IF NOT EXISTS flows_project_status ON flows(project_id, status);

CREATE VIRTUAL TABLE IF NOT EXISTS flows_fts USING fts5(
  id UNINDEXED,
  method,
  host,
  path,
  query,
  req_text,
  resp_text,
  tokenize = 'unicode61'
);

CREATE TABLE IF NOT EXISTS scope_rules (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  kind TEXT NOT NULL,
  host TEXT NOT NULL,
  port INTEGER,
  path_prefix TEXT NOT NULL DEFAULT '/',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);
CREATE INDEX IF NOT EXISTS scope_rules_project ON scope_rules(project_id);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  project_id TEXT,
  detail TEXT NOT NULL,
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_log_ts ON audit_log(ts DESC);

CREATE TABLE IF NOT EXISTS findings (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  flow_id TEXT,
  ts INTEGER NOT NULL,
  check_id TEXT NOT NULL,
  title TEXT NOT NULL,
  severity TEXT NOT NULL,
  detail TEXT NOT NULL,
  evidence TEXT NOT NULL,
  host TEXT NOT NULL,
  path TEXT NOT NULL,
  method TEXT NOT NULL,
  status INTEGER,
  count INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS findings_dedup
  ON findings(project_id, check_id, host, path, method);
CREATE INDEX IF NOT EXISTS findings_project_ts ON findings(project_id, ts DESC);
"#;

const MAX_INDEX_CHARS: usize = 256 * 1024;

#[derive(Debug, Clone)]
pub struct NewFlow {
    pub id: String,
    pub project_id: String,
    pub ts: i64,
    pub method: String,
    pub scheme: String,
    pub host: String,
    pub port: u16,
    pub path: String,
    pub query: String,
    pub http_version: String,
    pub status: Option<u16>,
    pub req_headers: Vec<HeaderPair>,
    pub resp_headers: Vec<HeaderPair>,
    pub req_body: Vec<u8>,
    pub resp_body: Vec<u8>,
    pub req_len: u64,
    pub resp_len: u64,
    pub duration_ms: Option<u64>,
    pub source: String,
    pub truncated: bool,
    pub in_scope: bool,
}

pub struct Store {
    conn: Mutex<Connection>,
    blob_dir: PathBuf,
}

impl Store {
    pub fn open(data_dir: &Path) -> Result<Self> {
        fs::create_dir_all(data_dir)?;
        let blob_dir = data_dir.join("blobs");
        fs::create_dir_all(&blob_dir)?;
        let db_path = data_dir.join("lurkwire.sqlite");
        let conn =
            Connection::open(&db_path).with_context(|| format!("open {}", db_path.display()))?;
        conn.execute_batch(SCHEMA)
            .context("initialize sqlite schema")?;
        migrate(&conn)?;
        Ok(Self {
            conn: Mutex::new(conn),
            blob_dir,
        })
    }

    pub fn ensure_default_project(&self) -> Result<Project> {
        let conn = self.conn.lock().expect("store lock");
        if let Some(existing) = conn
            .query_row(
                "SELECT id, name, created_at FROM projects ORDER BY created_at ASC LIMIT 1",
                [],
                row_project,
            )
            .optional()?
        {
            return Ok(existing);
        }
        let project = Project {
            id: uuid::Uuid::new_v4().to_string(),
            name: "Default project".to_string(),
            created_at: now_ms(),
        };
        conn.execute(
            "INSERT INTO projects(id, name, created_at) VALUES (?1, ?2, ?3)",
            params![project.id, project.name, project.created_at],
        )?;
        Ok(project)
    }

    pub fn create_project(&self, name: &str) -> Result<Project> {
        let project = Project {
            id: uuid::Uuid::new_v4().to_string(),
            name: name.trim().to_string(),
            created_at: now_ms(),
        };
        if project.name.is_empty() {
            anyhow::bail!("project name is required");
        }
        let conn = self.conn.lock().expect("store lock");
        conn.execute(
            "INSERT INTO projects(id, name, created_at) VALUES (?1, ?2, ?3)",
            params![project.id, project.name, project.created_at],
        )?;
        Ok(project)
    }

    pub fn list_projects(&self) -> Result<Vec<Project>> {
        let conn = self.conn.lock().expect("store lock");
        let mut stmt =
            conn.prepare("SELECT id, name, created_at FROM projects ORDER BY created_at ASC")?;
        let rows = stmt.query_map([], row_project)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn insert_flow(&self, flow: &NewFlow) -> Result<FlowSummary> {
        let req_blob = if flow.req_body.is_empty() {
            None
        } else {
            Some(self.put_blob(&flow.req_body)?)
        };
        let resp_blob = if flow.resp_body.is_empty() {
            None
        } else {
            Some(self.put_blob(&flow.resp_body)?)
        };
        let mime = content_type(&flow.resp_headers);
        let req_headers = serde_json::to_string(&flow.req_headers)?;
        let resp_headers = serde_json::to_string(&flow.resp_headers)?;
        let tags = "[]";
        let conn = self.conn.lock().expect("store lock");
        let tx = conn.unchecked_transaction()?;
        tx.execute(
            "INSERT INTO flows (
                id, project_id, ts, method, scheme, host, port, path, query, http_version,
                status, req_headers, resp_headers, req_blob, resp_blob, req_len, resp_len,
                duration_ms, source, mime, in_scope, truncated, tags, note
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10,
                ?11, ?12, ?13, ?14, ?15, ?16, ?17,
                ?18, ?19, ?20, ?21, ?22, ?23, ''
            )",
            params![
                flow.id,
                flow.project_id,
                flow.ts,
                flow.method,
                flow.scheme,
                flow.host,
                flow.port as i64,
                flow.path,
                flow.query,
                flow.http_version,
                flow.status.map(|s| s as i64),
                req_headers,
                resp_headers,
                req_blob,
                resp_blob,
                flow.req_len as i64,
                flow.resp_len as i64,
                flow.duration_ms.map(|d| d as i64),
                flow.source,
                mime,
                if flow.in_scope { 1 } else { 0 },
                if flow.truncated { 1 } else { 0 },
                tags,
            ],
        )?;
        let req_text = decode_indexable_text(&flow.req_body, &flow.req_headers, MAX_INDEX_CHARS);
        let resp_text = decode_indexable_text(&flow.resp_body, &flow.resp_headers, MAX_INDEX_CHARS);
        tx.execute(
            "INSERT INTO flows_fts(id, method, host, path, query, req_text, resp_text)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                flow.id,
                flow.method,
                flow.host,
                flow.path,
                flow.query,
                req_text,
                resp_text
            ],
        )?;
        tx.commit()?;
        Ok(FlowSummary {
            id: flow.id.clone(),
            project_id: flow.project_id.clone(),
            ts: flow.ts,
            method: flow.method.clone(),
            scheme: flow.scheme.clone(),
            host: flow.host.clone(),
            port: flow.port,
            path: flow.path.clone(),
            query: flow.query.clone(),
            url: url_from_parts(&flow.scheme, &flow.host, flow.port, &flow.path, &flow.query),
            http_version: flow.http_version.clone(),
            status: flow.status,
            req_len: flow.req_len,
            resp_len: flow.resp_len,
            duration_ms: flow.duration_ms,
            source: flow.source.clone(),
            mime,
            in_scope: flow.in_scope,
            truncated: flow.truncated,
            tags: Vec::new(),
            note: String::new(),
        })
    }

    pub fn list_flows(
        &self,
        query: &FlowQuery,
        default_project: &str,
    ) -> Result<(Vec<FlowSummary>, i64)> {
        let parsed = parse_search(query);
        let project_id = query
            .project_id
            .as_deref()
            .filter(|s| !s.is_empty())
            .unwrap_or(default_project);
        let limit = query.limit.unwrap_or(200).min(1000) as i64;
        let offset = query.offset.unwrap_or(0) as i64;

        let mut where_sql = String::from(" WHERE f.project_id = ?1");
        let mut bind: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(project_id.to_string())];

        let mut next = 2u32;
        if let Some(method) = parsed.method.as_ref().or(query.method.as_ref()) {
            where_sql.push_str(&format!(" AND f.method = ?{next}"));
            bind.push(Box::new(method.to_uppercase()));
            next += 1;
        }
        if let Some(host) = parsed.host.as_ref().or(query.host.as_ref()) {
            where_sql.push_str(&format!(" AND f.host LIKE ?{next}"));
            bind.push(Box::new(format!("%{host}%")));
            next += 1;
        }
        let status = parsed.status.or(query.status);
        if let Some(status) = status {
            where_sql.push_str(&format!(" AND f.status = ?{next}"));
            bind.push(Box::new(status as i64));
            next += 1;
        }
        let status_min = parsed.status_min.or(query.status_min);
        if let Some(min) = status_min {
            where_sql.push_str(&format!(" AND f.status >= ?{next}"));
            bind.push(Box::new(min as i64));
            next += 1;
        }
        let status_max = parsed.status_max.or(query.status_max);
        if let Some(max) = status_max {
            where_sql.push_str(&format!(" AND f.status <= ?{next}"));
            bind.push(Box::new(max as i64));
            next += 1;
        }
        if let Some(source) = query.source.as_ref() {
            where_sql.push_str(&format!(" AND f.source = ?{next}"));
            bind.push(Box::new(source.clone()));
            next += 1;
        }
        if query.hide_static.unwrap_or(false) {
            where_sql.push_str(
                " AND (f.mime IS NULL OR (lower(f.mime) NOT LIKE 'image/%' AND lower(f.mime) NOT LIKE 'font/%' AND lower(f.mime) NOT LIKE 'video/%' AND lower(f.mime) NOT LIKE 'audio/%'))
                  AND lower(f.path) NOT GLOB '*.css'
                  AND lower(f.path) NOT GLOB '*.js'
                  AND lower(f.path) NOT GLOB '*.map'
                  AND lower(f.path) NOT GLOB '*.ico'
                  AND lower(f.path) NOT GLOB '*.woff*'
                  AND lower(f.path) NOT GLOB '*.png'
                  AND lower(f.path) NOT GLOB '*.jpg'
                  AND lower(f.path) NOT GLOB '*.jpeg'
                  AND lower(f.path) NOT GLOB '*.gif'
                  AND lower(f.path) NOT GLOB '*.svg'
                  AND lower(f.path) NOT GLOB '*.webp'",
            );
        }

        let use_fts = parsed.fts.as_ref().map(|s| !s.is_empty()).unwrap_or(false);
        let from_sql = if use_fts {
            where_sql.push_str(&format!(" AND flows_fts MATCH ?{next}"));
            bind.push(Box::new(parsed.fts.clone().unwrap()));
            " FROM flows f JOIN flows_fts ON flows_fts.id = f.id"
        } else {
            " FROM flows f"
        };

        let bind_refs: Vec<&dyn rusqlite::types::ToSql> = bind.iter().map(|b| b.as_ref()).collect();
        let conn = self.conn.lock().expect("store lock");
        let count_sql = format!("SELECT COUNT(*) {from_sql} {where_sql}");
        let total: i64 = conn.query_row(
            &count_sql,
            rusqlite::params_from_iter(bind_refs.iter().copied()),
            |row| row.get(0),
        )?;

        let list_sql = format!(
            "SELECT f.id, f.project_id, f.ts, f.method, f.scheme, f.host, f.port, f.path, f.query,
                    f.http_version, f.status, f.req_len, f.resp_len, f.duration_ms, f.source, f.mime,
                    f.in_scope, f.truncated, f.tags, f.note
             {from_sql} {where_sql}
             ORDER BY f.ts DESC, f.id DESC
             LIMIT {limit} OFFSET {offset}"
        );
        let mut stmt = conn.prepare(&list_sql)?;
        let rows = stmt.query_map(rusqlite::params_from_iter(bind_refs), row_summary)?;
        let items = rows.collect::<Result<Vec<_>, _>>()?;
        Ok((items, total))
    }

    pub fn get_flow(&self, id: &str) -> Result<Option<FlowDetail>> {
        let conn = self.conn.lock().expect("store lock");
        let row = conn
            .query_row(
                "SELECT id, project_id, ts, method, scheme, host, port, path, query, http_version,
                        status, req_len, resp_len, duration_ms, source, mime, in_scope, truncated,
                        tags, note, req_headers, resp_headers, req_blob, resp_blob
                 FROM flows WHERE id = ?1",
                [id],
                |row| {
                    let summary = row_summary_from(row)?;
                    let req_headers: String = row.get(20)?;
                    let resp_headers: Option<String> = row.get(21)?;
                    let req_blob: Option<String> = row.get(22)?;
                    let resp_blob: Option<String> = row.get(23)?;
                    Ok((summary, req_headers, resp_headers, req_blob, resp_blob))
                },
            )
            .optional()?;
        drop(conn);
        let Some((summary, req_headers, resp_headers, req_blob, resp_blob)) = row else {
            return Ok(None);
        };
        let req_headers: Vec<HeaderPair> = serde_json::from_str(&req_headers).unwrap_or_default();
        let resp_headers: Vec<HeaderPair> = resp_headers
            .as_deref()
            .and_then(|s| serde_json::from_str(s).ok())
            .unwrap_or_default();
        let req_preview = req_blob
            .as_ref()
            .and_then(|h| self.get_blob(h).ok())
            .and_then(|b| decode_preview_text(&b, &req_headers, PREVIEW_CHARS));
        let resp_preview = resp_blob
            .as_ref()
            .and_then(|h| self.get_blob(h).ok())
            .and_then(|b| decode_preview_text(&b, &resp_headers, PREVIEW_CHARS));
        Ok(Some(FlowDetail {
            summary,
            req_headers,
            resp_headers,
            req_blob,
            resp_blob,
            req_preview,
            resp_preview,
        }))
    }

    pub fn update_flow_annotation(
        &self,
        id: &str,
        note: Option<&str>,
        tags: Option<&[String]>,
    ) -> Result<Option<FlowDetail>> {
        if note.is_none() && tags.is_none() {
            return self.get_flow(id);
        }
        let conn = self.conn.lock().expect("store lock");
        if let Some(note) = note {
            conn.execute("UPDATE flows SET note = ?1 WHERE id = ?2", rusqlite::params![note, id])?;
        }
        if let Some(tags) = tags {
            let encoded = serde_json::to_string(tags)?;
            conn.execute("UPDATE flows SET tags = ?1 WHERE id = ?2", rusqlite::params![encoded, id])?;
        }
        drop(conn);
        self.get_flow(id)
    }

    pub fn get_blob(&self, hash: &str) -> Result<Vec<u8>> {
        if !hash.chars().all(|c| c.is_ascii_hexdigit()) || hash.len() != 64 {
            anyhow::bail!("invalid blob id");
        }
        let path = self.blob_path(hash);
        let compressed =
            fs::read(&path).with_context(|| format!("read blob {}", path.display()))?;
        zstd::decode_all(&compressed[..]).context("decompress blob")
    }

    fn put_blob(&self, bytes: &[u8]) -> Result<String> {
        let hash = hex::encode(Sha256::digest(bytes));
        let path = self.blob_path(&hash);
        if path.exists() {
            return Ok(hash);
        }
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let compressed = zstd::encode_all(bytes, 3).context("compress blob")?;
        let tmp = path.with_extension("zst.tmp");
        fs::write(&tmp, compressed)?;
        fs::rename(&tmp, &path)?;
        Ok(hash)
    }

    fn blob_path(&self, hash: &str) -> PathBuf {
        self.blob_dir.join(&hash[..2]).join(format!("{hash}.zst"))
    }

    pub fn list_scope_rules(&self, project_id: &str) -> Result<Vec<ScopeRule>> {
        let conn = self.conn.lock().expect("store lock");
        let mut stmt = conn.prepare(
            "SELECT id, project_id, enabled, kind, host, port, path_prefix, created_at
             FROM scope_rules WHERE project_id = ?1 ORDER BY created_at ASC",
        )?;
        let rows = stmt.query_map(params![project_id], row_scope)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn add_scope_rule(&self, rule: &ScopeRule) -> Result<()> {
        let conn = self.conn.lock().expect("store lock");
        conn.execute(
            "INSERT INTO scope_rules(id, project_id, enabled, kind, host, port, path_prefix, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                rule.id,
                rule.project_id,
                if rule.enabled { 1 } else { 0 },
                kind_str(&rule.kind),
                rule.host,
                rule.port.map(|p| p as i64),
                rule.path_prefix,
                rule.created_at,
            ],
        )?;
        Ok(())
    }

    pub fn delete_scope_rule(&self, id: &str) -> Result<bool> {
        let conn = self.conn.lock().expect("store lock");
        let n = conn.execute("DELETE FROM scope_rules WHERE id = ?1", params![id])?;
        Ok(n > 0)
    }

    pub fn replace_scope_rules(&self, project_id: &str, rules: &[ScopeRule]) -> Result<()> {
        let conn = self.conn.lock().expect("store lock");
        let tx = conn.unchecked_transaction()?;
        tx.execute(
            "DELETE FROM scope_rules WHERE project_id = ?1",
            params![project_id],
        )?;
        for rule in rules {
            tx.execute(
                "INSERT INTO scope_rules(id, project_id, enabled, kind, host, port, path_prefix, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    rule.id,
                    rule.project_id,
                    if rule.enabled { 1 } else { 0 },
                    kind_str(&rule.kind),
                    rule.host,
                    rule.port.map(|p| p as i64),
                    rule.path_prefix,
                    rule.created_at,
                ],
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    pub fn get_scope_rule(&self, id: &str) -> Result<Option<ScopeRule>> {
        let conn = self.conn.lock().expect("store lock");
        conn.query_row(
            "SELECT id, project_id, enabled, kind, host, port, path_prefix, created_at
             FROM scope_rules WHERE id = ?1",
            params![id],
            row_scope,
        )
        .optional()
        .map_err(Into::into)
    }

    pub fn append_audit(
        &self,
        actor: &str,
        action: &str,
        project_id: Option<&str>,
        detail: serde_json::Value,
    ) -> Result<AuditEntry> {
        let conn = self.conn.lock().expect("store lock");
        let prev_hash: String = conn
            .query_row(
                "SELECT hash FROM audit_log ORDER BY ts DESC, id DESC LIMIT 1",
                [],
                |row| row.get(0),
            )
            .optional()?
            .unwrap_or_else(genesis_hash);
        let entry = AuditEntry {
            id: uuid::Uuid::new_v4().to_string(),
            ts: now_ms(),
            actor: actor.to_string(),
            action: action.to_string(),
            project_id: project_id.map(ToOwned::to_owned),
            detail,
            prev_hash: prev_hash.clone(),
            hash: String::new(),
        };
        let hash = audit_hash(&prev_hash, &entry);
        conn.execute(
            "INSERT INTO audit_log(id, ts, actor, action, project_id, detail, prev_hash, hash)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                entry.id,
                entry.ts,
                entry.actor,
                entry.action,
                entry.project_id,
                entry.detail.to_string(),
                prev_hash,
                hash,
            ],
        )?;
        Ok(AuditEntry { hash, ..entry })
    }

    pub fn list_audit(
        &self,
        project_id: Option<&str>,
        limit: u32,
        offset: u32,
    ) -> Result<Vec<AuditEntry>> {
        let conn = self.conn.lock().expect("store lock");
        if let Some(pid) = project_id {
            let mut stmt = conn.prepare(
                "SELECT id, ts, actor, action, project_id, detail, prev_hash, hash
                 FROM audit_log
                 WHERE project_id IS NULL OR project_id = ?1
                 ORDER BY ts ASC, id ASC
                 LIMIT ?2 OFFSET ?3",
            )?;
            let rows = stmt.query_map(params![pid, limit as i64, offset as i64], row_audit)?;
            rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
        } else {
            let mut stmt = conn.prepare(
                "SELECT id, ts, actor, action, project_id, detail, prev_hash, hash
                 FROM audit_log
                 ORDER BY ts ASC, id ASC
                 LIMIT ?1 OFFSET ?2",
            )?;
            let rows = stmt.query_map(params![limit as i64, offset as i64], row_audit)?;
            rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
        }
    }

    pub fn verify_audit_chain(&self) -> Result<bool> {
        let entries = self.list_audit(None, 10_000, 0)?;
        let mut prev = genesis_hash();
        for entry in entries {
            if entry.prev_hash != prev {
                return Ok(false);
            }
            let expected = audit_hash(&entry.prev_hash, &entry);
            if expected != entry.hash {
                return Ok(false);
            }

            prev = entry.hash;
        }
        Ok(true)
    }

    pub fn upsert_finding(&self, draft: &FindingDraft) -> Result<Finding> {
        let conn = self.conn.lock().expect("store lock");
        let existing: Option<(String, u32)> = conn
            .query_row(
                "SELECT id, count FROM findings
                 WHERE project_id = ?1 AND check_id = ?2 AND host = ?3 AND path = ?4 AND method = ?5",
                params![
                    draft.project_id,
                    draft.check_id,
                    draft.host,
                    draft.path,
                    draft.method
                ],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?;
        let ts = now_ms();
        let severity = match draft.severity {
            Severity::Info => "info",
            Severity::Low => "low",
            Severity::Medium => "medium",
            Severity::High => "high",
        };
        let (id, count) = if let Some((id, count)) = existing {
            let count = count + 1;
            conn.execute(
                "UPDATE findings SET ts = ?1, flow_id = ?2, evidence = ?3, status = ?4, count = ?5, detail = ?6
                 WHERE id = ?7",
                params![
                    ts,
                    draft.flow_id,
                    draft.evidence,
                    draft.status.map(|s| s as i64),
                    count as i64,
                    draft.detail,
                    id,
                ],
            )?;
            (id, count)
        } else {
            let id = uuid::Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO findings (
                    id, project_id, flow_id, ts, check_id, title, severity, detail, evidence,
                    host, path, method, status, count
                ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,1)",
                params![
                    id,
                    draft.project_id,
                    draft.flow_id,
                    ts,
                    draft.check_id,
                    draft.title,
                    severity,
                    draft.detail,
                    draft.evidence,
                    draft.host,
                    draft.path,
                    draft.method,
                    draft.status.map(|s| s as i64),
                ],
            )?;
            (id, 1)
        };
        Ok(Finding {
            id,
            project_id: draft.project_id.clone(),
            flow_id: Some(draft.flow_id.clone()),
            ts,
            check_id: draft.check_id.clone(),
            title: draft.title.clone(),
            severity: draft.severity,
            detail: draft.detail.clone(),
            evidence: draft.evidence.clone(),
            host: draft.host.clone(),
            path: draft.path.clone(),
            method: draft.method.clone(),
            status: draft.status,
            count,
        })
    }

    pub fn list_findings(
        &self,
        query: &FindingQuery,
        default_project: &str,
    ) -> Result<(Vec<Finding>, u32)> {
        let conn = self.conn.lock().expect("store lock");
        let project = query
            .project_id
            .as_deref()
            .filter(|s| !s.is_empty())
            .unwrap_or(default_project);
        let limit = query.limit.unwrap_or(200).min(1000) as i64;
        let offset = query.offset.unwrap_or(0) as i64;
        let q = query.q.as_deref().unwrap_or("").trim();
        let sev = query.severity.as_deref().unwrap_or("").trim();
        let check = query.check_id.as_deref().unwrap_or("").trim();
        let host = query.host.as_deref().unwrap_or("").trim();
        let like = format!("%{q}%");
        let total: u32 = conn.query_row(
            "SELECT COUNT(*) FROM findings
             WHERE project_id = ?1
               AND (?2 = '' OR severity = ?2)
               AND (?3 = '' OR check_id = ?3)
               AND (?4 = '' OR host LIKE ?4)
               AND (?5 = '' OR title LIKE ?5 OR host LIKE ?5 OR path LIKE ?5 OR check_id LIKE ?5 OR detail LIKE ?5)",
            params![project, sev, check, if host.is_empty() { String::new() } else { format!("%{host}%") }, if q.is_empty() { String::new() } else { like.clone() }],
            |row| row.get(0),
        )?;
        let mut stmt = conn.prepare(
            "SELECT id, project_id, flow_id, ts, check_id, title, severity, detail, evidence,
                    host, path, method, status, count
             FROM findings
             WHERE project_id = ?1
               AND (?2 = '' OR severity = ?2)
               AND (?3 = '' OR check_id = ?3)
               AND (?4 = '' OR host LIKE ?4)
               AND (?5 = '' OR title LIKE ?5 OR host LIKE ?5 OR path LIKE ?5 OR check_id LIKE ?5 OR detail LIKE ?5)
             ORDER BY CASE severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END,
                      ts DESC
             LIMIT ?6 OFFSET ?7",
        )?;
        let host_like = if host.is_empty() { String::new() } else { format!("%{host}%") };
        let q_like = if q.is_empty() { String::new() } else { like };
        let rows = stmt.query_map(
            params![project, sev, check, host_like, q_like, limit, offset],
            row_finding,
        )?;
        let items = rows.collect::<Result<Vec<_>, _>>()?;
        Ok((items, total))
    }

    pub fn get_finding(&self, id: &str) -> Result<Option<Finding>> {
        let conn = self.conn.lock().expect("store lock");
        conn.query_row(
            "SELECT id, project_id, flow_id, ts, check_id, title, severity, detail, evidence,
                    host, path, method, status, count
             FROM findings WHERE id = ?1",
            params![id],
            row_finding,
        )
        .optional()
        .map_err(Into::into)
    }
}


struct ParsedSearch {
    fts: Option<String>,
    method: Option<String>,
    host: Option<String>,
    status: Option<u16>,
    status_min: Option<u16>,
    status_max: Option<u16>,
}

fn parse_search(query: &FlowQuery) -> ParsedSearch {
    let mut parsed = ParsedSearch {
        fts: None,
        method: None,
        host: None,
        status: None,
        status_min: None,
        status_max: None,
    };
    let Some(raw) = query.q.as_deref() else {
        return parsed;
    };
    let mut fts = Vec::new();
    for token in tokenize(raw) {
        if let Some((key, value)) = token.split_once(':') {
            let key = key.to_ascii_lowercase();
            match key.as_str() {
                "host" => parsed.host = Some(value.to_string()),
                "method" => parsed.method = Some(value.to_string()),
                "status" => apply_status(&mut parsed, value),
                _ => fts.push(token),
            }
        } else {
            fts.push(token);
        }
    }
    if !fts.is_empty() {
        parsed.fts = Some(fts.join(" "));
    }
    parsed
}

fn apply_status(parsed: &mut ParsedSearch, value: &str) {
    if let Some(rest) = value.strip_prefix(">=") {
        parsed.status_min = rest.parse().ok();
        return;
    }
    if let Some(rest) = value.strip_prefix("<=") {
        parsed.status_max = rest.parse().ok();
        return;
    }
    if let Some((min, max)) = value.split_once('-') {
        parsed.status_min = min.parse().ok();
        parsed.status_max = max.parse().ok();
        return;
    }
    parsed.status = value.parse().ok();
}

fn tokenize(input: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    for ch in input.chars() {
        match ch {
            '"' => in_quotes = !in_quotes,
            c if c.is_whitespace() && !in_quotes => {
                if !current.is_empty() {
                    tokens.push(std::mem::take(&mut current));
                }
            }
            c => current.push(c),
        }
    }
    if !current.is_empty() {
        tokens.push(current);
    }
    tokens
}

fn row_project(row: &rusqlite::Row<'_>) -> rusqlite::Result<Project> {
    Ok(Project {
        id: row.get(0)?,
        name: row.get(1)?,
        created_at: row.get(2)?,
    })
}

fn row_summary(row: &rusqlite::Row<'_>) -> rusqlite::Result<FlowSummary> {
    row_summary_from(row)
}

fn row_summary_from(row: &rusqlite::Row<'_>) -> rusqlite::Result<FlowSummary> {
    let scheme: String = row.get(4)?;
    let host: String = row.get(5)?;
    let port: i64 = row.get(6)?;
    let path: String = row.get(7)?;
    let query: String = row.get(8)?;
    let port = port as u16;
    let tags: String = row.get(18)?;
    Ok(FlowSummary {
        id: row.get(0)?,
        project_id: row.get(1)?,
        ts: row.get(2)?,
        method: row.get(3)?,
        url: url_from_parts(&scheme, &host, port, &path, &query),
        scheme,
        host,
        port,
        path,
        query,
        http_version: row.get(9)?,
        status: row.get::<_, Option<i64>>(10)?.map(|s| s as u16),
        req_len: row.get::<_, i64>(11)? as u64,
        resp_len: row.get::<_, i64>(12)? as u64,
        duration_ms: row.get::<_, Option<i64>>(13)?.map(|d| d as u64),
        source: row.get(14)?,
        mime: row.get(15)?,
        in_scope: row.get::<_, i64>(16)? != 0,
        truncated: row.get::<_, i64>(17)? != 0,
        tags: serde_json::from_str(&tags).unwrap_or_default(),
        note: row.get(19)?,
    })
}

pub const GENESIS_HASH: &str = "0000000000000000000000000000000000000000000000000000000000000000";

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AuditEntry {
    pub id: String,
    pub ts: i64,
    pub actor: String,
    pub action: String,
    pub project_id: Option<String>,
    pub detail: serde_json::Value,
    pub prev_hash: String,
    pub hash: String,
}

fn migrate(conn: &Connection) -> Result<()> {
    let version: Option<String> = conn
        .query_row(
            "SELECT value FROM meta WHERE key = 'schema_version'",
            [],
            |row| row.get(0),
        )
        .optional()?;
    match version.as_deref() {
        None => {
            conn.execute(
                "INSERT INTO meta(key, value) VALUES ('schema_version', '3')",
                [],
            )?;
        }
        Some("1") | Some("2") => {
            conn.execute(
                "UPDATE meta SET value = '3' WHERE key = 'schema_version'",
                [],
            )?;
        }
        Some(_) => {}
    }
    // Idempotent for existing databases that already ran SCHEMA CREATE IF NOT EXISTS
    // on a later process start, and for mid-upgrade openings.
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS findings (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          flow_id TEXT,
          ts INTEGER NOT NULL,
          check_id TEXT NOT NULL,
          title TEXT NOT NULL,
          severity TEXT NOT NULL,
          detail TEXT NOT NULL,
          evidence TEXT NOT NULL,
          host TEXT NOT NULL,
          path TEXT NOT NULL,
          method TEXT NOT NULL,
          status INTEGER,
          count INTEGER NOT NULL DEFAULT 1,
          FOREIGN KEY (project_id) REFERENCES projects(id)
        );
        CREATE UNIQUE INDEX IF NOT EXISTS findings_dedup
          ON findings(project_id, check_id, host, path, method);
        CREATE INDEX IF NOT EXISTS findings_project_ts ON findings(project_id, ts DESC);
        "#,
    )?;
    Ok(())
}

pub fn genesis_hash() -> String {
    GENESIS_HASH.to_string()
}

/// hash = sha256(prev_hash || canonical entry)
pub fn audit_hash(prev_hash: &str, entry: &AuditEntry) -> String {
    let canonical = canonical_audit(entry);
    let mut hasher = Sha256::new();
    hasher.update(prev_hash.as_bytes());
    hasher.update(canonical.as_bytes());
    hex::encode(hasher.finalize())
}

fn canonical_audit(entry: &AuditEntry) -> String {
    let mut obj = serde_json::Map::new();
    obj.insert(
        "action".into(),
        serde_json::Value::String(entry.action.clone()),
    );
    obj.insert(
        "actor".into(),
        serde_json::Value::String(entry.actor.clone()),
    );
    obj.insert("detail".into(), sort_json(entry.detail.clone()));
    obj.insert(
        "project_id".into(),
        entry
            .project_id
            .clone()
            .map(serde_json::Value::String)
            .unwrap_or(serde_json::Value::Null),
    );
    obj.insert("ts".into(), serde_json::Value::Number(entry.ts.into()));
    serde_json::Value::Object(obj).to_string()
}

fn sort_json(value: serde_json::Value) -> serde_json::Value {
    match value {
        serde_json::Value::Object(map) => {
            let mut ordered = serde_json::Map::new();
            let mut keys: Vec<_> = map.keys().cloned().collect();
            keys.sort();
            for key in keys {
                if let Some(v) = map.get(&key) {
                    ordered.insert(key, sort_json(v.clone()));
                }
            }
            serde_json::Value::Object(ordered)
        }
        serde_json::Value::Array(items) => {
            serde_json::Value::Array(items.into_iter().map(sort_json).collect())
        }
        other => other,
    }
}

fn kind_str(kind: &ScopeKind) -> &'static str {
    match kind {
        ScopeKind::Include => "include",
        ScopeKind::Exclude => "exclude",
    }
}

fn parse_kind(value: &str) -> rusqlite::Result<ScopeKind> {
    match value {
        "include" => Ok(ScopeKind::Include),
        "exclude" => Ok(ScopeKind::Exclude),
        _ => Err(rusqlite::Error::InvalidQuery),
    }
}

fn row_scope(row: &rusqlite::Row<'_>) -> rusqlite::Result<ScopeRule> {
    Ok(ScopeRule {
        id: row.get(0)?,
        project_id: row.get(1)?,
        enabled: row.get::<_, i64>(2)? != 0,
        kind: parse_kind(&row.get::<_, String>(3)?)?,
        host: row.get(4)?,
        port: row.get::<_, Option<i64>>(5)?.map(|p| p as u16),
        path_prefix: row.get(6)?,
        created_at: row.get(7)?,
    })
}


fn row_finding(row: &rusqlite::Row<'_>) -> rusqlite::Result<Finding> {
    let severity = match row.get::<_, String>(6)?.as_str() {
        "high" => Severity::High,
        "medium" => Severity::Medium,
        "low" => Severity::Low,
        _ => Severity::Info,
    };
    Ok(Finding {
        id: row.get(0)?,
        project_id: row.get(1)?,
        flow_id: row.get(2)?,
        ts: row.get(3)?,
        check_id: row.get(4)?,
        title: row.get(5)?,
        severity,
        detail: row.get(7)?,
        evidence: row.get(8)?,
        host: row.get(9)?,
        path: row.get(10)?,
        method: row.get(11)?,
        status: row.get::<_, Option<i64>>(12)?.map(|s| s as u16),
        count: row.get::<_, i64>(13)? as u32,
    })
}

fn row_audit(row: &rusqlite::Row<'_>) -> rusqlite::Result<AuditEntry> {
    let detail: String = row.get(5)?;
    Ok(AuditEntry {
        id: row.get(0)?,
        ts: row.get(1)?,
        actor: row.get(2)?,
        action: row.get(3)?,
        project_id: row.get(4)?,
        detail: serde_json::from_str(&detail).unwrap_or(serde_json::Value::Null),
        prev_hash: row.get(6)?,
        hash: row.get(7)?,
    })
}

pub fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stores_and_searches_flows() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(dir.path()).unwrap();
        let project = store.ensure_default_project().unwrap();
        let again = store.ensure_default_project().unwrap();
        assert_eq!(project.id, again.id);

        let flow = NewFlow {
            id: uuid::Uuid::new_v4().to_string(),
            project_id: project.id.clone(),
            ts: now_ms(),
            method: "POST".into(),
            scheme: "https".into(),
            host: "api.example.test".into(),
            port: 443,
            path: "/v1/login".into(),
            query: "x=1".into(),
            http_version: "HTTP/1.1".into(),
            status: Some(401),
            req_headers: vec![HeaderPair {
                name: "Content-Type".into(),
                value: "application/json".into(),
            }],
            resp_headers: vec![HeaderPair {
                name: "Content-Type".into(),
                value: "application/json".into(),
            }],
            req_body: br#"{"password":"secret"}"#.to_vec(),
            resp_body: br#"{"error":"unauthorized"}"#.to_vec(),
            req_len: 22,
            resp_len: 24,
            duration_ms: Some(12),
            source: "browser".into(),
            truncated: false,
            in_scope: true,
        };
        store.insert_flow(&flow).unwrap();

        let gz_body = {
            use flate2::write::GzEncoder;
            use flate2::Compression;
            use std::io::Write;
            let mut enc = GzEncoder::new(Vec::new(), Compression::default());
            enc.write_all(br#"{"ok":true,"notice":"gzipdecoded"}"#).unwrap();
            enc.finish().unwrap()
        };
        let gz_flow = NewFlow {
            id: uuid::Uuid::new_v4().to_string(),
            project_id: project.id.clone(),
            ts: now_ms(),
            method: "GET".into(),
            scheme: "https".into(),
            host: "api.example.test".into(),
            port: 443,
            path: "/v1/gzip".into(),
            query: "".into(),
            http_version: "HTTP/1.1".into(),
            status: Some(200),
            req_headers: vec![],
            resp_headers: vec![
                HeaderPair { name: "Content-Type".into(), value: "application/json".into() },
                HeaderPair { name: "Content-Encoding".into(), value: "gzip".into() },
            ],
            req_body: vec![],
            resp_body: gz_body,
            req_len: 0,
            resp_len: 32,
            duration_ms: Some(4),
            source: "browser".into(),
            truncated: false,
            in_scope: true,
        };
        store.insert_flow(&gz_flow).unwrap();
        let gz_detail = store.get_flow(&gz_flow.id).unwrap().unwrap();
        assert!(
            gz_detail.resp_preview.as_deref().unwrap().contains("gzipdecoded"),
            "preview should decode gzip: {:?}",
            gz_detail.resp_preview
        );
        let (found, _) = store
            .list_flows(
                &FlowQuery {
                    q: Some("gzipdecoded".into()),
                    ..FlowQuery::default()
                },
                &project.id,
            )
            .unwrap();
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].path, "/v1/gzip");

        let (items, total) = store
            .list_flows(
                &FlowQuery {
                    q: Some("host:api.example.test status:401 unauthorized".into()),
                    ..FlowQuery::default()
                },
                &project.id,
            )
            .unwrap();
        assert_eq!(total, 1);
        assert_eq!(items[0].method, "POST");
        assert_eq!(items[0].path, "/v1/login");

        let detail = store.get_flow(&flow.id).unwrap().unwrap();
        assert!(detail.req_preview.as_deref().unwrap().contains("password"));
        assert!(detail.req_blob.is_some());
    }
}
