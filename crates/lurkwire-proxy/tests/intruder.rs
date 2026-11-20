use std::time::Duration;

use lurkwire_proxy::config::Config;
use lurkwire_proxy::intruder::{AttackType, IntruderStart, JobStatus};
use lurkwire_proxy::scope::{ScopeKind, ScopeRule};
use lurkwire_proxy::types::HeaderPair;
use lurkwire_proxy::{install_crypto, RunningProxy};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

async fn spawn_echo_origin() -> std::net::SocketAddr {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move {
        loop {
            let Ok((mut sock, _)) = listener.accept().await else {
                break;
            };
            tokio::spawn(async move {
                let mut buf = vec![0u8; 4096];
                let n = sock.read(&mut buf).await.unwrap_or(0);
                let req = String::from_utf8_lossy(&buf[..n]);
                let path = req
                    .lines()
                    .next()
                    .and_then(|line| line.split_whitespace().nth(1))
                    .unwrap_or("/");
                let body = if path.contains("hit") { "HIT" } else { "miss" };
                let resp = format!(
                    "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                );
                let _ = sock.write_all(resp.as_bytes()).await;
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

fn start_req(url: String, payloads: Vec<Vec<String>>, grep: Option<&str>) -> IntruderStart {
    IntruderStart {
        project_id: None,
        method: "GET".into(),
        url,
        headers: vec![HeaderPair {
            name: "Accept".into(),
            value: "*/*".into(),
        }],
        body: None,
        body_base64: None,
        attack: AttackType::Sniper,
        payloads,
        grep: grep.map(str::to_string),
        max_requests: Some(50),
    }
}

async fn wait_job(running: &RunningProxy, id: &str) -> lurkwire_proxy::intruder::IntruderJob {
    let deadline = tokio::time::Instant::now() + Duration::from_secs(10);
    loop {
        let job = running.state.intruder.get(id).expect("job");
        if job.status != JobStatus::Running || tokio::time::Instant::now() >= deadline {
            return job;
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
}

#[tokio::test]
async fn sniper_sends_payloads_and_greps() {
    install_crypto();
    let origin = spawn_echo_origin().await;
    let dir = tempfile::tempdir().unwrap();
    let running = RunningProxy::start(Config::for_test(dir.path().to_path_buf(), Vec::new()))
        .await
        .unwrap();
    include_host(&running, "127.0.0.1");
    let url = format!("http://127.0.0.1:{}/q=§miss§", origin.port());
    let job = lurkwire_proxy::intruder::start_job(
        running.state.clone(),
        start_req(url, vec![vec!["miss".into(), "hit".into()]], Some("HIT")),
    )
    .unwrap();
    let done = wait_job(&running, &job.id).await;
    assert_eq!(done.status, JobStatus::Done, "job error: {:?}", done.error);
    assert_eq!(done.total, 2);
    assert_eq!(done.finished, 2);
    assert_eq!(done.results[0].status, Some(200));
    assert!(!done.results[0].grep_hit);
    assert!(done.results[1].grep_hit);
    assert!(done.results[1].flow_id.is_some());
    running.join().await;
}

#[tokio::test]
async fn default_deny_records_out_of_scope() {
    install_crypto();
    let origin = spawn_echo_origin().await;
    let dir = tempfile::tempdir().unwrap();
    let running = RunningProxy::start(Config::for_test(dir.path().to_path_buf(), Vec::new()))
        .await
        .unwrap();
    let url = format!("http://127.0.0.1:{}/§x§", origin.port());
    let job = lurkwire_proxy::intruder::start_job(
        running.state.clone(),
        start_req(url, vec![vec!["x".into()]], None),
    )
    .unwrap();
    let done = wait_job(&running, &job.id).await;
    assert_eq!(done.status, JobStatus::Done);
    let err = done.results[0].error.as_deref().unwrap_or("");
    assert!(err.contains("out of scope"), "unexpected error: {err}");
    running.join().await;
}

#[tokio::test]
async fn kill_switch_stops_job() {
    install_crypto();
    let origin = spawn_echo_origin().await;
    let dir = tempfile::tempdir().unwrap();
    let running = RunningProxy::start(Config::for_test(dir.path().to_path_buf(), Vec::new()))
        .await
        .unwrap();
    include_host(&running, "127.0.0.1");
    let url = format!("http://127.0.0.1:{}/§p§", origin.port());
    let payloads = (0..30).map(|i| format!("p{i}")).collect();
    let job = lurkwire_proxy::intruder::start_job(
        running.state.clone(),
        start_req(url, vec![payloads], None),
    )
    .unwrap();
    tokio::time::sleep(Duration::from_millis(50)).await;
    running.state.kill.set(true);
    let done = wait_job(&running, &job.id).await;
    assert_eq!(done.status, JobStatus::Stopped);
    assert!(done.finished < done.total, "finished={} total={}", done.finished, done.total);
    running.join().await;
}
