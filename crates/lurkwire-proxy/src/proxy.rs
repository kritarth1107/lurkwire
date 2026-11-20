use std::convert::Infallible;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Instant;

use anyhow::{Context, Result};
use bytes::Bytes;
use futures_util::StreamExt;
use http_body_util::{combinators::BoxBody, BodyExt, Empty, Full, StreamBody};
use hyper::body::{Frame, Incoming};
use hyper::service::service_fn;
use hyper::{Method, Request, Response, StatusCode};
use hyper_util::client::legacy::Client;
use hyper_util::rt::{TokioExecutor, TokioIo};
use rustls::ClientConfig;
use rustls::RootCertStore;
use rustls_pki_types::CertificateDer;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::oneshot;
use tokio_stream::wrappers::ReceiverStream;

use crate::intercept::{decode_edit_body, Decision};
use crate::store::{now_ms, NewFlow};
use crate::types::{HeaderPair, RepeaterSendRequest};
use crate::AppState;

const MAX_STORED_BODY: usize = 8 * 1024 * 1024;
const HOP_BY_HOP: &[&str] = &[
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
    "proxy-connection",
];

pub type HttpsClient = Client<
    hyper_rustls::HttpsConnector<hyper_util::client::legacy::connect::HttpConnector>,
    Full<Bytes>,
>;

