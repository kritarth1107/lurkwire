use std::net::SocketAddr;
use std::sync::Arc;
use std::time::{Duration, Instant};

use bytes::Bytes;
use http_body_util::{combinators::BoxBody, BodyExt, Full};
use hyper::service::service_fn;
use hyper::{Request, Response};
use hyper_util::rt::TokioIo;
use lurkwire_proxy::config::Config;
use lurkwire_proxy::intercept::InterceptConfig;
use lurkwire_proxy::{install_crypto, RunningProxy};
use rcgen::{CertificateParams, DistinguishedName, DnType, Issuer, KeyPair, SanType};
use rustls::ServerConfig;
use rustls_pki_types::{CertificateDer, PrivateKeyDer, PrivatePkcs8KeyDer};
use tokio::net::TcpListener;
use tokio::process::Command;
use tokio_rustls::TlsAcceptor;

#[tokio::test]
async fn intercept_can_edit_and_forward_https() {
    install_crypto();
    let origin = test_origin(b"hello from origin").await;
    let dir = tempfile::tempdir().unwrap();
    let config = Config::for_test(dir.path().to_path_buf(), vec![origin.cert_der.clone()]);
    let running = RunningProxy::start(config).await.unwrap();
    set_intercept(
        &running,
        InterceptConfig {
            enabled: true,
            requests: true,
            responses: false,
            timeout_ms: 10_000,
        },
    )
    .await;

    let url = format!("https://127.0.0.1:{}/hello", origin.addr.port());
    let curl = tokio::spawn(curl_proxied(
        running.proxy_addr,
        running.ca_path.clone(),
        url.clone(),
    ));

    let item = wait_for_paused(&running).await;
    assert_eq!(item["method"], "GET");
    assert!(item["url"].as_str().unwrap().contains("/hello"));

    control_send(
        &running,
        "POST",
        &format!("/intercept/queue/{}/forward", item["id"].as_str().unwrap()),
        Some(serde_json::json!({})),
    )
    .await;

    let (status, body) = curl.await.unwrap();
    assert_eq!(status, 200, "{body}");
    assert!(body.contains("hello from origin"), "{body}");
    running.join().await;
}

#[tokio::test]
async fn intercept_drop_returns_forbidden() {
    install_crypto();
    let origin = test_origin(b"should not see").await;
    let dir = tempfile::tempdir().unwrap();
    let config = Config::for_test(dir.path().to_path_buf(), vec![origin.cert_der.clone()]);
    let running = RunningProxy::start(config).await.unwrap();
    set_intercept(
        &running,
        InterceptConfig {
            enabled: true,
            requests: true,
            responses: false,
            timeout_ms: 10_000,
        },
    )
    .await;

    let url = format!("https://127.0.0.1:{}/secret", origin.addr.port());
    let curl = tokio::spawn(curl_proxied(
        running.proxy_addr,
        running.ca_path.clone(),
        url.clone(),
    ));
    let item = wait_for_paused(&running).await;
    control_send(
        &running,
        "POST",
        &format!("/intercept/queue/{}/drop", item["id"].as_str().unwrap()),
        None,
    )
    .await;
    let (status, body) = curl.await.unwrap();
    assert_eq!(status, 403, "{body}");
    assert!(body.contains("dropped by intercept"), "{body}");
    running.join().await;
}

#[tokio::test]
async fn intercept_timeout_auto_forwards() {
    install_crypto();
    let origin = test_origin(b"auto-forwarded").await;
    let dir = tempfile::tempdir().unwrap();
    let config = Config::for_test(dir.path().to_path_buf(), vec![origin.cert_der.clone()]);
    let running = RunningProxy::start(config).await.unwrap();
    set_intercept(
        &running,
        InterceptConfig {
            enabled: true,
            requests: true,
            responses: false,
            timeout_ms: 400,
        },
    )
    .await;

    let url = format!("https://127.0.0.1:{}/auto", origin.addr.port());
    let (status, body) =
        curl_proxied(running.proxy_addr, running.ca_path.clone(), url.clone()).await;
    assert_eq!(status, 200, "{body}");
    assert!(body.contains("auto-forwarded"), "{body}");
    running.join().await;
}

