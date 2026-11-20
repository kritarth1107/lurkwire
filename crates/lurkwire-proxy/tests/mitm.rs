use std::net::SocketAddr;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::process::Command;

use anyhow::{Context, Result};
use bytes::Bytes;
use http_body_util::{combinators::BoxBody, BodyExt, Full};
use hyper::service::service_fn;
use hyper::{Request, Response};
use hyper_util::rt::TokioIo;
use lurkwire_proxy::config::Config;
use lurkwire_proxy::types::{HeaderPair, RepeaterSendRequest};
use lurkwire_proxy::{install_crypto, RunningProxy};
use rcgen::{CertificateParams, DistinguishedName, DnType, Issuer, KeyPair, SanType};
use rustls::ServerConfig;
use rustls_pki_types::{CertificateDer, PrivateKeyDer, PrivatePkcs8KeyDer};
use tokio::net::TcpListener;
use tokio_rustls::TlsAcceptor;

#[tokio::test]
async fn curl_https_through_mitm_is_stored() {
    install_crypto();
    let origin_ca = test_origin_ca();
    let origin_addr = spawn_origin(&origin_ca, b"hello from origin").await;

    let dir = tempfile::tempdir().unwrap();
    let mut config = Config::for_test(dir.path().to_path_buf(), vec![origin_ca.cert_der.clone()]);
    // keep auth token stable for curl/control checks
    config.auth_token = "test-token-abcdefghijklmnopqrstuvwxyz".into();
    let running = RunningProxy::start(config).await.unwrap();

    let url = format!("https://127.0.0.1:{}/hello", origin_addr.port());
    let output = Command::new("curl")
        .args([
            "-sS",
            "--max-time",
            "10",
            "-D",
            "-",
            "-x",
            &format!("http://{}", running.proxy_addr),
            "--cacert",
            running.ca_path.to_str().unwrap(),
            &url,
        ])
        .output()
        .await
        .expect("curl must be installed");
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        output.status.success(),
        "curl failed: status={} stdout={stdout} stderr={stderr}",
        output.status
    );
    assert!(
        stdout.contains("hello from origin"),
        "unexpected curl output: {stdout}"
    );

    let flow = wait_for_flow(&running, "hello from origin").await.unwrap();
    assert_eq!(flow["method"], "GET");
    assert_eq!(flow["scheme"], "https");
    assert_eq!(flow["host"], "127.0.0.1");
    assert_eq!(flow["status"], 200);
    assert!(flow["resp_preview"]
        .as_str()
        .unwrap()
        .contains("hello from origin"));

    // Control API rejects missing tokens.
    let unauth = control_get(&running, "/health", None).await;
    assert_eq!(unauth.0, 401);

    running.join().await;
}

#[tokio::test]
async fn repeater_send_records_source() {
    install_crypto();
    let origin_ca = test_origin_ca();
    let origin_addr = spawn_origin(&origin_ca, b"repeater-ok").await;

    let dir = tempfile::tempdir().unwrap();
    let config = Config::for_test(dir.path().to_path_buf(), vec![origin_ca.cert_der.clone()]);
    let running = RunningProxy::start(config).await.unwrap();
    allow_localhost(&running);

    let detail = lurkwire_proxy::proxy::send_repeater(
        &running.state,
        RepeaterSendRequest {
            project_id: None,
            method: "GET".into(),
            url: format!("https://127.0.0.1:{}/r", origin_addr.port()),
            headers: vec![HeaderPair {
                name: "Accept".into(),
                value: "*/*".into(),
            }],
            body: None,
            body_base64: None,
        },
    )
    .await
    .unwrap();

    assert_eq!(detail.summary.source, "repeater");
    assert_eq!(detail.summary.status, Some(200));
    assert!(detail
        .resp_preview
        .as_deref()
        .unwrap()
        .contains("repeater-ok"));
    running.join().await;
}

#[tokio::test]
async fn curl_example_com_if_network_available() {
    install_crypto();
    if !example_com_reachable() {
        eprintln!("skipping example.com test: network unavailable");
        return;
    }
    let dir = tempfile::tempdir().unwrap();
    let config = Config::for_test(dir.path().to_path_buf(), Vec::new());
    let running = RunningProxy::start(config).await.unwrap();
    let output = Command::new("curl")
        .args([
            "-sS",
            "--max-time",
            "15",
            "-D",
            "-",
            "-x",
            &format!("http://{}", running.proxy_addr),
            "--cacert",
            running.ca_path.to_str().unwrap(),
            "https://example.com/",
        ])
        .output()
        .await
        .expect("curl");
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        output.status.success(),
        "curl example.com failed: {stderr} {stdout}"
    );
    assert!(
        stdout.to_ascii_lowercase().contains("example"),
        "unexpected body: {stdout}"
    );
    let flow = wait_for_flow(&running, "example").await.unwrap();
    assert_eq!(flow["host"], "example.com");
    assert_eq!(flow["scheme"], "https");
    running.join().await;
}

struct OriginCa {
    cert_der: CertificateDer<'static>,
    server_config: Arc<ServerConfig>,
}

