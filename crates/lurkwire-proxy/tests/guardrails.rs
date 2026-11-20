use std::time::Duration;

use lurkwire_proxy::config::Config;
use lurkwire_proxy::scope::{ScopeKind, ScopeRule};
use lurkwire_proxy::store::GENESIS_HASH;
use lurkwire_proxy::types::{HeaderPair, RepeaterSendRequest};
use lurkwire_proxy::{install_crypto, RunningProxy};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

async fn spawn_plain_origin(body: &'static [u8]) -> std::net::SocketAddr {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move {
        loop {
            let Ok((mut sock, _)) = listener.accept().await else {
                break;
            };
            let body = body.to_vec();
            tokio::spawn(async move {
                let mut buf = vec![0u8; 4096];
                let _ = sock.read(&mut buf).await;
                let resp = format!(
                    "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    body.len()
                );
                let _ = sock.write_all(resp.as_bytes()).await;
                let _ = sock.write_all(&body).await;
            });
        }
    });
    addr
}

fn include_host(running: &RunningProxy, host: &str) -> ScopeRule {
    let rule = ScopeRule {
        id: format!("rule-{}", lurkwire_proxy::store::now_ms()),
        project_id: running.state.default_project_id.clone(),
        enabled: true,
        kind: ScopeKind::Include,
        host: host.into(),
        port: None,
        path_prefix: "/".into(),
        created_at: lurkwire_proxy::store::now_ms(),
    };
    running.state.store.add_scope_rule(&rule).unwrap();
    rule
}

fn repeater_req(url: String) -> RepeaterSendRequest {
    RepeaterSendRequest {
        project_id: None,
        method: "GET".into(),
        url,
        headers: vec![HeaderPair {
            name: "Accept".into(),
            value: "*/*".into(),
        }],
        body: None,
        body_base64: None,
    }
}

#[tokio::test]
async fn repeater_default_deny_without_scope() {
    install_crypto();
    let origin = spawn_plain_origin(b"secret").await;
    let dir = tempfile::tempdir().unwrap();
    let running = RunningProxy::start(Config::for_test(dir.path().to_path_buf(), Vec::new()))
        .await
        .unwrap();
    let err = lurkwire_proxy::proxy::send_repeater(
        &running.state,
        repeater_req(format!("http://127.0.0.1:{}/x", origin.port())),
    )
    .await
    .unwrap_err();
    assert!(
        err.to_string().contains("out of scope"),
        "unexpected error: {err}"
    );
    running.join().await;
}

#[tokio::test]
async fn repeater_allowed_with_include_rule() {
    install_crypto();
    let origin = spawn_plain_origin(b"ok").await;
    let dir = tempfile::tempdir().unwrap();
    let running = RunningProxy::start(Config::for_test(dir.path().to_path_buf(), Vec::new()))
        .await
        .unwrap();
    include_host(&running, "127.0.0.1");
    let detail = lurkwire_proxy::proxy::send_repeater(
        &running.state,
        repeater_req(format!("http://127.0.0.1:{}/x", origin.port())),
    )
    .await
    .unwrap();
    assert_eq!(detail.summary.status, Some(200));
    running.join().await;
}

#[tokio::test]
async fn kill_switch_blocks_proxy_and_resume() {
    install_crypto();
    let origin = spawn_plain_origin(b"alive").await;
    let dir = tempfile::tempdir().unwrap();
    let running = RunningProxy::start(Config::for_test(dir.path().to_path_buf(), Vec::new()))
        .await
        .unwrap();
    running.state.kill.set(true);
    let url = format!("http://127.0.0.1:{}/h", origin.port());
    let output = tokio::process::Command::new("curl")
        .args([
            "-sS",
            "-o",
            "/tmp/lurkwire-kill-body",
            "-w",
            "%{http_code}",
            "--max-time",
            "5",
            "-x",
            &format!("http://{}", running.proxy_addr),
            &url,
        ])
        .output()
        .await
        .unwrap();
    let code = String::from_utf8_lossy(&output.stdout);
    assert_eq!(
        code.trim(),
        "403",
        "stdout={code} stderr={}",
        String::from_utf8_lossy(&output.stderr)
    );

    running.state.kill.set(false);
    let output = tokio::process::Command::new("curl")
        .args([
            "-sS",
            "--max-time",
            "5",
            "-x",
            &format!("http://{}", running.proxy_addr),
            &url,
        ])
        .output()
        .await
        .unwrap();
    let body = String::from_utf8_lossy(&output.stdout);
    assert!(output.status.success(), "resume curl failed: {body}");
    assert!(body.contains("alive"), "{body}");
    running.join().await;
}

#[tokio::test]
async fn audit_log_is_hash_chained() {
    install_crypto();
    let dir = tempfile::tempdir().unwrap();
    let running = RunningProxy::start(Config::for_test(dir.path().to_path_buf(), Vec::new()))
        .await
        .unwrap();
    running
        .state
        .store
        .append_audit("test", "one", None, serde_json::json!({"n": 1}))
        .unwrap();
    running
        .state
        .store
        .append_audit("test", "two", None, serde_json::json!({"n": 2}))
        .unwrap();
    let entries = running.state.store.list_audit(None, 50, 0).unwrap();
    assert!(entries.len() >= 2);
    assert_eq!(entries[0].prev_hash, GENESIS_HASH);
    assert_eq!(entries[1].prev_hash, entries[0].hash);
    assert!(running.state.store.verify_audit_chain().unwrap());
    running.join().await;
}

#[tokio::test]
async fn rate_limiter_trips_on_burst() {
    install_crypto();
    let origin = spawn_plain_origin(b"r").await;
    let dir = tempfile::tempdir().unwrap();
    let running = RunningProxy::start(Config::for_test(dir.path().to_path_buf(), Vec::new()))
        .await
        .unwrap();
    include_host(&running, "127.0.0.1");
    let url = format!("http://127.0.0.1:{}/r", origin.port());
    let mut joins = Vec::new();
    for _ in 0..10 {
        let state = running.state.clone();
        let url = url.clone();
        joins.push(tokio::spawn(async move {
            lurkwire_proxy::proxy::send_repeater(&state, repeater_req(url)).await
        }));
    }
    let mut failed = 0;
    for join in joins {
        match join.await.unwrap() {
            Ok(_) => {}
            Err(err) if err.to_string().contains("rate limited") => failed += 1,
            Err(err) => panic!("unexpected {err}"),
        }
    }
    assert!(failed > 0, "expected some rate-limited requests");
    running.join().await;
}