#[tokio::test]
async fn intercept_can_edit_response_body() {
    install_crypto();
    let origin = test_origin(b"original").await;
    let dir = tempfile::tempdir().unwrap();
    let config = Config::for_test(dir.path().to_path_buf(), vec![origin.cert_der.clone()]);
    let running = RunningProxy::start(config).await.unwrap();
    set_intercept(
        &running,
        InterceptConfig {
            enabled: true,
            requests: false,
            responses: true,
            timeout_ms: 10_000,
        },
    )
    .await;

    let url = format!("https://127.0.0.1:{}/edit", origin.addr.port());
    let curl = tokio::spawn(curl_proxied(
        running.proxy_addr,
        running.ca_path.clone(),
        url.clone(),
    ));
    let item = wait_for_paused(&running).await;
    assert_eq!(item["direction"], "response");
    assert_eq!(item["body"], "original");
    control_send(
        &running,
        "POST",
        &format!("/intercept/queue/{}/forward", item["id"].as_str().unwrap()),
        Some(serde_json::json!({
            "status": 201,
            "body": "edited body"
        })),
    )
    .await;
    let (status, body) = curl.await.unwrap();
    assert_eq!(status, 201, "{body}");
    assert!(body.contains("edited body"), "{body}");
    running.join().await;
}

struct Origin {
    cert_der: CertificateDer<'static>,
    addr: SocketAddr,
}

async fn test_origin(body: &'static [u8]) -> Origin {
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
    let acceptor = TlsAcceptor::from(Arc::new(server));
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
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
    Origin {
        cert_der: CertificateDer::from(ca_cert.der().as_ref().to_vec()),
        addr,
    }
}

fn full(data: &'static [u8]) -> BoxBody<Bytes, std::convert::Infallible> {
    Full::new(Bytes::from_static(data))
        .map_err(|n| match n {})
        .boxed()
}

async fn set_intercept(running: &RunningProxy, config: InterceptConfig) {
    let (status, body) = control_send(
        running,
        "PUT",
        "/intercept",
        Some(serde_json::to_value(config).unwrap()),
    )
    .await;
    assert_eq!(status, 200, "{body}");
}

async fn wait_for_paused(running: &RunningProxy) -> serde_json::Value {
    let deadline = Instant::now() + Duration::from_secs(5);
    while Instant::now() < deadline {
        let (status, body) = control_send(running, "GET", "/intercept/queue", None).await;
        if status == 200 {
            let items: serde_json::Value =
                serde_json::from_str(&body).unwrap_or(serde_json::json!([]));
            if let Some(item) = items.as_array().and_then(|arr| arr.first()) {
                return item.clone();
            }
        }
        tokio::time::sleep(Duration::from_millis(30)).await;
    }
    panic!("no paused intercept item");
}

async fn curl_proxied(
    proxy_addr: std::net::SocketAddr,
    ca_path: std::path::PathBuf,
    url: String,
) -> (u16, String) {
    let output = Command::new("curl")
        .args([
            "-sS",
            "--max-time",
            "15",
            "-o",
            "-",
            "-w",
            "\n__STATUS__%{http_code}",
            "-x",
            &format!("http://{}", proxy_addr),
            "--cacert",
            ca_path.to_str().unwrap(),
            &url,
        ])
        .output()
        .await
        .expect("curl");
    let text = String::from_utf8_lossy(&output.stdout).into_owned();
    let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
    let (body, status) = match text.rsplit_once("__STATUS__") {
        Some((body, status)) => (
            body.trim_end().to_string(),
            status.trim().parse().unwrap_or(0),
        ),
        None => (format!("{text}\n{stderr}"), 0),
    };
    (status, body)
}

async fn control_send(
    running: &RunningProxy,
    method: &str,
    path: &str,
    body: Option<serde_json::Value>,
) -> (u16, String) {
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
        "-X",
        method,
        "-H",
        &format!("Authorization: Bearer {}", running.ready.auth_token),
    ]);
    if let Some(body) = body {
        cmd.arg("-H").arg("Content-Type: application/json");
        cmd.arg("--data").arg(body.to_string());
    }
    cmd.arg(url);
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