fn test_origin_ca() -> OriginCa {
    let key = KeyPair::generate().unwrap();
    let mut params = CertificateParams::new(Vec::<String>::new()).unwrap();
    params.is_ca = rcgen::IsCa::Ca(rcgen::BasicConstraints::Unconstrained);
    params.key_usages = vec![
        rcgen::KeyUsagePurpose::KeyCertSign,
        rcgen::KeyUsagePurpose::DigitalSignature,
    ];
    let mut dn = DistinguishedName::new();
    dn.push(DnType::CommonName, "Lurkwire Test Origin CA");
    params.distinguished_name = dn;
    let ca_cert = params.self_signed(&key).unwrap();
    let issuer = Issuer::from_ca_cert_pem(&ca_cert.pem(), key).unwrap();

    let leaf_key = KeyPair::generate().unwrap();
    let mut leaf = CertificateParams::new(Vec::<String>::new()).unwrap();
    leaf.subject_alt_names = vec![SanType::IpAddress("127.0.0.1".parse().unwrap())];
    let mut dn = DistinguishedName::new();
    dn.push(DnType::CommonName, "127.0.0.1");
    leaf.distinguished_name = dn;
    leaf.extended_key_usages = vec![rcgen::ExtendedKeyUsagePurpose::ServerAuth];
    let leaf_cert = leaf.signed_by(&leaf_key, &issuer).unwrap();

    let mut server = ServerConfig::builder()
        .with_no_client_auth()
        .with_single_cert(
            vec![CertificateDer::from(leaf_cert.der().as_ref().to_vec())],
            PrivateKeyDer::Pkcs8(PrivatePkcs8KeyDer::from(leaf_key.serialize_der())),
        )
        .unwrap();
    server.alpn_protocols = vec![b"http/1.1".to_vec()];

    OriginCa {
        cert_der: CertificateDer::from(ca_cert.der().as_ref().to_vec()),
        server_config: Arc::new(server),
    }
}

async fn spawn_origin(origin: &OriginCa, body: &'static [u8]) -> SocketAddr {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let acceptor = TlsAcceptor::from(origin.server_config.clone());
    tokio::spawn(async move {
        loop {
            let Ok((stream, _)) = listener.accept().await else {
                break;
            };
            let acceptor = acceptor.clone();
            tokio::spawn(async move {
                let Ok(tls) = acceptor.accept(stream).await else {
                    return;
                };
                let io = TokioIo::new(tls);
                let service = service_fn(move |req: Request<hyper::body::Incoming>| async move {
                    let _ = req;
                    let resp = Response::builder()
                        .status(200)
                        .header("content-type", "text/plain")
                        .body(full(body))
                        .unwrap();
                    Ok::<_, std::convert::Infallible>(resp)
                });
                let _ = hyper::server::conn::http1::Builder::new()
                    .serve_connection(io, service)
                    .await;
            });
        }
    });
    addr
}

fn full(data: &'static [u8]) -> BoxBody<Bytes, std::convert::Infallible> {
    Full::new(Bytes::from_static(data))
        .map_err(|n| match n {})
        .boxed()
}

async fn wait_for_flow(running: &RunningProxy, needle: &str) -> Result<serde_json::Value> {
    let deadline = Instant::now() + Duration::from_secs(5);
    let mut last = String::new();
    while Instant::now() < deadline {
        let (status, body) =
            control_get(running, "/flows?limit=20", Some(&running.ready.auth_token)).await;
        last = body.clone();
        if status == 200 {
            let parsed: serde_json::Value = serde_json::from_str(&body).context("parse flows")?;
            if let Some(items) = parsed.get("items").and_then(|v| v.as_array()) {
                for item in items {
                    if let Some(id) = item.get("id").and_then(|v| v.as_str()) {
                        let (st, detail) = control_get(
                            running,
                            &format!("/flows/{id}"),
                            Some(&running.ready.auth_token),
                        )
                        .await;
                        if st == 200 && detail.contains(needle) {
                            return Ok(serde_json::from_str(&detail)?);
                        }
                    }
                }
            }
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    anyhow::bail!("flow containing {needle:?} not stored; last list={last}")
}

async fn control_get(running: &RunningProxy, path: &str, token: Option<&str>) -> (u16, String) {
    let url = format!("http://{}{path}", running.control_addr);
    let mut cmd = Command::new("curl");
    cmd.args([
        "-sS",
        "--max-time",
        "5",
        "-o",
        "-",
        "-w",
        "\n__STATUS__%{http_code}",
        url.as_str(),
    ]);
    if let Some(token) = token {
        cmd.arg("-H").arg(format!("Authorization: Bearer {token}"));
    }
    let output = cmd.output().await.expect("curl control");
    let text = String::from_utf8_lossy(&output.stdout).into_owned();
    let (body, status) = match text.rsplit_once("__STATUS__") {
        Some((body, status)) => (
            body.trim_end().to_string(),
            status.trim().parse().unwrap_or(0),
        ),
        None => (text, 0),
    };
    (status, body)
}

fn example_com_reachable() -> bool {
    std::process::Command::new("curl")
        .args([
            "-sS",
            "--max-time",
            "5",
            "-o",
            "/dev/null",
            "-w",
            "%{http_code}",
            "https://example.com/",
        ])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn allow_localhost(running: &RunningProxy) {
    let rule = lurkwire_proxy::scope::ScopeRule {
        id: format!("rule-{}", lurkwire_proxy::store::now_ms()),
        project_id: running.state.default_project_id.clone(),
        enabled: true,
        kind: lurkwire_proxy::scope::ScopeKind::Include,
        host: "127.0.0.1".into(),
        port: None,
        path_prefix: "/".into(),
        created_at: lurkwire_proxy::store::now_ms(),
    };
    running.state.store.add_scope_rule(&rule).unwrap();
}
