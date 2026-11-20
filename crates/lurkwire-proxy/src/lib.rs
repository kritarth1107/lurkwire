pub mod body_decode;
pub mod ca;
pub mod config;
pub mod control;
pub mod guardrails;
pub mod intercept;
pub mod intruder;
pub mod proxy;
pub mod scanner;
pub mod scope;
pub mod store;
pub mod types;

use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;

use anyhow::{Context, Result};
use serde::Serialize;
use tokio::net::TcpListener;
use tokio::sync::{broadcast, watch};

use crate::ca::CertificateAuthority;
use crate::config::Config;
use crate::guardrails::{KillSwitch, RateLimiter};
use crate::intercept::InterceptEngine;
use crate::proxy::{build_client, HttpsClient};
use crate::store::Store;

pub struct AppState {
    pub auth_token: String,
    pub ca: Arc<CertificateAuthority>,
    pub store: Arc<Store>,
    pub client: HttpsClient,
    pub events: broadcast::Sender<serde_json::Value>,
    pub intercept: InterceptEngine,
    pub intruder: crate::intruder::IntruderEngine,
    pub kill: std::sync::Arc<KillSwitch>,
    pub rate: std::sync::Arc<RateLimiter>,
    pub default_project_id: String,
    pub proxy_addr: SocketAddr,
    pub control_addr: SocketAddr,
}

#[derive(Debug, Clone, Serialize)]
pub struct Ready {
    pub ok: bool,
    pub proxy_listen: String,
    pub control_listen: String,
    pub ca_path: String,
    pub ca_fingerprint_sha256: String,
    pub data_dir: String,
    pub auth_token: String,
    pub default_project_id: String,
}

pub struct RunningProxy {
    pub ready: Ready,
    pub proxy_addr: SocketAddr,
    pub control_addr: SocketAddr,
    pub ca_path: PathBuf,
    pub state: Arc<AppState>,
    shutdown: watch::Sender<bool>,
    tasks: Vec<tokio::task::JoinHandle<()>>,
}

impl RunningProxy {
    pub async fn start(config: Config) -> Result<Self> {
        install_crypto();
        std::fs::create_dir_all(&config.data_dir)
            .with_context(|| format!("create {}", config.data_dir.display()))?;

        let ca = Arc::new(CertificateAuthority::load_or_create(&config.data_dir)?);
        let store = Arc::new(Store::open(&config.data_dir)?);
        let default_project = store.ensure_default_project()?;
        let client = build_client(&config.extra_roots)?;
        let (events, _) = broadcast::channel(256);

        let proxy_listener = TcpListener::bind(config.listen)
            .await
            .with_context(|| format!("bind proxy {}", config.listen))?;
        let control_listener = TcpListener::bind(config.control)
            .await
            .with_context(|| format!("bind control {}", config.control))?;
        let proxy_addr = proxy_listener.local_addr()?;
        let control_addr = control_listener.local_addr()?;

        let state = Arc::new(AppState {
            auth_token: config.auth_token.clone(),
            ca: ca.clone(),
            store,
            client,
            events,
            intercept: InterceptEngine::new(),
            intruder: crate::intruder::IntruderEngine::new(),
            kill: std::sync::Arc::new(KillSwitch::default()),
            rate: RateLimiter::production(),
            default_project_id: default_project.id.clone(),
            proxy_addr,
            control_addr,
        });

        let (shutdown, shutdown_rx) = watch::channel(false);
        let mut tasks = Vec::new();

        {
            let state = state.clone();
            let mut shutdown_rx = shutdown_rx.clone();
            // Mark the initial value as seen; the first changed() would otherwise
            // return immediately and cancel the listener.
            let _ = *shutdown_rx.borrow_and_update();
            tasks.push(tokio::spawn(async move {
                tokio::select! {
                    result = proxy::run_proxy(proxy_listener, state) => {
                        if let Err(err) = result {
                            tracing::error!(error = %err, "proxy server exited");
                        }
                    }
                    _ = shutdown_rx.changed() => {}
                }
            }));
        }
        {
            let state = state.clone();
            let mut shutdown_rx = shutdown_rx;
            let _ = *shutdown_rx.borrow_and_update();
            tasks.push(tokio::spawn(async move {
                tokio::select! {
                    result = control::run_control(control_listener, state) => {
                        if let Err(err) = result {
                            tracing::error!(error = %err, "control server exited");
                        }
                    }
                    _ = shutdown_rx.changed() => {}
                }
            }));
        }

        let ready = Ready {
            ok: true,
            proxy_listen: proxy_addr.to_string(),
            control_listen: control_addr.to_string(),
            ca_path: ca.cert_path.display().to_string(),
            ca_fingerprint_sha256: ca.fingerprint_sha256.clone(),
            data_dir: config.data_dir.display().to_string(),
            auth_token: config.auth_token,
            default_project_id: default_project.id,
        };

        Ok(Self {
            ready,
            proxy_addr,
            control_addr,
            ca_path: ca.cert_path.clone(),
            state,
            shutdown,
            tasks,
        })
    }

    pub fn shutdown(&self) {
        let _ = self.shutdown.send(true);
    }

    pub async fn join(mut self) {
        self.shutdown();
        for task in self.tasks.drain(..) {
            let _ = task.await;
        }
    }
}

pub fn install_crypto() {
    static ONCE: std::sync::Once = std::sync::Once::new();
    ONCE.call_once(|| {
        rustls::crypto::ring::default_provider()
            .install_default()
            .ok();
    });
}
