use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use anyhow::Result;
use serde::{Deserialize, Serialize};

use crate::guardrails::GuardError;
use crate::store::now_ms;
use crate::types::{HeaderPair, RepeaterSendRequest};
use crate::AppState;

const MARK: char = '§';
const DEFAULT_MAX: usize = 500;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AttackType {
    Sniper,
    Pitchfork,
    BatteringRam,
    ClusterBomb,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IntruderStart {
    pub project_id: Option<String>,
    pub method: String,
    pub url: String,
    pub headers: Vec<HeaderPair>,
    pub body: Option<String>,
    pub body_base64: Option<bool>,
    pub attack: AttackType,
    /// One wordlist per position for pitchfork. Sniper and battering ram use the first list.
    pub payloads: Vec<Vec<String>>,
    pub grep: Option<String>,
    pub max_requests: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IntruderResult {
    pub index: u32,
    pub position: Option<u32>,
    pub payload: String,
    pub status: Option<u16>,
    pub length: u64,
    pub duration_ms: u64,
    pub grep_hit: bool,
    pub flow_id: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum JobStatus {
    Running,
    Done,
    Stopped,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IntruderJob {
    pub id: String,
    pub status: JobStatus,
    pub attack: AttackType,
    pub total: u32,
    pub finished: u32,
    pub results: Vec<IntruderResult>,
    pub error: Option<String>,
    pub started_at: i64,
}

struct JobInner {
    snapshot: IntruderJob,
    cancel: Arc<AtomicBool>,
}

#[derive(Clone, Default)]
pub struct IntruderEngine {
    jobs: Arc<Mutex<HashMap<String, JobInner>>>,
}

impl IntruderEngine {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn get(&self, id: &str) -> Option<IntruderJob> {
        self.jobs
            .lock()
            .expect("intruder lock")
            .get(id)
            .map(|j| j.snapshot.clone())
    }

    pub fn list(&self) -> Vec<IntruderJob> {
        let mut jobs: Vec<_> = self
            .jobs
            .lock()
            .expect("intruder lock")
            .values()
            .map(|j| j.snapshot.clone())
            .collect();
        jobs.sort_by_key(|j| std::cmp::Reverse(j.started_at));
        jobs
    }

    pub fn stop(&self, id: &str) -> Option<IntruderJob> {
        let mut jobs = self.jobs.lock().expect("intruder lock");
        let job = jobs.get_mut(id)?;
        job.cancel.store(true, Ordering::SeqCst);
        if job.snapshot.status == JobStatus::Running {
            job.snapshot.status = JobStatus::Stopped;
        }
        Some(job.snapshot.clone())
    }

    fn upsert(&self, job: IntruderJob, cancel: Arc<AtomicBool>) {
        let mut jobs = self.jobs.lock().expect("intruder lock");
        jobs.insert(
            job.id.clone(),
            JobInner {
                snapshot: job,
                cancel,
            },
        );
    }

    fn patch(&self, id: &str, update: impl FnOnce(&mut IntruderJob)) {
        if let Some(job) = self.jobs.lock().expect("intruder lock").get_mut(id) {
            update(&mut job.snapshot);
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum Chunk {
    Lit(String),
    Pos(usize, String),
}

fn parse_marked(input: &str, start: usize) -> (Vec<Chunk>, usize) {
    let mut chunks = Vec::new();
    let mut lit = String::new();
    let mut iter = input.chars().peekable();
    let mut count = 0;
    while let Some(ch) = iter.next() {
        if ch == MARK {
            let mut inner = String::new();
            let mut found = false;
            while let Some(next) = iter.next() {
                if next == MARK {
                    found = true;
                    break;
                }
                inner.push(next);
            }
            if found {
                if !lit.is_empty() {
                    chunks.push(Chunk::Lit(std::mem::take(&mut lit)));
                }
                chunks.push(Chunk::Pos(start + count, inner));
                count += 1;
            } else {
                lit.push(MARK);
                lit.push_str(&inner);
            }
        } else {
            lit.push(ch);
        }
    }
    if !lit.is_empty() {
        chunks.push(Chunk::Lit(lit));
    }
    (chunks, count)
}

fn render(chunks: &[Chunk], values: &HashMap<usize, String>) -> String {
    let mut out = String::new();
    for chunk in chunks {
        match chunk {
            Chunk::Lit(s) => out.push_str(s),
            Chunk::Pos(i, base) => out.push_str(values.get(i).map(String::as_str).unwrap_or(base)),
        }
    }
    out
}

#[derive(Debug, Clone)]
struct Case {
    position: Option<u32>,
    payload: String,
    values: HashMap<usize, String>,
}

fn plan_cases(n: usize, bases: &[String], attack: AttackType, lists: &[Vec<String>], max: usize) -> Vec<Case> {
    if n == 0 {
        return Vec::new();
    }
    let primary = lists.first().cloned().unwrap_or_default();
    let mut cases = Vec::new();
    match attack {
        AttackType::Sniper => {
            for pos in 0..n {
                for word in &primary {
                    let mut values = HashMap::new();
                    for (i, base) in bases.iter().enumerate() {
                        values.insert(i, base.clone());
                    }
                    values.insert(pos, word.clone());
                    cases.push(Case {
                        position: Some(pos as u32),
                        payload: word.clone(),
                        values,
                    });
                    if cases.len() >= max {
                        return cases;
                    }
                }
            }
        }
        AttackType::BatteringRam => {
            for word in &primary {
                let mut values = HashMap::new();
                for i in 0..n {
                    values.insert(i, word.clone());
                }
                cases.push(Case {
                    position: None,
                    payload: word.clone(),
                    values,
                });
                if cases.len() >= max {
                    return cases;
                }
            }
        }
        AttackType::Pitchfork => {
            let lists: Vec<Vec<String>> = (0..n)
                .map(|i| lists.get(i).cloned().unwrap_or_else(|| primary.clone()))
                .collect();
            let rows = lists.iter().map(Vec::len).min().unwrap_or(0);
            for row in 0..rows {
                let mut values = HashMap::new();
                let mut labels = Vec::new();
                for (i, list) in lists.iter().enumerate() {
                    let word = list[row].clone();
                    labels.push(word.clone());
                    values.insert(i, word);
                }
                cases.push(Case {
                    position: None,
                    payload: labels.join(" | "),
                    values,
                });
                if cases.len() >= max {
                    return cases;
                }
            }
        }
        AttackType::ClusterBomb => {
            let lists: Vec<Vec<String>> = (0..n)
                .map(|i| lists.get(i).cloned().unwrap_or_else(|| primary.clone()))
                .collect();
            if lists.iter().any(|list| list.is_empty()) {
                return cases;
            }
            let mut acc: Vec<Vec<String>> = vec![Vec::new()];
            for list in &lists {
                let mut next = Vec::new();
                for prefix in &acc {
                    for word in list {
                        let mut row = prefix.clone();
                        row.push(word.clone());
                        next.push(row);
                        if next.len() >= max {
                            break;
                        }
                    }
                    if next.len() >= max {
                        break;
                    }
                }
                acc = next;
                if acc.len() >= max {
                    break;
                }
            }
            for row in acc {
                let mut values = HashMap::new();
                for (i, word) in row.iter().enumerate() {
                    values.insert(i, word.clone());
                }
                cases.push(Case {
                    position: None,
                    payload: row.join(" | "),
                    values,
                });
                if cases.len() >= max {
                    break;
                }
            }
        }
    }
    cases
}

pub fn start_job(state: Arc<AppState>, req: IntruderStart) -> Result<IntruderJob> {
    if state.kill.is_on() {
        return Err(GuardError::Killed.into());
    }
    let (url_chunks, n_url) = parse_marked(&req.url, 0);
    let mut headers_chunks = Vec::new();
    let mut offset = n_url;
    for header in &req.headers {
        let (chunks, n) = parse_marked(&header.value, offset);
        headers_chunks.push((header.name.clone(), chunks));
        offset += n;
    }
    let body_src = if req.body_base64.unwrap_or(false) {
        String::new()
    } else {
        req.body.clone().unwrap_or_default()
    };
    let (body_chunks, n_body) = parse_marked(&body_src, offset);
    let positions = offset + n_body;
    if positions == 0 {
        anyhow::bail!("mark at least one payload position with §value§");
    }
    let mut bases = vec![String::new(); positions];
    for chunk in url_chunks
        .iter()
        .chain(headers_chunks.iter().flat_map(|(_, c)| c.iter()))
        .chain(body_chunks.iter())
    {
        if let Chunk::Pos(i, base) = chunk {
            bases[*i] = base.clone();
        }
    }
    let max = req.max_requests.unwrap_or(DEFAULT_MAX as u32).min(5_000) as usize;
    let cases = plan_cases(positions, &bases, req.attack, &req.payloads, max);
    if cases.is_empty() {
        anyhow::bail!("payload list is empty");
    }
    let id = uuid::Uuid::new_v4().to_string();
    let cancel = Arc::new(AtomicBool::new(false));
    let job = IntruderJob {
        id: id.clone(),
        status: JobStatus::Running,
        attack: req.attack,
        total: cases.len() as u32,
        finished: 0,
        results: Vec::new(),
        error: None,
        started_at: now_ms(),
    };
    state.intruder.upsert(job.clone(), cancel.clone());
    let _ = state.store.append_audit(
        "intruder",
        "intruder.start",
        req.project_id.as_deref(),
        serde_json::json!({ "id": id, "attack": req.attack, "total": job.total }),
    );
    let state_run = state.clone();
    let req_run = req;
    tokio::spawn(async move {
        run_job(
            state_run,
            id,
            req_run,
            url_chunks,
            headers_chunks,
            body_chunks,
            cases,
            cancel,
        )
        .await;
    });
    Ok(job)
}

async fn run_job(
    state: Arc<AppState>,
    id: String,
    req: IntruderStart,
    url_chunks: Vec<Chunk>,
    headers_chunks: Vec<(String, Vec<Chunk>)>,
    body_chunks: Vec<Chunk>,
    cases: Vec<Case>,
    cancel: Arc<AtomicBool>,
) {
    let project_id = req
        .project_id
        .clone()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| state.default_project_id.clone());
    let method = req.method.clone();
    for (index, case) in cases.into_iter().enumerate() {
        if cancel.load(Ordering::SeqCst) || state.kill.is_on() {
            state.intruder.patch(&id, |job| {
                job.status = JobStatus::Stopped;
            });
            let _ = state.store.append_audit(
                "intruder",
                "intruder.stop",
                Some(&project_id),
                serde_json::json!({ "id": id, "reason": "stopped" }),
            );
            return;
        }
        let url = render(&url_chunks, &case.values);
        let headers: Vec<HeaderPair> = headers_chunks
            .iter()
            .map(|(name, chunks)| HeaderPair {
                name: name.clone(),
                value: render(chunks, &case.values),
            })
            .collect();
        let body = render(&body_chunks, &case.values);
        let result = fire_one(
            &state,
            &project_id,
            &method,
            &url,
            &headers,
            &body,
            index as u32,
            &case,
            req.grep.as_deref(),
            &cancel,
        )
        .await;
        state.intruder.patch(&id, |job| {
            job.finished += 1;
            job.results.push(result);
        });
    }
    state.intruder.patch(&id, |job| {
        if job.status == JobStatus::Running {
            job.status = JobStatus::Done;
        }
    });
    let _ = state.store.append_audit(
        "intruder",
        "intruder.done",
        Some(&project_id),
        serde_json::json!({ "id": id }),
    );
}

async fn fire_one(
    state: &AppState,
    project_id: &str,
    method: &str,
    url: &str,
    headers: &[HeaderPair],
    body: &str,
    index: u32,
    case: &Case,
    grep: Option<&str>,
    cancel: &AtomicBool,
) -> IntruderResult {
    let started = Instant::now();
    let failed = |error: String, duration_ms: u64| IntruderResult {
        index,
        position: case.position,
        payload: case.payload.clone(),
        status: None,
        length: 0,
        duration_ms,
        grep_hit: false,
        flow_id: None,
        error: Some(error),
    };
    let parsed = match url::Url::parse(url) {
        Ok(u) => u,
        Err(err) => return failed(err.to_string(), 0),
    };
    let host = parsed.host_str().unwrap_or("").to_string();
    let scheme = parsed.scheme();
    let port = parsed
        .port_or_known_default()
        .unwrap_or(if scheme == "https" { 443 } else { 80 });
    let path = if parsed.path().is_empty() {
        "/"
    } else {
        parsed.path()
    };
    let rules = state.store.list_scope_rules(project_id).unwrap_or_default();
    if !crate::scope::active_allowed(&rules, &host, port, path) {
        return failed(GuardError::OutOfScope.to_string(), 0);
    }
    let permit = match state
        .rate
        .acquire(&host, || cancel.load(Ordering::SeqCst) || state.kill.is_on())
        .await
    {
        Ok(permit) => permit,
        Err(err) => return failed(err.to_string(), started.elapsed().as_millis() as u64),
    };
    let send = RepeaterSendRequest {
        project_id: Some(project_id.to_string()),
        method: method.to_string(),
        url: url.to_string(),
        headers: headers.to_vec(),
        body: Some(body.to_string()),
        body_base64: Some(false),
        source: None,
    };
    match crate::proxy::send_active(state, send, "intruder", Some(permit)).await {
        Ok(sent) => {
            let text = String::from_utf8_lossy(&sent.resp_body);
            let grep_hit = grep
                .map(|g| !g.is_empty() && text.contains(g))
                .unwrap_or(false);
            IntruderResult {
                index,
                position: case.position,
                payload: case.payload.clone(),
                status: sent.detail.summary.status,
                length: sent.detail.summary.resp_len,
                duration_ms: sent.detail.summary.duration_ms.unwrap_or(0),
                grep_hit,
                flow_id: Some(sent.detail.summary.id),
                error: None,
            }
        }
        Err(err) => IntruderResult {
            index,
            position: case.position,
            payload: case.payload.clone(),
            status: None,
            length: 0,
            duration_ms: started.elapsed().as_millis() as u64,
            grep_hit: false,
            flow_id: None,
            error: Some(err.to_string()),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_positions() {
        let (chunks, n) = parse_marked("https://x/§id§/§name§", 0);
        assert_eq!(n, 2);
        let mut values = HashMap::new();
        values.insert(0, "1".into());
        values.insert(1, "a".into());
        assert_eq!(render(&chunks, &values), "https://x/1/a");
    }

    #[test]
    fn sniper_keeps_other_bases() {
        let cases = plan_cases(
            2,
            &["A".into(), "B".into()],
            AttackType::Sniper,
            &[vec!["x".into(), "y".into()]],
            100,
        );
        assert_eq!(cases.len(), 4);
        assert_eq!(cases[0].values.get(&0).unwrap(), "x");
        assert_eq!(cases[0].values.get(&1).unwrap(), "B");
        assert_eq!(cases[2].values.get(&0).unwrap(), "A");
        assert_eq!(cases[2].values.get(&1).unwrap(), "x");
    }

    #[test]
    fn battering_ram_fills_all() {
        let cases = plan_cases(
            2,
            &["A".into(), "B".into()],
            AttackType::BatteringRam,
            &[vec!["z".into()]],
            100,
        );
        assert_eq!(cases[0].values.get(&0).unwrap(), "z");
        assert_eq!(cases[0].values.get(&1).unwrap(), "z");
    }

    #[test]
    fn pitchfork_zips() {
        let cases = plan_cases(
            2,
            &["A".into(), "B".into()],
            AttackType::Pitchfork,
            &[vec!["1".into(), "2".into()], vec!["a".into(), "b".into()]],
            100,
        );
        assert_eq!(cases.len(), 2);
        assert_eq!(cases[1].values.get(&0).unwrap(), "2");
        assert_eq!(cases[1].values.get(&1).unwrap(), "b");
    }
    #[test]
    fn cluster_bomb_is_cartesian() {
        let cases = plan_cases(
            2,
            &["A".into(), "B".into()],
            AttackType::ClusterBomb,
            &[vec!["1".into(), "2".into()], vec!["a".into(), "b".into()]],
            100,
        );
        assert_eq!(cases.len(), 4);
        assert_eq!(cases[0].payload, "1 | a");
        assert_eq!(cases[3].payload, "2 | b");
        assert_eq!(cases[3].values.get(&0).unwrap(), "2");
        assert_eq!(cases[3].values.get(&1).unwrap(), "b");
    }
}
