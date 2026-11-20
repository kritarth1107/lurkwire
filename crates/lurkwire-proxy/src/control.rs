use std::sync::Arc;

use axum::body::Body;
use axum::extract::{Path, Query, State};
use axum::http::{header, HeaderMap, Request, StatusCode};
use axum::middleware::{self, Next};
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::{IntoResponse, Response};
use axum::routing::{delete, get, patch, post};
use axum::{Json, Router};
use futures_util::StreamExt;
use serde::Deserialize;
use subtle::ConstantTimeEq;
use tokio::net::TcpListener;
use tokio_stream::wrappers::BroadcastStream;

use crate::guardrails::GuardError;
use crate::intercept::{Decision, ForwardEdit, InterceptConfig, PausedItem};
use crate::intruder::{self, IntruderJob, IntruderStart};
use crate::proxy::send_repeater;
use crate::scope::{NewScopeRule, ScopeKind, ScopeRule};
use crate::store::AuditEntry;
use crate::types::{Finding, FindingQuery, FlowQuery, Project, RepeaterSendRequest};
use crate::AppState;

pub async fn run_control(listener: TcpListener, state: Arc<AppState>) -> anyhow::Result<()> {
    let app = router(state);
    axum::serve(listener, app).await?;
    Ok(())
}

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/meta", get(meta))
        .route("/ca.pem", get(ca_pem))
        .route("/projects", get(list_projects).post(create_project))
        .route("/flows", get(list_flows))
        .route("/flows/{id}", get(get_flow).patch(patch_flow))
        .route("/flows/{id}/body/{which}", get(get_flow_body))
        .route("/events", get(events))
        .route("/repeater/send", post(repeater_send))
        .route("/intercept", get(get_intercept).put(put_intercept))
        .route("/intercept/queue", get(list_intercept_queue))
        .route("/intercept/queue/{id}", get(get_intercept_item))
        .route("/intercept/queue/{id}/forward", post(forward_intercept))
        .route("/intercept/queue/{id}/drop", post(drop_intercept))
        .route("/kill", get(get_kill).post(post_kill))
        .route("/kill/resume", post(resume_kill))
        .route("/scope", get(list_scope).post(add_scope).put(replace_scope))
        .route("/scope/{id}", delete(delete_scope))
        .route("/audit", get(list_audit))
        .route("/intruder", get(list_intruder).post(start_intruder))
        .route("/findings", get(list_findings))
        .route("/findings/{id}", get(get_finding))
        .route("/intruder/{id}", get(get_intruder))
        .route("/intruder/{id}/stop", post(stop_intruder))
        .layer(middleware::from_fn_with_state(state.clone(), require_token))
        .with_state(state)
}

#[derive(serde::Serialize)]
struct Health {
    ok: bool,
    product: &'static str,
    version: &'static str,
    killed: bool,
}

async fn health(State(state): State<Arc<AppState>>) -> Json<Health> {
    Json(Health {
        ok: !state.kill.is_on(),
        product: "lurkwire-proxy",
        version: env!("CARGO_PKG_VERSION"),
        killed: state.kill.is_on(),
    })
}

#[derive(serde::Serialize)]
struct Meta {
    ok: bool,
    proxy_listen: String,
    control_listen: String,
    ca_path: String,
    ca_fingerprint_sha256: String,
    default_project_id: String,
}

async fn meta(State(state): State<Arc<AppState>>) -> Json<Meta> {
    Json(Meta {
        ok: true,
        proxy_listen: state.proxy_addr.to_string(),
        control_listen: state.control_addr.to_string(),
        ca_path: state.ca.cert_path.display().to_string(),
        ca_fingerprint_sha256: state.ca.fingerprint_sha256.clone(),
        default_project_id: state.default_project_id.clone(),
    })
}

async fn ca_pem(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    (
        [(header::CONTENT_TYPE, "application/x-pem-file")],
        state.ca.cert_pem.clone(),
    )
}

async fn list_projects(State(state): State<Arc<AppState>>) -> Result<Json<Vec<Project>>, ApiError> {
    Ok(Json(state.store.list_projects()?))
}

#[derive(Deserialize)]
struct NewProject {
    name: String,
}

async fn create_project(
    State(state): State<Arc<AppState>>,
    Json(body): Json<NewProject>,
) -> Result<(StatusCode, Json<Project>), ApiError> {
    let project = state.store.create_project(&body.name)?;
    Ok((StatusCode::CREATED, Json(project)))
}

