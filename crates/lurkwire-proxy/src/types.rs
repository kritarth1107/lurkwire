use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeaderPair {
    pub name: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlowSummary {
    pub id: String,
    pub project_id: String,
    pub ts: i64,
    pub method: String,
    pub scheme: String,
    pub host: String,
    pub port: u16,
    pub path: String,
    pub query: String,
    pub url: String,
    pub http_version: String,
    pub status: Option<u16>,
    pub req_len: u64,
    pub resp_len: u64,
    pub duration_ms: Option<u64>,
    pub source: String,
    pub mime: Option<String>,
    pub in_scope: bool,
    pub truncated: bool,
    pub tags: Vec<String>,
    pub note: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlowDetail {
    #[serde(flatten)]
    pub summary: FlowSummary,
    pub req_headers: Vec<HeaderPair>,
    pub resp_headers: Vec<HeaderPair>,
    pub req_blob: Option<String>,
    pub resp_blob: Option<String>,
    pub req_preview: Option<String>,
    pub resp_preview: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlowEvent {
    pub kind: String,
    pub flow: FlowSummary,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct FlowAnnotation {
    pub note: Option<String>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct FlowQuery {
    pub project_id: Option<String>,
    pub q: Option<String>,
    pub method: Option<String>,
    pub host: Option<String>,
    pub status: Option<u16>,
    pub status_min: Option<u16>,
    pub status_max: Option<u16>,
    pub source: Option<String>,
    pub hide_static: Option<bool>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepeaterSendRequest {
    pub project_id: Option<String>,
    pub method: String,
    pub url: String,
    pub headers: Vec<HeaderPair>,
    pub body: Option<String>,
    pub body_base64: Option<bool>,
}

pub fn url_from_parts(scheme: &str, host: &str, port: u16, path: &str, query: &str) -> String {
    let default_port = matches!((scheme, port), ("http", 80) | ("https", 443));
    let authority = if host.contains(':') && !host.starts_with('[') {
        format!("[{host}]")
    } else {
        host.to_string()
    };
    let hostport = if default_port {
        authority
    } else {
        format!("{authority}:{port}")
    };
    if query.is_empty() {
        format!("{scheme}://{hostport}{path}")
    } else {
        format!("{scheme}://{hostport}{path}?{query}")
    }
}

pub const PREVIEW_CHARS: usize = 8 * 1024;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    Info,
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FindingDraft {
    pub project_id: String,
    pub flow_id: String,
    pub check_id: String,
    pub title: String,
    pub severity: Severity,
    pub detail: String,
    pub evidence: String,
    pub host: String,
    pub path: String,
    pub method: String,
    pub status: Option<u16>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Finding {
    pub id: String,
    pub project_id: String,
    pub flow_id: Option<String>,
    pub ts: i64,
    pub check_id: String,
    pub title: String,
    pub severity: Severity,
    pub detail: String,
    pub evidence: String,
    pub host: String,
    pub path: String,
    pub method: String,
    pub status: Option<u16>,
    pub count: u32,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct FindingQuery {
    pub project_id: Option<String>,
    pub q: Option<String>,
    pub severity: Option<String>,
    pub check_id: Option<String>,
    pub host: Option<String>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

