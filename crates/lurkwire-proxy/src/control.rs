use std::sync::Arc;

use axum::body::Body;
use axum::extract::{Path, Query, State};
use axum::http::{header, HeaderMap, Request, StatusCode};
use axum::middleware::{self, Next};
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use futures_util::StreamExt;
use serde::Deserialize;
use subtle::ConstantTimeEq;
use tokio::net::TcpListener;
use tokio_stream::wrappers::BroadcastStream;

use crate::intercept::{Decision, ForwardEdit, InterceptConfig, PausedItem};
use crate::proxy::send_repeater;
use crate::types::{FlowQuery, Project, RepeaterSendRequest};
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
        .route("/flows/{id}", get(get_flow))
        .route("/flows/{id}/body/{which}", get(get_flow_body))
        .route("/events", get(events))
        .route("/repeater/send", post(repeater_send))
        .route("/intercept", get(get_intercept).put(put_intercept))
        .route("/intercept/queue", get(list_intercept_queue))
        .route("/intercept/queue/{id}", get(get_intercept_item))
        .route("/intercept/queue/{id}/forward", post(forward_intercept))
        .route("/intercept/queue/{id}/drop", post(drop_intercept))
        .layer(middleware::from_fn_with_state(state.clone(), require_token))
        .with_state(state)
}

#[derive(serde::Serialize)]
struct Health {
    ok: bool,
    product: &'static str,
    version: &'static str,
}

async fn health(State(state): State<Arc<AppState>>) -> Json<Health> {
    let _ = state;
    Json(Health {
        ok: true,
        product: "lurkwire-proxy",
        version: env!("CARGO_PKG_VERSION"),
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
}

impl From<anyhow::Error> for ApiError {
    fn from(err: anyhow::Error) -> Self {
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
