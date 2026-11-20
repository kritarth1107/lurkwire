use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use thiserror::Error;

use crate::scope::{self, ScopeRule};
use crate::store::Store;

const DEFAULT_RPS: f64 = 5.0;
const DEFAULT_BURST: f64 = 5.0;
const DEFAULT_CONCURRENT: u32 = 2;

#[derive(Debug, Error)]
pub enum GuardError {
    #[error("kill switch is on")]
    Killed,
    #[error("target is out of scope for active tooling")]
    OutOfScope,
    #[error("rate limited")]
    RateLimited,
}

#[derive(Debug, Default)]
pub struct KillSwitch {
    on: AtomicBool,
}

impl KillSwitch {
    pub fn is_on(&self) -> bool {
        self.on.load(Ordering::SeqCst)
    }

    pub fn set(&self, on: bool) -> bool {
        self.on.swap(on, Ordering::SeqCst)
    }
}

struct Bucket {
    tokens: f64,
    last: Instant,
    in_flight: u32,
}

pub struct RateLimiter {
    rps: f64,
    burst: f64,
    max_in_flight: u32,
    buckets: Mutex<HashMap<String, Bucket>>,
}

pub struct RatePermit {
    limiter: Arc<RateLimiter>,
    host: String,
}

impl RateLimiter {
    pub fn new(rps: f64, burst: f64, max_in_flight: u32) -> Arc<Self> {
        Arc::new(Self {
            rps,
            burst,
            max_in_flight,
            buckets: Mutex::new(HashMap::new()),
        })
    }

    pub fn production() -> Arc<Self> {
        Self::new(DEFAULT_RPS, DEFAULT_BURST, DEFAULT_CONCURRENT)
    }

    pub fn try_acquire(self: &Arc<Self>, host: &str) -> Result<RatePermit, GuardError> {
        let mut buckets = self.buckets.lock().expect("rate lock");
        let now = Instant::now();
        let bucket = buckets.entry(host.to_ascii_lowercase()).or_insert(Bucket {
            tokens: self.burst,
            last: now,
            in_flight: 0,
        });
        let elapsed = now.duration_since(bucket.last).as_secs_f64();
        bucket.tokens = (bucket.tokens + elapsed * self.rps).min(self.burst);
        bucket.last = now;
        if bucket.in_flight >= self.max_in_flight || bucket.tokens < 1.0 {
            return Err(GuardError::RateLimited);
        }
        bucket.tokens -= 1.0;
        bucket.in_flight += 1;
        Ok(RatePermit {
            limiter: self.clone(),
            host: host.to_ascii_lowercase(),
        })
    }

    /// Wait until a token is available, or the kill/cancel flag trips.
    pub async fn acquire(
        self: &Arc<Self>,
        host: &str,
        stop: impl Fn() -> bool,
    ) -> Result<RatePermit, GuardError> {
        loop {
            if stop() {
                return Err(GuardError::Killed);
            }
            match self.try_acquire(host) {
                Ok(permit) => return Ok(permit),
                Err(GuardError::RateLimited) => {
                    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
                }
                Err(err) => return Err(err),
            }
        }
    }
}

impl Drop for RatePermit {
    fn drop(&mut self) {
        if let Ok(mut buckets) = self.limiter.buckets.lock() {
            if let Some(bucket) = buckets.get_mut(&self.host) {
                bucket.in_flight = bucket.in_flight.saturating_sub(1);
            }
        }
    }
}

/// Check kill switch, scope allowlist, and rate limit for Repeater/Intruder/AI.
pub fn preflight_active(
    killed: bool,
    rules: &[ScopeRule],
    limiter: &Arc<RateLimiter>,
    host: &str,
    port: u16,
    path: &str,
) -> Result<RatePermit, GuardError> {
    if killed {
        return Err(GuardError::Killed);
    }
    if !scope::active_allowed(rules, host, port, path) {
        return Err(GuardError::OutOfScope);
    }
    limiter.try_acquire(host)
}

pub fn load_rules(store: &Store, project_id: &str) -> anyhow::Result<Vec<ScopeRule>> {
    store.list_scope_rules(project_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn token_bucket_and_concurrency() {
        let limiter = RateLimiter::new(100.0, 2.0, 2);
        let a = limiter.try_acquire("h").unwrap();
        let b = limiter.try_acquire("h").unwrap();
        assert!(matches!(
            limiter.try_acquire("h"),
            Err(GuardError::RateLimited)
        ));
        drop(a);
        drop(b);
        // burst already spent; tokens refill slowly at 100 rps but we spent 2
        // After drop, in_flight is 0 but tokens may still be 0.
        // Sleep a tiny bit or use high rps... 100 rps * 20ms = 2 tokens.
        std::thread::sleep(std::time::Duration::from_millis(30));
        limiter.try_acquire("h").unwrap();
    }

    #[test]
    fn kill_short_circuits() {
        let limiter = RateLimiter::production();
        let result = preflight_active(true, &[], &limiter, "example.com", 443, "/");
        assert!(matches!(result, Err(GuardError::Killed)));
    }
}
