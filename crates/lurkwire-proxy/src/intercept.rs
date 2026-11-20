use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;

use anyhow::Result;
use serde::{Deserialize, Serialize};
use tokio::sync::oneshot;
use tokio::time::timeout;

use crate::store::now_ms;
use crate::types::HeaderPair;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InterceptConfig {
    pub enabled: bool,
    pub requests: bool,
    pub responses: bool,
    pub timeout_ms: u64,
}

impl Default for InterceptConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            requests: true,
            responses: false,
            timeout_ms: 30_000,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum InterceptDirection {
    Request,
    Response,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PausedItem {
    pub id: String,
    pub direction: InterceptDirection,
    pub created_at: i64,
    pub method: String,
    pub url: String,
    pub headers: Vec<HeaderPair>,
    pub body: Option<String>,
    pub body_base64: bool,
    pub body_len: u64,
    pub status: Option<u16>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct ForwardEdit {
    pub method: Option<String>,
    pub url: Option<String>,
    pub headers: Option<Vec<HeaderPair>>,
    pub body: Option<String>,
    pub body_base64: Option<bool>,
    pub status: Option<u16>,
}

#[derive(Debug, Clone)]
pub enum Decision {
    Forward(ForwardEdit),
    Drop,
}

struct Pending {
    item: PausedItem,
    tx: oneshot::Sender<Decision>,
}

pub struct InterceptEngine {
    config: Mutex<InterceptConfig>,
    pending: Mutex<HashMap<String, Pending>>,
}

impl InterceptEngine {
    pub fn new() -> Self {
        Self {
            config: Mutex::new(InterceptConfig::default()),
            pending: Mutex::new(HashMap::new()),
        }
    }

    pub fn config(&self) -> InterceptConfig {
        self.config.lock().expect("intercept config").clone()
    }

    pub fn set_config(&self, update: InterceptConfig) -> InterceptConfig {
        let mut timeout_ms = update.timeout_ms;
        if timeout_ms < 500 {
            timeout_ms = 500;
        }
        if timeout_ms > 300_000 {
            timeout_ms = 300_000;
        }
        let next = InterceptConfig {
            enabled: update.enabled,
            requests: update.requests,
            responses: update.responses,
            timeout_ms,
        };
        *self.config.lock().expect("intercept config") = next.clone();
        next
    }

    pub fn queue(&self) -> Vec<PausedItem> {
        let mut items: Vec<_> = self
            .pending
            .lock()
            .expect("intercept queue")
            .values()
            .map(|pending| pending.item.clone())
            .collect();
        items.sort_by_key(|item| item.created_at);
        items
    }

    pub fn get(&self, id: &str) -> Option<PausedItem> {
        self.pending
            .lock()
            .expect("intercept queue")
            .get(id)
            .map(|pending| pending.item.clone())
    }

    pub fn should_pause_request(&self) -> bool {
        let config = self.config();
        config.enabled && config.requests
    }

    pub fn should_pause_response(&self) -> bool {
        let config = self.config();
        config.enabled && config.responses
    }

    pub async fn pause_request(
        &self,
        method: &str,
        url: &str,
        headers: &[HeaderPair],
        body: &[u8],
        events: &tokio::sync::broadcast::Sender<serde_json::Value>,
    ) -> Decision {
        self.pause(
            InterceptDirection::Request,
            method,
            url,
            headers,
            body,
            None,
            events,
        )
        .await
    }

    pub async fn pause_response(
        &self,
        method: &str,
        url: &str,
        headers: &[HeaderPair],
        body: &[u8],
        status: u16,
        events: &tokio::sync::broadcast::Sender<serde_json::Value>,
    ) -> Decision {
        self.pause(
            InterceptDirection::Response,
            method,
            url,
            headers,
            body,
            Some(status),
            events,
        )
        .await
    }

    async fn pause(
        &self,
        direction: InterceptDirection,
        method: &str,
        url: &str,
        headers: &[HeaderPair],
        body: &[u8],
        status: Option<u16>,
        events: &tokio::sync::broadcast::Sender<serde_json::Value>,
    ) -> Decision {
        let timeout_ms = self.config().timeout_ms;
        let id = uuid::Uuid::new_v4().to_string();
        let (body_text, body_base64) = encode_body(body);
        let item = PausedItem {
            id: id.clone(),
            direction,
            created_at: now_ms(),
            method: method.to_string(),
            url: url.to_string(),
            headers: headers.to_vec(),
            body: body_text,
            body_base64,
            body_len: body.len() as u64,
            status,
        };
        let (tx, rx) = oneshot::channel();
        {
            self.pending.lock().expect("intercept queue").insert(
                id.clone(),
                Pending {
                    item: item.clone(),
                    tx,
                },
            );
        }
        let _ = events.send(serde_json::json!({
            "kind": "intercept",
            "item": item,
        }));

        let result = timeout(Duration::from_millis(timeout_ms), rx).await;
        match result {
            Ok(Ok(decision)) => decision,
            Ok(Err(_)) => {
                self.take_pending(&id);
                Decision::Forward(ForwardEdit::default())
            }
            Err(_) => {
                self.take_pending(&id);
                Decision::Forward(ForwardEdit::default())
            }
        }
    }

    pub fn decide(&self, id: &str, decision: Decision) -> Result<()> {
        let Some(pending) = self.take_pending(id) else {
            anyhow::bail!("no paused item with id {id}");
        };
        pending
            .tx
            .send(decision)
            .map_err(|_| anyhow::anyhow!("paused item is no longer waiting"))
    }

    fn take_pending(&self, id: &str) -> Option<Pending> {
        self.pending.lock().expect("intercept queue").remove(id)
    }
}

fn encode_body(body: &[u8]) -> (Option<String>, bool) {
    if body.is_empty() {
        return (None, false);
    }
    if let Ok(text) = std::str::from_utf8(body) {
        if !text.contains('\0') {
            return (Some(text.to_string()), false);
        }
    }
    use base64::Engine;
    (
        Some(base64::engine::general_purpose::STANDARD.encode(body)),
        true,
    )
}

pub fn decode_edit_body(edit: &ForwardEdit, original: &[u8]) -> Result<Vec<u8>> {
    let Some(body) = edit.body.as_ref() else {
        return Ok(original.to_vec());
    };
    if edit.body_base64.unwrap_or(false) {
        use base64::Engine;
        Ok(base64::engine::general_purpose::STANDARD.decode(body)?)
    } else {
        Ok(body.as_bytes().to_vec())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn auto_forwards_after_timeout() {
        let engine = InterceptEngine::new();
        engine.set_config(InterceptConfig {
            enabled: true,
            requests: true,
            responses: false,
            timeout_ms: 50,
        });
        let (tx, _rx) = tokio::sync::broadcast::channel(8);
        let started = std::time::Instant::now();
        let decision = engine
            .pause_request("GET", "https://example.com/", &[], b"", &tx)
            .await;
        assert!(started.elapsed() >= Duration::from_millis(40));
        assert!(matches!(decision, Decision::Forward(_)));
        assert!(engine.queue().is_empty());
    }

    #[tokio::test]
    async fn forward_and_drop_resolve_waiters() {
        let engine = std::sync::Arc::new(InterceptEngine::new());
        engine.set_config(InterceptConfig {
            enabled: true,
            requests: true,
            responses: false,
            timeout_ms: 5_000,
        });
        let (tx, _rx) = tokio::sync::broadcast::channel(8);
        let engine_wait = engine.clone();
        let handle = tokio::spawn(async move {
            engine_wait
                .pause_request("POST", "https://example.com/login", &[], b"hi", &tx)
                .await
        });
        let id = wait_for_id(&engine).await;
        engine
            .decide(
                &id,
                Decision::Forward(ForwardEdit {
                    method: Some("PUT".into()),
                    ..ForwardEdit::default()
                }),
            )
            .unwrap();
        let Decision::Forward(edit) = handle.await.unwrap() else {
            panic!("expected forward");
        };
        assert_eq!(edit.method.as_deref(), Some("PUT"));
    }

    async fn wait_for_id(engine: &InterceptEngine) -> String {
        for _ in 0..50 {
            if let Some(item) = engine.queue().first() {
                return item.id.clone();
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        panic!("queue stayed empty");
    }
}
