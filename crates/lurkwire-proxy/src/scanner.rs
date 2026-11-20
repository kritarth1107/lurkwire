use crate::types::{FindingDraft, HeaderPair, Severity};

pub struct ScanInput<'a> {
    pub id: &'a str,
    pub project_id: &'a str,
    pub method: &'a str,
    pub scheme: &'a str,
    pub host: &'a str,
    pub path: &'a str,
    pub query: &'a str,
    pub status: Option<u16>,
    pub req_headers: &'a [HeaderPair],
    pub resp_headers: &'a [HeaderPair],
    pub req_body: &'a [u8],
    pub resp_body: &'a [u8],
}

pub fn scan_flow(flow: &ScanInput<'_>) -> Vec<FindingDraft> {
    let mut out = Vec::new();
    let req_text = text_preview(&flow.req_body);
    let resp_text = text_preview(&flow.resp_body);
    let mime = header(&flow.resp_headers, "content-type").unwrap_or("");

    missing_security_headers(flow, &mut out);
    cookie_flags(flow, &mut out);
    cors_issues(flow, &mut out);
    info_banners(flow, &mut out);
    body_issues(flow, &resp_text, mime, &mut out);
    request_issues(flow, &req_text, &mut out);
    out
}

fn push(
    out: &mut Vec<FindingDraft>,
    flow: &ScanInput<'_>,
    check_id: &str,
    title: &str,
    severity: Severity,
    detail: &str,
    evidence: &str,
) {
    out.push(FindingDraft {
        project_id: flow.project_id.to_string(),
        flow_id: flow.id.to_string(),
        check_id: check_id.into(),
        title: title.into(),
        severity,
        detail: detail.into(),
        evidence: clip(evidence, 512),
        host: flow.host.to_string(),
        path: flow.path.to_string(),
        method: flow.method.to_string(),
        status: flow.status,
    });
}

fn missing_security_headers(flow: &ScanInput<'_>, out: &mut Vec<FindingDraft>) {
    if flow.status.map(|s| s < 200 || s >= 400).unwrap_or(true) {
        return;
    }
    let mime = header(&flow.resp_headers, "content-type").unwrap_or("");
    let is_html = mime.contains("text/html") || mime.contains("application/xhtml");
    if flow.scheme == "https" && header(&flow.resp_headers, "strict-transport-security").is_none() {
        push(
            out,
            flow,
            "missing-hsts",
            "Missing Strict-Transport-Security",
            Severity::Low,
            "HTTPS responses should send HSTS so browsers refuse later HTTP downgrades.",
            "",
        );
    }
    if is_html && header(&flow.resp_headers, "content-security-policy").is_none() {
        push(
            out,
            flow,
            "missing-csp",
            "Missing Content-Security-Policy",
            Severity::Low,
            "HTML responses without a CSP are easier to exploit with XSS or content injection.",
            mime,
        );
    }
    if is_html
        && header(&flow.resp_headers, "x-frame-options").is_none()
        && header(&flow.resp_headers, "content-security-policy")
            .map(|v| !v.to_ascii_lowercase().contains("frame-ancestors"))
            .unwrap_or(true)
    {
        push(
            out,
            flow,
            "clickjacking",
            "No frame-ancestors or X-Frame-Options",
            Severity::Low,
            "This HTML response can be framed by another origin unless a frame policy is set.",
            "",
        );
    }
    if header(&flow.resp_headers, "x-content-type-options").is_none() && !mime.is_empty() {
        push(
            out,
            flow,
            "missing-xcto",
            "Missing X-Content-Type-Options",
            Severity::Info,
            "Without nosniff, some browsers may MIME-sniff this response.",
            mime,
        );
    }
}