pub fn build_client(extra_roots: &[CertificateDer<'static>]) -> Result<HttpsClient> {
    let mut roots = RootCertStore::empty();
    roots.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
    for cert in extra_roots {
        roots
            .add(cert.clone())
            .map_err(|err| anyhow::anyhow!("add extra root: {err}"))?;
    }
    let tls = ClientConfig::builder()
        .with_root_certificates(roots)
        .with_no_client_auth();

    let mut http = hyper_util::client::legacy::connect::HttpConnector::new();
    http.enforce_http(false);
    http.set_nodelay(true);

    let https = hyper_rustls::HttpsConnectorBuilder::new()
        .with_tls_config(tls)
        .https_or_http()
        .enable_http1()
        .wrap_connector(http);

    Ok(Client::builder(TokioExecutor::new()).build(https))
}

pub async fn run_proxy(listener: TcpListener, state: Arc<AppState>) -> Result<()> {
    tracing::info!(addr = %listener.local_addr()?, "proxy listening");
    loop {
        let (stream, peer) = listener.accept().await?;
        let state = state.clone();
        tokio::spawn(async move {
            if let Err(err) = handle_client(stream, peer, state).await {
                tracing::debug!(%peer, error = %err, "proxy connection closed");
            }
        });
    }
}

async fn handle_client(stream: TcpStream, _peer: SocketAddr, state: Arc<AppState>) -> Result<()> {
    let io = TokioIo::new(stream);
    let service = service_fn(move |req| {
        let state = state.clone();
        async move { dispatch(req, state).await }
    });
    hyper::server::conn::http1::Builder::new()
        .preserve_header_case(true)
        .title_case_headers(true)
        .serve_connection(io, service)
        .with_upgrades()
        .await
        .context("serve proxy connection")?;
    Ok(())
}

async fn dispatch(
    req: Request<Incoming>,
    state: Arc<AppState>,
) -> Result<Response<BoxBody<Bytes, std::io::Error>>, Infallible> {
    if state.kill.is_on() {
        return Ok(error_response(
            StatusCode::FORBIDDEN,
            anyhow::anyhow!("kill switch is on"),
        ));
    }
    if req.method() == Method::CONNECT {
        return Ok(handle_connect(req, state));
    }
    match intercept(req, None, "browser", state).await {
        Ok(resp) => Ok(resp),
        Err(err) => Ok(error_response(StatusCode::BAD_GATEWAY, err)),
    }
}

fn handle_connect(
    req: Request<Incoming>,
    state: Arc<AppState>,
) -> Response<BoxBody<Bytes, std::io::Error>> {
    let Some(authority) = req.uri().authority().map(|a| a.to_string()) else {
        return error_response(
            StatusCode::BAD_REQUEST,
            anyhow::anyhow!("CONNECT missing authority"),
        );
    };
    tokio::spawn(async move {
        match hyper::upgrade::on(req).await {
            Ok(upgraded) => {
                if let Err(err) = mitm_connect(upgraded, authority, state).await {
                    tracing::debug!(error = %err, "mitm session ended");
                }
            }
            Err(err) => tracing::warn!(error = %err, "CONNECT upgrade failed"),
        }
    });
    Response::builder()
        .status(StatusCode::OK)
        .body(empty_body())
        .expect("connect response")
}

async fn mitm_connect(
    upgraded: hyper::upgrade::Upgraded,
    authority: String,
    state: Arc<AppState>,
) -> Result<()> {
    let (host, port) = split_host_port(&authority, 443);
    let server_config = state.ca.server_config_for(&host)?;
    let acceptor = tokio_rustls::TlsAcceptor::from(server_config);
    let io = TokioIo::new(upgraded);
    let tls = acceptor
        .accept(io)
        .await
        .context("TLS handshake with client")?;
    let io = TokioIo::new(tls);
    let target = Target {
        scheme: "https".to_string(),
        host,
        port,
    };
    let service = service_fn(move |req| {
        let state = state.clone();
        let target = target.clone();
        async move {
            match intercept(req, Some(target), "browser", state).await {
                Ok(resp) => Ok::<_, Infallible>(resp),
                Err(err) => Ok(error_response(StatusCode::BAD_GATEWAY, err)),
            }
        }
    });
    hyper::server::conn::http1::Builder::new()
        .preserve_header_case(true)
        .title_case_headers(true)
        .serve_connection(io, service)
        .with_upgrades()
        .await
        .context("serve intercepted TLS connection")?;
    Ok(())
}

#[derive(Clone)]
struct Target {
    scheme: String,
    host: String,
    port: u16,
}

async fn intercept(
    req: Request<Incoming>,
    forced: Option<Target>,
    source: &str,
    state: Arc<AppState>,
) -> Result<Response<BoxBody<Bytes, std::io::Error>>> {
    let target = match forced {
        Some(t) => t,
        None => target_from_request(&req)?,
    };
    let mut method = req.method().clone();
    let version = req.version();
    let path_and_query = req
        .uri()
        .path_and_query()
        .map(|pq| pq.as_str().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "/".to_string());
    let (mut path, mut query) = split_path_query(&path_and_query);
    let mut req_headers = headers_from(req.headers());
    let mut req_body = req
        .into_body()
        .collect()
        .await
        .context("read request body")?
        .to_bytes();
    if req_body.len() > MAX_STORED_BODY * 2 {
        anyhow::bail!("request body too large");
    }
    let mut target = target;

    if state.intercept.should_pause_request() {
        let url =
            crate::types::url_from_parts(&target.scheme, &target.host, target.port, &path, &query);
        match state
            .intercept
            .pause_request(
                method.as_str(),
                &url,
                &req_headers,
                &req_body,
                &state.events,
            )
            .await
        {
            Decision::Drop => {
                return Ok(error_response(
                    StatusCode::FORBIDDEN,
                    anyhow::anyhow!("dropped by intercept"),
                ));
            }
            Decision::Forward(edit) => {
                if let Some(next_method) = edit.method.as_ref() {
                    method = next_method.parse().context("invalid intercepted method")?;
                }
                if let Some(next_url) = edit.url.as_ref() {
                    let parsed = apply_url_override(&target, &path, &query, next_url)?;
                    target = parsed.0;
                    path = parsed.1;
                    query = parsed.2;
                }
                if let Some(headers) = edit.headers.clone() {
                    req_headers = headers;
                }
                req_body = Bytes::from(decode_edit_body(&edit, &req_body)?);
            }
        }
    }

    let upstream_uri =
        crate::types::url_from_parts(&target.scheme, &target.host, target.port, &path, &query);
    let mut builder = Request::builder()
        .method(method.clone())
        .uri(&upstream_uri)
        .version(version);
    copy_forward_headers(
        builder.headers_mut().expect("headers"),
        &req_headers,
        &target,
    );
    if !req_body.is_empty() {
        builder = builder.header(hyper::header::CONTENT_LENGTH, req_body.len().to_string());
    }
    let upstream_req = builder
        .body(Full::new(req_body.clone()))
        .context("build upstream request")?;

    let started = Instant::now();
    let ts = now_ms();
    let upstream = state
        .client
        .request(upstream_req)
        .await
        .with_context(|| format!("upstream {upstream_uri}"))?;

    let mut status = upstream.status();
    let resp_version = upstream.version();
    let mut resp_headers = headers_from(upstream.headers());

    let (store_tx, store_rx) = oneshot::channel();
    let client_body: BoxBody<Bytes, std::io::Error>;

    if state.intercept.should_pause_response() {
        let resp_bytes = upstream
            .into_body()
            .collect()
            .await
            .context("read intercepted response")?
            .to_bytes();
        let mut resp_body = resp_bytes.to_vec();
        match state
            .intercept
            .pause_response(
                method.as_str(),
                &upstream_uri,
                &resp_headers,
                &resp_body,
                status.as_u16(),
                &state.events,
            )
            .await
        {
            Decision::Drop => {
                return Ok(error_response(
                    StatusCode::FORBIDDEN,
                    anyhow::anyhow!("response dropped by intercept"),
                ));
            }
            Decision::Forward(edit) => {
                if let Some(code) = edit.status {
                    status = StatusCode::from_u16(code).unwrap_or(status);
                }
                if let Some(headers) = edit.headers.clone() {
                    resp_headers = headers;
                }
                resp_body = decode_edit_body(&edit, &resp_body)?;
            }
        }
        set_content_length(&mut resp_headers, resp_body.len());
        let len = resp_body.len() as u64;
        let _ = store_tx.send((resp_body.clone(), len, false));
        client_body = full_body(Bytes::from(resp_body));
    } else {
        client_body = tee_body(upstream.into_body(), MAX_STORED_BODY, store_tx);
    }

    let flow_id = uuid::Uuid::new_v4().to_string();
    let project_id = state.default_project_id.clone();
    let method_s = method.as_str().to_string();
    let http_version = format!("{version:?}").replace("HTTP_", "HTTP/");
    let source = source.to_string();
    let state_store = state.clone();
    let target_clone = target.clone();
    let path_clone = path.clone();
    let query_clone = query.clone();
    let req_headers_clone = req_headers.clone();
    let resp_headers_clone = resp_headers.clone();
    let req_len = req_body.len() as u64;
    let req_body_stored = truncate_body(&req_body);
    let status_code = status.as_u16();

    tokio::spawn(async move {
        let (resp_stored, resp_len, truncated_resp) = match store_rx.await {
            Ok(body) => body,
            Err(_) => return,
        };
        let truncated = req_body_stored.1 || truncated_resp;
        let rules = state_store
            .store
            .list_scope_rules(&project_id)
            .unwrap_or_default();
        let in_scope =
            crate::scope::is_in_scope(&rules, &target_clone.host, target_clone.port, &path_clone);
        let flow = NewFlow {
            id: flow_id,
            project_id,
            ts,
            method: method_s,
            scheme: target_clone.scheme,
            host: target_clone.host,
            port: target_clone.port,
            path: path_clone,
            query: query_clone,
            http_version,
            status: Some(status_code),
            req_headers: req_headers_clone,
            resp_headers: resp_headers_clone,
            req_body: req_body_stored.0,
            resp_body: resp_stored,
            req_len,
            resp_len,
            duration_ms: Some(started.elapsed().as_millis() as u64),
            source,
            truncated,
            in_scope,
        };
        match state_store.store.insert_flow(&flow) {
            Ok(summary) => {
                let _ = state_store.events.send(serde_json::json!({
                    "kind": "flow",
                    "flow": summary,
                }));
            }
            Err(err) => tracing::warn!(error = %err, "failed to store flow"),
        }
    });

    let mut response = Response::builder().status(status).version(resp_version);
    copy_response_headers(response.headers_mut().expect("headers"), &resp_headers);
    response.body(client_body).context("build client response")
}

fn apply_url_override(
    current: &Target,
    path: &str,
    query: &str,
    raw: &str,
) -> Result<(Target, String, String)> {
    let parsed = url::Url::parse(raw).context("invalid intercepted URL")?;
    let scheme = parsed.scheme().to_string();
    if scheme != "http" && scheme != "https" {
        anyhow::bail!("only http and https are supported");
    }
    let host = parsed.host_str().context("URL missing host")?.to_string();
    let port = parsed
        .port_or_known_default()
        .unwrap_or(if scheme == "https" { 443 } else { 80 });
    let next_path = if parsed.path().is_empty() {
        path.to_string()
    } else {
        parsed.path().to_string()
    };
    let next_query = parsed.query().unwrap_or(query).to_string();
    let _ = current;
    Ok((Target { scheme, host, port }, next_path, next_query))
}

/// Send a request on behalf of Repeater and wait until the flow is stored.
pub struct ActiveSend {
    pub detail: crate::types::FlowDetail,
    pub resp_body: Vec<u8>,
}

pub async fn send_repeater(
    state: &AppState,
    req: RepeaterSendRequest,
) -> Result<crate::types::FlowDetail> {
    Ok(send_active(state, req, "repeater", None).await?.detail)
}

pub async fn send_active(
    state: &AppState,
    req: RepeaterSendRequest,
    source: &str,
    permit: Option<crate::guardrails::RatePermit>,
) -> Result<ActiveSend> {
    let url = url::Url::parse(&req.url).context("invalid repeater URL")?;
    let scheme = url.scheme().to_string();
    if scheme != "http" && scheme != "https" {
        anyhow::bail!("only http and https are supported");
    }
    let host = url.host_str().context("URL missing host")?.to_string();
    let port = url
        .port_or_known_default()
        .unwrap_or(if scheme == "https" { 443 } else { 80 });
    let path = if url.path().is_empty() {
        "/".to_string()
    } else {
        url.path().to_string()
    };
    let query = url.query().unwrap_or("").to_string();
    let method: Method = req.method.parse().context("invalid method")?;
    let body = decode_body(&req)?;
    let project_id = req
        .project_id
        .clone()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| state.default_project_id.clone());

    let rules = state.store.list_scope_rules(&project_id)?;
    let _permit = match permit {
        Some(existing) => existing,
        None => {
            let acquired = crate::guardrails::preflight_active(
                state.kill.is_on(),
                &rules,
                &state.rate,
                &host,
                port,
                &path,
            );
            if let Err(err) = &acquired {
                let _ = state.store.append_audit(
                    source,
                    "tool.denied",
                    Some(&project_id),
                    serde_json::json!({
                        "host": host,
                        "url": req.url,
                        "reason": err.to_string(),
                    }),
                );
            }
            acquired.map_err(anyhow::Error::from)?
        }
    };

    let upstream_uri = crate::types::url_from_parts(&scheme, &host, port, &path, &query);
    let mut builder = Request::builder().method(method.clone()).uri(&upstream_uri);
    copy_forward_headers(
        builder.headers_mut().expect("headers"),
        &req.headers,
        &Target {
            scheme: scheme.clone(),
            host: host.clone(),
            port,
        },
    );
    if !body.is_empty() {
        builder = builder.header(hyper::header::CONTENT_LENGTH, body.len().to_string());
    }
    let upstream_req = builder.body(Full::new(Bytes::from(body.clone())))?;

    let started = Instant::now();
    let ts = now_ms();
    let upstream = state
        .client
        .request(upstream_req)
        .await
        .with_context(|| format!("repeater {upstream_uri}"))?;
    let status = upstream.status();
    let resp_headers = headers_from(upstream.headers());
    let resp_bytes = upstream
        .into_body()
        .collect()
        .await
        .context("read repeater response")?
        .to_bytes();
    let req_stored = truncate_body_vec(&body);
    let resp_stored = truncate_body(&Bytes::from(resp_bytes.clone()));
    let flow = NewFlow {
        id: uuid::Uuid::new_v4().to_string(),
        project_id,
        ts,
        method: method.as_str().to_string(),
        scheme,
        host: host.clone(),
        port,
        path: path.clone(),
        query,
        http_version: "HTTP/1.1".into(),
        status: Some(status.as_u16()),
        req_headers: req.headers,
        resp_headers,
        req_len: body.len() as u64,
        resp_len: resp_bytes.len() as u64,
        req_body: req_stored.0,
        resp_body: resp_stored.0,
        duration_ms: Some(started.elapsed().as_millis() as u64),
        source: source.to_string(),
        truncated: req_stored.1 || resp_stored.1,
        in_scope: crate::scope::is_in_scope(&rules, &host, port, &path),
    };
    let summary = state.store.insert_flow(&flow)?;
    let _ = state.events.send(serde_json::json!({
        "kind": "flow",
        "flow": summary,
    }));
    if source == "repeater" {
        let _ = state.store.append_audit(
            "repeater",
            "tool.send",
            Some(&summary.project_id),
            serde_json::json!({ "flow_id": summary.id, "host": summary.host, "url": summary.url }),
        );
    }
    let detail = state
        .store
        .get_flow(&summary.id)?
        .context("stored active-tool flow missing")?;
    Ok(ActiveSend {
        detail,
        resp_body: resp_bytes.to_vec(),
    })
}