#[derive(serde::Serialize)]
struct FlowList {
    items: Vec<crate::types::FlowSummary>,
    total: i64,
}

async fn list_flows(
    State(state): State<Arc<AppState>>,
    Query(query): Query<FlowQuery>,
) -> Result<Json<FlowList>, ApiError> {
    let (items, total) = state.store.list_flows(&query, &state.default_project_id)?;
    Ok(Json(FlowList { items, total }))
}

async fn get_flow(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<crate::types::FlowDetail>, ApiError> {
    state
        .store
        .get_flow(&id)?
        .map(Json)
        .ok_or_else(|| ApiError::not_found("flow not found"))
}

async fn patch_flow(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(body): Json<crate::types::FlowAnnotation>,
) -> Result<Json<crate::types::FlowDetail>, ApiError> {
    state
        .store
        .update_flow_annotation(&id, body.note.as_deref(), body.tags.as_deref())?
        .map(Json)
        .ok_or_else(|| ApiError::not_found("flow not found"))
}

async fn get_flow_body(
    State(state): State<Arc<AppState>>,
    Path((id, which)): Path<(String, String)>,
) -> Result<Response, ApiError> {
    let flow = state
        .store
        .get_flow(&id)?
        .ok_or_else(|| ApiError::not_found("flow not found"))?;
    let (hash, mime) = match which.as_str() {
        "req" | "request" => (flow.req_blob, content_type(&flow.req_headers)),
        "resp" | "response" => (flow.resp_blob, flow.summary.mime.clone()),
        _ => return Err(ApiError::bad_request("which must be req or resp")),
    };
    let Some(hash) = hash else {
        return Err(ApiError::not_found("no body stored"));
    };
    let bytes = state.store.get_blob(&hash)?;
    let mime = mime.unwrap_or_else(|| "application/octet-stream".to_string());
    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, mime)
        .body(Body::from(bytes))
        .expect("body response"))
}

async fn events(
    State(state): State<Arc<AppState>>,
) -> Sse<impl futures_util::Stream<Item = Result<Event, std::convert::Infallible>>> {
    let rx = state.events.subscribe();
    let stream = BroadcastStream::new(rx).filter_map(|item| async move {
        match item {
            Ok(event) => match serde_json::to_string(&event) {
                Ok(json) => {
                    let name = event
                        .get("kind")
                        .and_then(|v| v.as_str())
                        .unwrap_or("event");
                    Some(Ok(Event::default().event(name).data(json)))
                }
                Err(_) => None,
            },
            Err(_) => None,
        }
    });
    Sse::new(stream).keep_alive(KeepAlive::default())
}

async fn repeater_send(
    State(state): State<Arc<AppState>>,
    Json(body): Json<RepeaterSendRequest>,
) -> Result<Json<crate::types::FlowDetail>, ApiError> {
    let detail = send_repeater(&state, body).await?;
    Ok(Json(detail))
}

#[derive(serde::Serialize)]
struct InterceptState {
    config: InterceptConfig,
    queue: Vec<PausedItem>,
}

async fn get_intercept(State(state): State<Arc<AppState>>) -> Json<InterceptState> {
    Json(InterceptState {
        config: state.intercept.config(),
        queue: state.intercept.queue(),
    })
}

async fn put_intercept(
    State(state): State<Arc<AppState>>,
    Json(body): Json<InterceptConfig>,
) -> Json<InterceptState> {
    let config = state.intercept.set_config(body);
    Json(InterceptState {
        config,
        queue: state.intercept.queue(),
    })
}

async fn list_intercept_queue(State(state): State<Arc<AppState>>) -> Json<Vec<PausedItem>> {
    Json(state.intercept.queue())
}

async fn get_intercept_item(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<PausedItem>, ApiError> {
    state
        .intercept
        .get(&id)
        .map(Json)
        .ok_or_else(|| ApiError::not_found("paused item not found"))
}

async fn forward_intercept(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(body): Json<ForwardEdit>,
) -> Result<StatusCode, ApiError> {
    state.intercept.decide(&id, Decision::Forward(body))?;
    Ok(StatusCode::NO_CONTENT)
}

async fn drop_intercept(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    state.intercept.decide(&id, Decision::Drop)?;
    Ok(StatusCode::NO_CONTENT)
}

fn content_type(headers: &[crate::types::HeaderPair]) -> Option<String> {
    headers
        .iter()
        .find(|h| h.name.eq_ignore_ascii_case("content-type"))
        .map(|h| h.value.clone())
}

async fn require_token(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    request: Request<Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    let provided = headers
        .get("x-lurkwire-token")
        .and_then(|v| v.to_str().ok())
        .map(ToOwned::to_owned)
        .or_else(|| {
            headers
                .get(header::AUTHORIZATION)
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.strip_prefix("Bearer "))
                .map(ToOwned::to_owned)
        });
    match provided {
        Some(token) if tokens_equal(&token, &state.auth_token) => Ok(next.run(request).await),
        _ => Err(StatusCode::UNAUTHORIZED),
    }
}