fn cookie_flags(flow: &ScanInput<'_>, out: &mut Vec<FindingDraft>) {
    for cookie in headers(&flow.resp_headers, "set-cookie") {
        let lower = cookie.to_ascii_lowercase();
        let name = cookie.split('=').next().unwrap_or("cookie").trim();
        let sessionish = ["session", "sess", "auth", "token", "sid", "jwt", "login"]
            .iter()
            .any(|k| name.to_ascii_lowercase().contains(k));
        if flow.scheme == "https" && !lower.contains("secure") {
            push(
                out,
                flow,
                "cookie-missing-secure",
                "Cookie missing Secure flag",
                if sessionish { Severity::Medium } else { Severity::Low },
                "This cookie can be sent on unencrypted HTTP requests.",
                cookie,
            );
        }
        if sessionish && !lower.contains("httponly") {
            push(
                out,
                flow,
                "cookie-missing-httponly",
                "Session cookie missing HttpOnly",
                Severity::Medium,
                "JavaScript can read this session-like cookie if the page is XSS'd.",
                cookie,
            );
        }
        if !lower.contains("samesite") {
            push(
                out,
                flow,
                "cookie-missing-samesite",
                "Cookie missing SameSite",
                Severity::Low,
                "Without SameSite, the cookie may be sent on cross-site requests.",
                cookie,
            );
        }
    }
}

fn cors_issues(flow: &ScanInput<'_>, out: &mut Vec<FindingDraft>) {
    let acao = header(&flow.resp_headers, "access-control-allow-origin");
    let acac = header(&flow.resp_headers, "access-control-allow-credentials")
        .map(|v| v.eq_ignore_ascii_case("true"))
        .unwrap_or(false);
    let origin = header(&flow.req_headers, "origin");
    if let Some(acao) = acao {
        if acao.trim() == "*" {
            push(
                out,
                flow,
                if acac { "cors-wildcard-credentials" } else { "cors-wildcard" },
                if acac {
                    "CORS allows any origin with credentials"
                } else {
                    "CORS allows any origin"
                },
                if acac { Severity::High } else { Severity::Medium },
                "Access-Control-Allow-Origin is *.",
                acao,
            );
        } else if let Some(origin) = origin {
            if acao == origin && origin != "null" && !is_reflect_safe(origin, &flow.host) {
                push(
                    out,
                    flow,
                    "cors-reflected-origin",
                    "CORS reflects the request Origin",
                    if acac { Severity::High } else { Severity::Medium },
                    "The response echoes the request Origin, so a third-party site may read this response.",
                    &format!("Origin: {origin}"),
                );
            }
        }
    }
}

fn is_reflect_safe(origin: &str, host: &str) -> bool {
    let Ok(url) = url::Url::parse(origin) else {
        return false;
    };
    url.host_str()
        .map(|h| h.eq_ignore_ascii_case(host) || h.ends_with(&format!(".{host}")))
        .unwrap_or(false)
}

fn info_banners(flow: &ScanInput<'_>, out: &mut Vec<FindingDraft>) {
    for name in [
        "server",
        "x-powered-by",
        "x-aspnet-version",
        "x-aspnetmvc-version",
        "x-debug",
    ] {
        if let Some(value) = header(&flow.resp_headers, name) {
            let noisy = name != "server";
            push(
                out,
                flow,
                "tech-banner",
                "Technology banner in headers",
                if noisy { Severity::Low } else { Severity::Info },
                "A response header discloses stack or server details.",
                &format!("{name}: {value}"),
            );
            break;
        }
    }
}