fn decode_body(req: &RepeaterSendRequest) -> Result<Vec<u8>> {
    let Some(body) = req.body.as_ref() else {
        return Ok(Vec::new());
    };
    if req.body_base64.unwrap_or(false) {
        use base64::Engine;
        base64::engine::general_purpose::STANDARD
            .decode(body)
            .context("decode base64 body")
    } else {
        Ok(body.as_bytes().to_vec())
    }
}

fn target_from_request(req: &Request<Incoming>) -> Result<Target> {
    let uri = req.uri();
    if let Some(scheme) = uri.scheme_str() {
        let authority = uri.authority().context("absolute URI missing authority")?;
        let (host, port) =
            split_host_port(authority.as_str(), if scheme == "https" { 443 } else { 80 });
        return Ok(Target {
            scheme: scheme.to_string(),
            host,
            port,
        });
    }
    if let Some(host_hdr) = req
        .headers()
        .get(hyper::header::HOST)
        .and_then(|v| v.to_str().ok())
    {
        let (host, port) = split_host_port(host_hdr, 80);
        return Ok(Target {
            scheme: "http".into(),
            host,
            port,
        });
    }
    anyhow::bail!("request is missing a destination")
}

fn split_path_query(path_and_query: &str) -> (String, String) {
    match path_and_query.split_once('?') {
        Some((path, query)) => (path.to_string(), query.to_string()),
        None => (path_and_query.to_string(), String::new()),
    }
}

