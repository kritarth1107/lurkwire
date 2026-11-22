use anyhow::{Context, Result};
use regex::Regex;
use serde::{Deserialize, Serialize};

use crate::types::{url_from_parts, HeaderPair};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum MatchWhere {
    Url,
    Headers,
    Body,
    Anywhere,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum MatchDirection {
    Request,
    Response,
    Both,
}

impl Default for MatchDirection {
    fn default() -> Self {
        Self::Both
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchRule {
    pub id: String,
    pub project_id: String,
    pub enabled: bool,
    pub name: String,
    #[serde(rename = "match")]
    pub pattern: String,
    pub replace: String,
    pub regex: bool,
    #[serde(rename = "where")]
    pub where_part: MatchWhere,
    #[serde(default)]
    pub direction: MatchDirection,
    pub created_at: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NewMatchRule {
    pub project_id: Option<String>,
    pub enabled: Option<bool>,
    pub name: Option<String>,
    #[serde(rename = "match")]
    pub pattern: String,
    pub replace: String,
    pub regex: Option<bool>,
    #[serde(rename = "where")]
    pub where_part: Option<MatchWhere>,
    pub direction: Option<MatchDirection>,
}

#[derive(Debug, Clone, Default)]
pub struct Applied {
    pub url: String,
    pub headers: Vec<HeaderPair>,
    pub body: Vec<u8>,
    pub names: Vec<String>,
}

pub fn rules_for<'a>(rules: &'a [MatchRule], direction: MatchDirection) -> Vec<&'a MatchRule> {
    rules
        .iter()
        .filter(|rule| {
            rule.enabled
                && !rule.pattern.is_empty()
                && (rule.direction == MatchDirection::Both || rule.direction == direction)
        })
        .collect()
}

pub fn has_direction(rules: &[MatchRule], direction: MatchDirection) -> bool {
    !rules_for(rules, direction).is_empty()
}

fn rewrite(input: &str, rule: &MatchRule) -> Result<Option<String>> {
    if rule.regex {
        let re = Regex::new(&rule.pattern).with_context(|| format!("invalid regex in {}", rule.name))?;
        let next = re.replace_all(input, rule.replace.as_str()).into_owned();
        if next == input {
            return Ok(None);
        }
        return Ok(Some(next));
    }
    if !input.contains(&rule.pattern) {
        return Ok(None);
    }
    Ok(Some(input.replace(&rule.pattern, &rule.replace)))
}

fn applies_to(rule: &MatchRule, part: MatchWhere) -> bool {
    rule.where_part == MatchWhere::Anywhere || rule.where_part == part
}

pub fn apply_message(
    url: &str,
    headers: &[HeaderPair],
    body: &[u8],
    rules: &[MatchRule],
    direction: MatchDirection,
) -> Result<Applied> {
    let mut url = url.to_string();
    let mut headers = headers.to_vec();
    let mut body = body.to_vec();
    let mut names = Vec::new();
    for rule in rules_for(rules, direction) {
        let mut hit = false;
        if applies_to(rule, MatchWhere::Url) {
            if let Some(next) = rewrite(&url, rule)? {
                url = next;
                hit = true;
            }
        }
        if applies_to(rule, MatchWhere::Headers) {
            for header in &mut headers {
                if let Some(next) = rewrite(&header.value, rule)? {
                    header.value = next;
                    hit = true;
                }
                if let Some(next) = rewrite(&header.name, rule)? {
                    header.name = next;
                    hit = true;
                }
            }
        }
        if applies_to(rule, MatchWhere::Body) {
            if let Ok(text) = std::str::from_utf8(&body) {
                if let Some(next) = rewrite(text, rule)? {
                    body = next.into_bytes();
                    hit = true;
                }
            }
        }
        if hit && !names.iter().any(|name| name == &rule.name) {
            names.push(rule.name.clone());
        }
    }
    Ok(Applied {
        url,
        headers,
        body,
        names,
    })
}

pub struct RequestParts {
    pub scheme: String,
    pub host: String,
    pub port: u16,
    pub path: String,
    pub query: String,
    pub headers: Vec<HeaderPair>,
    pub body: Vec<u8>,
    pub names: Vec<String>,
}

pub fn apply_request(
    scheme: &str,
    host: &str,
    port: u16,
    path: &str,
    query: &str,
    headers: &[HeaderPair],
    body: &[u8],
    rules: &[MatchRule],
) -> Result<RequestParts> {
    let url = url_from_parts(scheme, host, port, path, query);
    let applied = apply_message(&url, headers, body, rules, MatchDirection::Request)?;
    let (scheme, host, port, path, query) = parse_url_parts(&applied.url, scheme, host, port, path, query);
    Ok(RequestParts {
        scheme,
        host,
        port,
        path,
        query,
        headers: applied.headers,
        body: applied.body,
        names: applied.names,
    })
}

fn parse_url_parts(
    url: &str,
    scheme: &str,
    host: &str,
    port: u16,
    path: &str,
    query: &str,
) -> (String, String, u16, String, String) {
    match url::Url::parse(url) {
        Ok(parsed) => {
            let next_scheme = if parsed.scheme().is_empty() {
                scheme.to_string()
            } else {
                parsed.scheme().to_string()
            };
            let next_host = parsed.host_str().unwrap_or(host).to_string();
            let next_port = parsed
                .port_or_known_default()
                .unwrap_or(port);
            let next_path = if parsed.path().is_empty() {
                path.to_string()
            } else {
                parsed.path().to_string()
            };
            let next_query = parsed.query().unwrap_or("").to_string();
            (next_scheme, next_host, next_port, next_path, next_query)
        }
        Err(_) => (
            scheme.to_string(),
            host.to_string(),
            port,
            path.to_string(),
            query.to_string(),
        ),
    }
}

pub fn apply_response(
    url: &str,
    headers: &[HeaderPair],
    body: &[u8],
    rules: &[MatchRule],
) -> Result<Applied> {
    apply_message(url, headers, body, rules, MatchDirection::Response)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rule(name: &str, pattern: &str, replace: &str, regex: bool, where_part: MatchWhere, direction: MatchDirection) -> MatchRule {
        MatchRule {
            id: name.to_string(),
            project_id: "p".into(),
            enabled: true,
            name: name.into(),
            pattern: pattern.into(),
            replace: replace.into(),
            regex,
            where_part,
            direction,
            created_at: 0,
        }
    }

    #[test]
    fn rewrites_request_url_and_header() {
        let rules = [rule(
            "to-prod",
            "staging.example.com",
            "example.com",
            false,
            MatchWhere::Anywhere,
            MatchDirection::Request,
        )];
        let out = apply_request(
            "https",
            "staging.example.com",
            443,
            "/v1/users",
            "",
            &[HeaderPair {
                name: "Host".into(),
                value: "staging.example.com".into(),
            }],
            b"ok",
            &rules,
        )
        .unwrap();
        assert_eq!(out.host, "example.com");
        assert_eq!(out.headers[0].value, "example.com");
        assert_eq!(out.names, vec!["to-prod"]);
    }

    #[test]
    fn response_rules_do_not_touch_requests() {
        let rules = [rule(
            "hide",
            "secret",
            "redacted",
            false,
            MatchWhere::Body,
            MatchDirection::Response,
        )];
        let req = apply_request("http", "x", 80, "/", "", &[], b"secret", &rules).unwrap();
        assert_eq!(req.body, b"secret");
        let resp = apply_response("http://x/", &[], b"secret", &rules).unwrap();
        assert_eq!(resp.body, b"redacted");
    }

    #[test]
    fn regex_body_replace() {
        let rules = [rule(
            "role",
            "role=(\\w+)",
            "role=admin",
            true,
            MatchWhere::Body,
            MatchDirection::Both,
        )];
        let out = apply_request("http", "x", 80, "/", "", &[], b"role=user", &rules).unwrap();
        assert_eq!(out.body, b"role=admin");
    }
}