fn body_issues(flow: &ScanInput<'_>, body: &str, mime: &str, out: &mut Vec<FindingDraft>) {
    let lower = body.to_ascii_lowercase();
    if lower.contains("index of /")
        || lower.contains("directory listing")
        || lower.contains("[to parent directory]")
    {
        push(
            out,
            flow,
            "directory-listing",
            "Directory listing",
            Severity::Low,
            "The response looks like an auto-generated directory index.",
            body,
        );
    }
    if looks_like_stack(body) {
        push(
            out,
            flow,
            "stack-trace",
            "Stack trace or debug error in response",
            Severity::Medium,
            "The body appears to contain a framework stack trace or debug exception page.",
            body,
        );
    }
    if flow.status.unwrap_or(0) >= 500 && body.len() > 40 {
        if !out.iter().any(|f| f.check_id == "stack-trace") {
            push(
                out,
                flow,
                "server-error",
                "Server error response",
                Severity::Info,
                "The server returned a 5xx status with a body that may leak internals.",
                &format!("status {}", flow.status.unwrap_or(0)),
            );
        }
    }
    if lower.contains("sourceMappingURL=".to_ascii_lowercase().as_str())
        || (mime.contains("javascript") && lower.contains(".map"))
    {
        push(
            out,
            flow,
            "source-map",
            "JavaScript source map referenced",
            Severity::Info,
            "A source map can expose original source, comments, and hidden endpoints.",
            body,
        );
    }
    if lower.contains("phpinfo()") || lower.contains("<title>phpinfo") || lower.contains("django debug") {
        push(
            out,
            flow,
            "debug-page",
            "Debug or phpinfo page",
            Severity::High,
            "A debug or phpinfo page was captured.",
            body,
        );
    }
    for needle in [
        "sql syntax",
        "mysql_fetch",
        "pg_query",
        "ora-00",
        "sqlite3.operationalerror",
        "unclosed quotation mark",
        "odbc driver",
        "you have an error in your sql",
    ] {
        if lower.contains(needle) {
            push(
                out,
                flow,
                "sql-error",
                "Possible SQL error in response",
                Severity::Medium,
                "The response body looks like a database error.",
                body,
            );
            break;
        }
    }
    if body.contains("BEGIN PRIVATE KEY")
        || body.contains("BEGIN RSA PRIVATE KEY")
        || body.contains("BEGIN OPENSSH PRIVATE KEY")
    {
        push(
            out,
            flow,
            "private-key",
            "Private key material in response",
            Severity::High,
            "The body contains a PEM private key.",
            "BEGIN PRIVATE KEY",
        );
    }
    if looks_like_secret(&format!("{} {}", flow.query, body)) {
        push(
            out,
            flow,
            "secret-disclosure",
            "Possible secret in request or response",
            Severity::Medium,
            "A token, API key, or credential pattern was found.",
            &first_secret_evidence(&format!("{} {}", flow.query, body)),
        );
    }
    if flow.scheme == "http" && (lower.contains("type=\"password\"") || lower.contains("type='password'"))
    {
        push(
            out,
            flow,
            "password-over-http",
            "Password form served over HTTP",
            Severity::Medium,
            "A password field was observed on a cleartext page.",
            flow.path,
        );
    }
}

fn request_issues(flow: &ScanInput<'_>, req_text: &str, out: &mut Vec<FindingDraft>) {
    if flow.query.contains("eyJ") {
        push(
            out,
            flow,
            "jwt-in-query",
            "JWT in the query string",
            Severity::Medium,
            "Tokens in URLs leak via logs, Referer, and history.",
            &flow.query,
        );
    }
    let auth = header(&flow.req_headers, "authorization").unwrap_or("");
    if auth.to_ascii_lowercase().starts_with("bearer eyj") {
        if let Some(token) = auth.split_whitespace().nth(1) {
            if token.split('.').next().unwrap_or("").contains("eyJ") {
                // decode header if possible later; still flag alg none via raw
                if token.contains("eyJhbGciOiJub25l") || token.contains("eyJhbGciOiNONE") {
                    push(
                        out,
                        flow,
                        "jwt-alg-none",
                        "JWT with alg none",
                        Severity::High,
                        "An Authorization bearer token uses the none algorithm.",
                        "alg none",
                    );
                }
            }
        }
    }
    let blob = format!("{} {} {}", flow.path, flow.query, req_text);
    if blob.to_ascii_lowercase().contains("password=")
        && (flow.query.contains("password=") || flow.query.contains("passwd="))
    {
        push(
            out,
            flow,
            "password-in-query",
            "Password in the query string",
            Severity::Medium,
            "Credentials in URLs are logged by proxies, browsers, and servers.",
            &flow.query,
        );
    }
}

fn looks_like_stack(body: &str) -> bool {
    let lower = body.to_ascii_lowercase();
    lower.contains("traceback (most recent call last)")
        || lower.contains("stack trace")
        || lower.contains("at java.")
        || lower.contains("at org.springframework")
        || lower.contains("nullpointerexception")
        || lower.contains("system.nullreferenceexception")
        || lower.contains("php fatal error")
        || lower.contains("fatal error:") && lower.contains(".php")
        || (lower.contains("exception") && lower.contains(".rb:") && lower.contains("from /"))
}