pub fn split_host_port(authority: &str, default_port: u16) -> (String, u16) {
    if let Some(rest) = authority.strip_prefix('[') {
        if let Some((host, port_part)) = rest.split_once("]:") {
            let port = port_part.parse().unwrap_or(default_port);
            return (host.to_string(), port);
        }
        if let Some(host) = rest.strip_suffix(']') {
            return (host.to_string(), default_port);
        }
    }
    if let Some((host, port)) = authority.rsplit_once(':') {
        if !host.is_empty() && port.chars().all(|c| c.is_ascii_digit()) {
            if let Ok(port) = port.parse() {
                return (host.to_string(), port);
            }
        }
    }
    (authority.to_string(), default_port)
}

fn headers_from(headers: &hyper::HeaderMap) -> Vec<HeaderPair> {
    headers
        .iter()
        .map(|(name, value)| HeaderPair {
            name: name.to_string(),
            value: String::from_utf8_lossy(value.as_bytes()).into_owned(),
        })
        .collect()
}

fn copy_forward_headers(dest: &mut hyper::HeaderMap, headers: &[HeaderPair], target: &Target) {
    dest.clear();
    let mut extra_hop = Vec::new();
    for header in headers {
        if header.name.eq_ignore_ascii_case("connection") {
            for item in header.value.split(',') {
                extra_hop.push(item.trim().to_ascii_lowercase());
            }
        }
    }
    for header in headers {
        if is_hop(&header.name, &extra_hop) || header.name.eq_ignore_ascii_case("content-length") {
            continue;
        }
        if header.name.eq_ignore_ascii_case("host") {
            continue;
        }
        if let (Ok(name), Ok(value)) = (
            hyper::header::HeaderName::try_from(header.name.as_str()),
            hyper::header::HeaderValue::try_from(header.value.as_str()),
        ) {
            dest.append(name, value);
        }
    }
    let host = if matches!(
        (target.scheme.as_str(), target.port),
        ("http", 80) | ("https", 443)
    ) {
        target.host.clone()
    } else if target.host.contains(':') && !target.host.starts_with('[') {
        format!("[{}]:{}", target.host, target.port)
    } else {
        format!("{}:{}", target.host, target.port)
    };
    if let Ok(value) = hyper::header::HeaderValue::try_from(host) {
        dest.insert(hyper::header::HOST, value);
    }
}

