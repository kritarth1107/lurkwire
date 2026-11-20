use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ScopeKind {
    Include,
    Exclude,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScopeRule {
    pub id: String,
    pub project_id: String,
    pub enabled: bool,
    pub kind: ScopeKind,
    pub host: String,
    pub port: Option<u16>,
    pub path_prefix: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NewScopeRule {
    pub project_id: Option<String>,
    pub enabled: Option<bool>,
    pub kind: ScopeKind,
    pub host: String,
    pub port: Option<u16>,
    pub path_prefix: Option<String>,
}

impl ScopeRule {
    pub fn matches(&self, host: &str, port: u16, path: &str) -> bool {
        if !self.enabled {
            return false;
        }
        if let Some(rule_port) = self.port {
            if rule_port != port {
                return false;
            }
        }
        if !host_matches(&self.host, host) {
            return false;
        }
        let prefix = if self.path_prefix.is_empty() {
            "/"
        } else {
            self.path_prefix.as_str()
        };
        path_matches(prefix, path)
    }
}

pub fn host_matches(pattern: &str, host: &str) -> bool {
    let pattern = pattern.trim().trim_end_matches('.').to_ascii_lowercase();
    let host = host.trim().trim_end_matches('.').to_ascii_lowercase();
    if pattern.is_empty() || pattern == "*" {
        return true;
    }
    if let Some(rest) = pattern.strip_prefix("*.") {
        host == rest || host.ends_with(&format!(".{rest}"))
    } else {
        host == pattern
    }
}

fn path_matches(prefix: &str, path: &str) -> bool {
    if prefix == "/" {
        return true;
    }
    let path = if path.is_empty() { "/" } else { path };
    path == prefix
        || path.starts_with(prefix)
            && (prefix.ends_with('/') || path[prefix.len()..].starts_with('/'))
}

/// Passive browsing visibility. With no include rules, everything is in scope.
pub fn is_in_scope(rules: &[ScopeRule], host: &str, port: u16, path: &str) -> bool {
    let enabled: Vec<&ScopeRule> = rules.iter().filter(|r| r.enabled).collect();
    if !enabled.iter().any(|r| r.kind == ScopeKind::Include) {
        return true;
    }
    if enabled
        .iter()
        .any(|r| r.kind == ScopeKind::Exclude && r.matches(host, port, path))
    {
        return false;
    }
    enabled
        .iter()
        .any(|r| r.kind == ScopeKind::Include && r.matches(host, port, path))
}

/// Active tools (Repeater, Intruder, AI send) are default-deny until an include matches.
pub fn active_allowed(rules: &[ScopeRule], host: &str, port: u16, path: &str) -> bool {
    let enabled: Vec<&ScopeRule> = rules.iter().filter(|r| r.enabled).collect();
    if !enabled.iter().any(|r| r.kind == ScopeKind::Include) {
        return false;
    }
    if enabled
        .iter()
        .any(|r| r.kind == ScopeKind::Exclude && r.matches(host, port, path))
    {
        return false;
    }
    enabled
        .iter()
        .any(|r| r.kind == ScopeKind::Include && r.matches(host, port, path))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rule(kind: ScopeKind, host: &str, port: Option<u16>, path: &str) -> ScopeRule {
        ScopeRule {
            id: "r".into(),
            project_id: "p".into(),
            enabled: true,
            kind,
            host: host.into(),
            port,
            path_prefix: path.into(),
            created_at: 0,
        }
    }

    #[test]
    fn wildcard_and_apex() {
        assert!(host_matches("*.example.com", "api.example.com"));
        assert!(host_matches("*.example.com", "example.com"));
        assert!(!host_matches("*.example.com", "example.net"));
        assert!(host_matches("127.0.0.1", "127.0.0.1"));
        assert!(!host_matches("127.0.0.1", "127.0.0.2"));
    }

    #[test]
    fn active_default_deny() {
        assert!(!active_allowed(&[], "example.com", 443, "/"));
        let include = rule(ScopeKind::Include, "example.com", None, "/");
        assert!(active_allowed(
            &[include.clone()],
            "example.com",
            443,
            "/login"
        ));
        assert!(!active_allowed(&[include], "other.com", 443, "/"));
    }

    #[test]
    fn exclude_wins() {
        let rules = vec![
            rule(ScopeKind::Include, "*.example.com", None, "/"),
            rule(ScopeKind::Exclude, "admin.example.com", None, "/"),
        ];
        assert!(active_allowed(&rules, "www.example.com", 443, "/"));
        assert!(!active_allowed(&rules, "admin.example.com", 443, "/"));
        assert!(is_in_scope(&rules, "www.example.com", 443, "/"));
        assert!(!is_in_scope(&rules, "admin.example.com", 443, "/"));
    }

    #[test]
    fn path_prefix() {
        let include = rule(ScopeKind::Include, "example.com", None, "/api");
        assert!(active_allowed(
            &[include.clone()],
            "example.com",
            443,
            "/api"
        ));
        assert!(active_allowed(
            &[include.clone()],
            "example.com",
            443,
            "/api/v1"
        ));
        assert!(!active_allowed(&[include], "example.com", 443, "/app"));
    }

    #[test]
    fn passive_open_without_includes() {
        assert!(is_in_scope(&[], "anywhere.test", 80, "/"));
    }
}