fn looks_like_secret(text: &str) -> bool {
    let lower = text.to_ascii_lowercase();
    lower.contains("akia")
        || lower.contains("aws_secret_access_key")
        || text.contains("sk-live-")
        || text.contains("sk_live_")
        || text.contains("ghp_")
        || text.contains("xoxb-")
        || lower.contains("api_key=")
        || lower.contains("apikey=")
}

fn first_secret_evidence(text: &str) -> String {
    for token in ["AKIA", "sk-live-", "sk_live_", "ghp_", "xoxb-", "api_key=", "apikey="] {
        if let Some(idx) = text.to_ascii_lowercase().find(&token.to_ascii_lowercase()) {
            return clip(&text[idx..], 80);
        }
    }
    clip(text, 80)
}

fn header<'a>(headers: &'a [HeaderPair], name: &str) -> Option<&'a str> {
    headers
        .iter()
        .find(|h| h.name.eq_ignore_ascii_case(name))
        .map(|h| h.value.as_str())
}

fn headers<'a>(headers: &'a [HeaderPair], name: &str) -> Vec<&'a str> {
    headers
        .iter()
        .filter(|h| h.name.eq_ignore_ascii_case(name))
        .map(|h| h.value.as_str())
        .collect()
}

fn text_preview(bytes: &[u8]) -> String {
    const MAX: usize = 64 * 1024;
    let slice = if bytes.len() > MAX { &bytes[..MAX] } else { bytes };
    String::from_utf8_lossy(slice).into_owned()
}

fn clip(s: &str, max: usize) -> String {
    let s = s.trim();
    if s.chars().count() <= max {
        return s.to_string();
    }
    s.chars().take(max).collect::<String>() + "…"
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input<'a>(status: u16, headers: &'a [HeaderPair], body: &'a str, req_headers: &'a [HeaderPair]) -> ScanInput<'a> {
        ScanInput {
            id: "flow-1",
            project_id: "p",
            method: "GET",
            scheme: "https",
            host: "example.com",
            path: "/app",
            query: "",
            status: Some(status),
            req_headers,
            resp_headers: headers,
            req_body: b"",
            resp_body: body.as_bytes(),
        }
    }

    #[test]
    fn flags_insecure_session_cookie_and_wildcard_cors() {
        let headers = vec![
            HeaderPair { name: "Content-Type".into(), value: "text/html".into() },
            HeaderPair { name: "Set-Cookie".into(), value: "session=abc; Path=/".into() },
            HeaderPair { name: "Access-Control-Allow-Origin".into(), value: "*".into() },
            HeaderPair { name: "Access-Control-Allow-Credentials".into(), value: "true".into() },
        ];
        let ids: Vec<_> = scan_flow(&input(200, &headers, "<html></html>", &[])).into_iter().map(|x| x.check_id).collect();
        assert!(ids.contains(&"cookie-missing-secure".into()));
        assert!(ids.contains(&"cookie-missing-httponly".into()));
        assert!(ids.contains(&"cors-wildcard-credentials".into()));
        assert!(ids.contains(&"missing-csp".into()));
        assert!(ids.contains(&"missing-hsts".into()));
    }

    #[test]
    fn flags_stack_trace_and_private_key() {
        let headers = vec![HeaderPair { name: "Content-Type".into(), value: "text/plain".into() }];
        let body = "Traceback (most recent call last):\n  File \"app.py\", line 1\nBEGIN RSA PRIVATE KEY\nMIIB";
        let ids: Vec<_> = scan_flow(&input(500, &headers, body, &[])).into_iter().map(|x| x.check_id).collect();
        assert!(ids.contains(&"stack-trace".into()));
        assert!(ids.contains(&"private-key".into()));
    }

    #[test]
    fn reflects_cors_origin() {
        let headers = vec![HeaderPair {
            name: "Access-Control-Allow-Origin".into(),
            value: "https://evil.example".into(),
        }];
        let req = vec![HeaderPair { name: "Origin".into(), value: "https://evil.example".into() }];
        let ids: Vec<_> = scan_flow(&input(200, &headers, "ok", &req)).into_iter().map(|x| x.check_id).collect();
        assert!(ids.contains(&"cors-reflected-origin".into()));
    }
}