fn set_content_length(headers: &mut Vec<HeaderPair>, len: usize) {
    headers.retain(|header| {
        !header.name.eq_ignore_ascii_case("content-length")
            && !header.name.eq_ignore_ascii_case("transfer-encoding")
    });
    headers.push(HeaderPair {
        name: "Content-Length".into(),
        value: len.to_string(),
    });
}

fn copy_response_headers(dest: &mut hyper::HeaderMap, headers: &[HeaderPair]) {
    dest.clear();
    let mut extra_hop = Vec::new();
    for header in headers {
        if header.name.eq_ignore_ascii_case("connection") {
            for item in header.value.split(',') {
                extra_hop.push(item.trim().to_ascii_lowercase());
            }
        }
    }
    for header in headers {
        if is_hop(&header.name, &extra_hop) {
            continue;
        }
        if let (Ok(name), Ok(value)) = (
            hyper::header::HeaderName::try_from(header.name.as_str()),
            hyper::header::HeaderValue::try_from(header.value.as_str()),
        ) {
            dest.append(name, value);
        }
    }
}

fn is_hop(name: &str, extra: &[String]) -> bool {
    let lower = name.to_ascii_lowercase();
    HOP_BY_HOP.iter().any(|h| *h == lower) || extra.iter().any(|h| h == &lower)
}