fn tokens_equal(a: &str, b: &str) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.as_bytes().ct_eq(b.as_bytes()).into()
}



async fn list_findings(
    State(state): State<Arc<AppState>>,
    Query(query): Query<FindingQuery>,
) -> Result<Json<FindingList>, ApiError> {
    let (items, total) = state
        .store
        .list_findings(&query, &state.default_project_id)?;
    Ok(Json(FindingList { items, total }))
}

async fn get_finding(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<Finding>, ApiError> {
    state
        .store
        .get_finding(&id)?
        .map(Json)
        .ok_or_else(|| ApiError::not_found("finding not found"))
}

#[derive(serde::Serialize)]
struct FindingList {
    items: Vec<Finding>,
    total: u32,
}

async fn start_intruder(
    State(state): State<Arc<AppState>>,
    Json(body): Json<IntruderStart>,
) -> Result<Json<IntruderJob>, ApiError> {
    let job = intruder::start_job(state, body)?;
    Ok(Json(job))
}

async fn list_intruder(State(state): State<Arc<AppState>>) -> Json<Vec<IntruderJob>> {
    Json(state.intruder.list())
}

async fn get_intruder(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<IntruderJob>, ApiError> {
    state
        .intruder
        .get(&id)
        .map(Json)
        .ok_or_else(|| ApiError::not_found("intruder job not found"))
}

async fn stop_intruder(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<IntruderJob>, ApiError> {
    state
        .intruder
        .stop(&id)
        .map(Json)
        .ok_or_else(|| ApiError::not_found("intruder job not found"))
}

pub struct ApiError {
    status: StatusCode,
    message: String,
}

impl ApiError {
    fn not_found(message: &str) -> Self {
        Self {
            status: StatusCode::NOT_FOUND,
            message: message.to_string(),
        }
    }

    fn bad_request(message: &str) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            message: message.to_string(),
        }
    }

    fn forbidden(message: &str) -> Self {
        Self {
            status: StatusCode::FORBIDDEN,
            message: message.to_string(),
        }
    }

    fn conflict(message: &str, status: StatusCode) -> Self {
        Self {
            status,
            message: message.to_string(),
        }
    }
}

impl From<GuardError> for ApiError {
    fn from(err: GuardError) -> Self {
        match err {
            GuardError::Killed | GuardError::OutOfScope => ApiError::forbidden(&err.to_string()),
            GuardError::RateLimited => {
                ApiError::conflict(&err.to_string(), StatusCode::TOO_MANY_REQUESTS)
            }
        }
    }
}

impl From<anyhow::Error> for ApiError {
    fn from(err: anyhow::Error) -> Self {
        if let Some(guard) = err.downcast_ref::<GuardError>() {
            return ApiError::from(match guard {
                GuardError::Killed => GuardError::Killed,
                GuardError::OutOfScope => GuardError::OutOfScope,
                GuardError::RateLimited => GuardError::RateLimited,
            });
        }
        tracing::warn!(error = %err, "control API error");
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            message: err.to_string(),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let body = serde_json::json!({ "error": self.message });
        (self.status, Json(body)).into_response()
    }
}

#[derive(serde::Serialize)]
struct KillState {
    killed: bool,
}

async fn get_kill(State(state): State<Arc<AppState>>) -> Json<KillState> {
    Json(KillState {
        killed: state.kill.is_on(),
    })
}

async fn post_kill(State(state): State<Arc<AppState>>) -> Json<KillState> {
    state.kill.set(true);
    let _ = state.store.append_audit(
        "operator",
        "kill",
        None,
        serde_json::json!({ "killed": true }),
    );
    let _ = state
        .events
        .send(serde_json::json!({ "kind": "kill", "killed": true }));
    Json(KillState { killed: true })
}

async fn resume_kill(State(state): State<Arc<AppState>>) -> Json<KillState> {
    state.kill.set(false);
    let _ = state.store.append_audit(
        "operator",
        "resume",
        None,
        serde_json::json!({ "killed": false }),
    );
    let _ = state
        .events
        .send(serde_json::json!({ "kind": "kill", "killed": false }));
    Json(KillState { killed: false })
}

#[derive(Deserialize)]
struct ProjectQuery {
    project_id: Option<String>,
}

fn project_id_or_default(state: &AppState, project_id: Option<String>) -> String {
    project_id
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| state.default_project_id.clone())
}

