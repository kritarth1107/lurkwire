use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use anyhow::{Context, Result};
use rusqlite::{params, Connection, OptionalExtension};
use sha2::{Digest, Sha256};

use crate::types::{
    url_from_parts, FlowDetail, FlowQuery, FlowSummary, HeaderPair, Project, PREVIEW_CHARS,
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
        let version: Option<String> = conn
            .query_row(
                "SELECT value FROM meta WHERE key = 'schema_version'",
                [],
                |row| row.get(0),
            )
            .optional()?;
        if version.is_none() {
            conn.execute(
                "INSERT INTO meta(key, value) VALUES ('schema_version', '1')",
                [],
            )?;
        }
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
                ?18, ?19, ?20, 1, ?21, ?22, ''
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
                if flow.truncated { 1 } else { 0 },
                tags,
            ],
        )?;
        let req_text = indexable_text(&flow.req_body, content_type(&flow.req_headers).as_deref());
        let resp_text = indexable_text(&flow.resp_body, mime.as_deref());
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
            in_scope: true,
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
            .and_then(|b| preview_text(&b));
        let resp_preview = resp_blob
            .as_ref()
            .and_then(|h| self.get_blob(h).ok())
            .and_then(|b| preview_text(&b));
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

fn content_type(headers: &[HeaderPair]) -> Option<String> {
    headers
        .iter()
        .find(|h| h.name.eq_ignore_ascii_case("content-type"))
        .map(|h| h.value.clone())
}

fn indexable_text(bytes: &[u8], content_type: Option<&str>) -> String {
    if let Some(ct) = content_type {
        let ct = ct.to_ascii_lowercase();
        if ct.contains("image/")
            || ct.contains("octet-stream")
            || ct.contains("font/")
            || ct.contains("video/")
            || ct.contains("audio/")
            || ct.contains("zip")
            || ct.contains("wasm")
        {
            return String::new();
        }
    }
    let slice = &bytes[..bytes.len().min(MAX_INDEX_CHARS)];
    if slice.contains(&0) {
        return String::new();
    }
    String::from_utf8_lossy(slice).into_owned()
}

fn preview_text(bytes: &[u8]) -> Option<String> {
    if bytes.is_empty() {
        return None;
    }
    let slice = &bytes[..bytes.len().min(PREVIEW_CHARS)];
    if slice.contains(&0) {
        return None;
    }
    Some(String::from_utf8_lossy(slice).into_owned())
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
        };
        store.insert_flow(&flow).unwrap();

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