fn truncate_body(bytes: &bytes::Bytes) -> (Vec<u8>, bool) {
    if bytes.len() > MAX_STORED_BODY {
        (bytes[..MAX_STORED_BODY].to_vec(), true)
    } else {
        (bytes.to_vec(), false)
    }
}

fn truncate_body_vec(bytes: &[u8]) -> (Vec<u8>, bool) {
    if bytes.len() > MAX_STORED_BODY {
        (bytes[..MAX_STORED_BODY].to_vec(), true)
    } else {
        (bytes.to_vec(), false)
    }
}

fn empty_body() -> BoxBody<Bytes, std::io::Error> {
    Empty::<Bytes>::new()
        .map_err(|never| match never {})
        .boxed()
}

fn full_body(data: impl Into<Bytes>) -> BoxBody<Bytes, std::io::Error> {
    Full::new(data.into())
        .map_err(|never| match never {})
        .boxed()
}

fn error_response(
    status: StatusCode,
    err: anyhow::Error,
) -> Response<BoxBody<Bytes, std::io::Error>> {
    tracing::warn!(error = %err, %status, "proxy error");
    Response::builder()
        .status(status)
        .header(hyper::header::CONTENT_TYPE, "text/plain; charset=utf-8")
        .body(full_body(format!("lurkwire-proxy: {err}\n")))
        .expect("error response")
}

fn tee_body(
    incoming: Incoming,
    max: usize,
    on_end: oneshot::Sender<(Vec<u8>, u64, bool)>,
) -> BoxBody<Bytes, std::io::Error> {
    let (tx, rx) = tokio::sync::mpsc::channel::<Result<Bytes, std::io::Error>>(16);
    tokio::spawn(async move {
        let mut stored = Vec::new();
        let mut total = 0u64;
        let mut truncated = false;
        let mut stream = incoming.into_data_stream();
        while let Some(chunk) = stream.next().await {
            match chunk {
                Ok(bytes) => {
                    total += bytes.len() as u64;
                    if !truncated {
                        if stored.len() + bytes.len() <= max {
                            stored.extend_from_slice(&bytes);
                        } else {
                            let room = max.saturating_sub(stored.len());
                            stored.extend_from_slice(&bytes[..room]);
                            truncated = true;
                        }
                    }
                    if tx.send(Ok(bytes)).await.is_err() {
                        break;
                    }
                }
                Err(err) => {
                    let _ = tx
                        .send(Err(std::io::Error::new(std::io::ErrorKind::Other, err)))
                        .await;
                    break;
                }
            }
        }
        let _ = on_end.send((stored, total, truncated));
    });

    let stream = ReceiverStream::new(rx).map(|item| item.map(Frame::data));
    BodyExt::boxed(StreamBody::new(stream))
}

// silence unused when request bodies go through truncate_body on Bytes
#[allow(dead_code)]
fn _unused_truncate_vec(b: &[u8]) -> (Vec<u8>, bool) {
    truncate_body_vec(b)
}

#[cfg(test)]
mod tests {
    use super::split_host_port;

    #[test]
    fn splits_authorities() {
        assert_eq!(
            split_host_port("example.com:8443", 443),
            ("example.com".into(), 8443)
        );
        assert_eq!(
            split_host_port("example.com", 443),
            ("example.com".into(), 443)
        );
        assert_eq!(
            split_host_port("[2001:db8::1]:8443", 443),
            ("2001:db8::1".into(), 8443)
        );
    }
}