async fn list_scope(
    State(state): State<Arc<AppState>>,
    Query(query): Query<ProjectQuery>,
) -> Result<Json<Vec<ScopeRule>>, ApiError> {
    let project_id = project_id_or_default(&state, query.project_id);
    Ok(Json(state.store.list_scope_rules(&project_id)?))
}

async fn add_scope(
    State(state): State<Arc<AppState>>,
    Json(body): Json<NewScopeRule>,
) -> Result<Json<ScopeRule>, ApiError> {
    let host = body.host.trim().to_string();
    if host.is_empty() {
        return Err(ApiError::bad_request("host is required"));
    }
    let rule = ScopeRule {
        id: uuid::Uuid::new_v4().to_string(),
        project_id: project_id_or_default(&state, body.project_id),
        enabled: body.enabled.unwrap_or(true),
        kind: body.kind,
        host,
        port: body.port,
        path_prefix: body
            .path_prefix
            .unwrap_or_else(|| "/".into())
            .trim()
            .to_string(),
        created_at: crate::store::now_ms(),
    };
    state.store.add_scope_rule(&rule)?;
    let _ = state.store.append_audit(
        "operator",
        "scope.rule_add",
        Some(&rule.project_id),
        serde_json::json!({ "id": rule.id, "kind": kind_json(&rule.kind), "host": rule.host }),
    );
    Ok(Json(rule))
}

#[derive(Deserialize)]
struct ReplaceScope {
    project_id: Option<String>,
    rules: Vec<NewScopeRule>,
}

async fn replace_scope(
    State(state): State<Arc<AppState>>,
    Json(body): Json<ReplaceScope>,
) -> Result<Json<Vec<ScopeRule>>, ApiError> {
    let project_id = project_id_or_default(&state, body.project_id);
    let mut rules = Vec::new();
    for item in body.rules {
        let host = item.host.trim().to_string();
        if host.is_empty() {
            return Err(ApiError::bad_request("host is required"));
        }
        rules.push(ScopeRule {
            id: uuid::Uuid::new_v4().to_string(),
            project_id: project_id.clone(),
            enabled: item.enabled.unwrap_or(true),
            kind: item.kind,
            host,
            port: item.port,
            path_prefix: item
                .path_prefix
                .unwrap_or_else(|| "/".into())
                .trim()
                .to_string(),
            created_at: crate::store::now_ms(),
        });
    }
    state.store.replace_scope_rules(&project_id, &rules)?;
    let _ = state.store.append_audit(
        "operator",
        "scope.replace",
        Some(&project_id),
        serde_json::json!({ "count": rules.len() }),
    );
    Ok(Json(rules))
}

async fn delete_scope(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let existing = state.store.get_scope_rule(&id)?;
    if !state.store.delete_scope_rule(&id)? {
        return Err(ApiError::not_found("scope rule not found"));
    }
    if let Some(rule) = existing {
        let _ = state.store.append_audit(
            "operator",
            "scope.rule_delete",
            Some(&rule.project_id),
            serde_json::json!({ "id": rule.id, "host": rule.host }),
        );
    }
    Ok(Json(serde_json::json!({ "ok": true })))
}

#[derive(Deserialize)]
struct AuditQuery {
    project_id: Option<String>,
    limit: Option<u32>,
    offset: Option<u32>,
}

async fn list_audit(
    State(state): State<Arc<AppState>>,
    Query(query): Query<AuditQuery>,
) -> Result<Json<Vec<AuditEntry>>, ApiError> {
    let limit = query.limit.unwrap_or(200).min(1000);
    let offset = query.offset.unwrap_or(0);
    Ok(Json(state.store.list_audit(
        query.project_id.as_deref(),
        limit,
        offset,
    )?))
}

fn kind_json(kind: &ScopeKind) -> &'static str {
    match kind {
        ScopeKind::Include => "include",
        ScopeKind::Exclude => "exclude",
    }
}
