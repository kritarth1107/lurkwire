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
    injection_signals(flow, &req_text, &resp_text, mime, &mut out);
    request_smuggling_hints(flow, &mut out);
    cache_poisoning_hints(flow, &resp_text, &mut out);
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


fn injection_signals(
    flow: &ScanInput<'_>,
    req_text: &str,
    resp_text: &str,
    mime: &str,
    out: &mut Vec<FindingDraft>,
) {
    let query = urlencoding_decode(&flow.query);
    let blob = format!("{} {} {}", query, req_text, String::from_utf8_lossy(flow.req_body));
    let blob_l = blob.to_ascii_lowercase();
    let looks_inject = blob_l.contains("union select")
        || blob_l.contains("' or '")
        || blob_l.contains("' or 1=1")
        || blob_l.contains(" or 1=1--")
        || blob_l.contains("\" or \"")
        || blob_l.contains("' or '1'='1");

    if looks_inject {
        let hashes = md5_hashes(resp_text);
        let first_names = resp_text.to_ascii_lowercase().matches("first name:").count();
        if hashes.len() >= 2 || first_names >= 2 {
            let evidence = if hashes.len() >= 2 {
                format!("hashes: {}", hashes.join(", "))
            } else {
                clip(resp_text, 400)
            };
            push(
                out,
                flow,
                "sqli-data",
                "SQL injection appears to have returned data",
                Severity::High,
                "The request used SQL injection syntax and the response looks like a database dump (repeated rows or password hashes).",
                &evidence,
            );
        }
    }

    let htmlish = mime.is_empty()
        || mime.to_ascii_lowercase().contains("html")
        || mime.to_ascii_lowercase().contains("xml")
        || resp_text.to_ascii_lowercase().contains("<html")
        || resp_text.to_ascii_lowercase().contains("<pre");
    if htmlish {
        for value in query_values(&query) {
            if !looks_like_xss_payload(&value) {
                continue;
            }
            if resp_text.contains(&value) {
                push(
                    out,
                    flow,
                    "reflected-xss",
                    "Reflected cross-site scripting",
                    Severity::High,
                    "A request parameter that looks like a script or HTML payload was reflected in the response without encoding.",
                    &clip(&value, 200),
                );
                break;
            }
        }
    }
}

fn query_values(query: &str) -> Vec<String> {
    let raw = query.trim_start_matches('?');
    let mut values = Vec::new();
    for part in raw.split('&') {
        if part.is_empty() {
            continue;
        }
        let value = part.split_once('=').map(|(_, v)| v).unwrap_or(part);
        let decoded = urlencoding_decode(value);
        if !decoded.is_empty() {
            values.push(decoded);
        }
    }
    values
}

fn looks_like_xss_payload(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    lower.contains("<script")
        || lower.contains("javascript:")
        || lower.contains("onerror=")
        || lower.contains("onload=")
        || lower.contains("<img")
        || lower.contains("<svg")
        || lower.contains("<iframe")
}

fn md5_hashes(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let bytes = text.as_bytes();
    let mut i = 0;
    while i + 32 <= bytes.len() {
        if bytes[i..i + 32].iter().all(|b| b.is_ascii_hexdigit()) {
            let prev_ok = i == 0 || !bytes[i - 1].is_ascii_hexdigit();
            let next_ok = i + 32 == bytes.len() || !bytes[i + 32].is_ascii_hexdigit();
            if prev_ok && next_ok {
                let hash = text[i..i + 32].to_ascii_lowercase();
                if !out.contains(&hash) {
                    out.push(hash);
                }
                i += 32;
                continue;
            }
        }
        i += 1;
    }
    out
}

fn urlencoding_decode(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let bytes = input.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'+' {
            out.push(' ');
            i += 1;
            continue;
        }
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = &input[i + 1..i + 3];
            if let Ok(v) = u8::from_str_radix(hex, 16) {
                out.push(v as char);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i] as char);
        i += 1;
    }
    out
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


fn request_smuggling_hints(flow: &ScanInput<'_>, out: &mut Vec<FindingDraft>) {
    let cls = headers(&flow.req_headers, "content-length");
    let tes = headers(&flow.req_headers, "transfer-encoding");
    if !cls.is_empty() && !tes.is_empty() {
        push(
            out,
            flow,
            "cl-te-both-present",
            "Request sends both Content-Length and Transfer-Encoding",
            Severity::Medium,
            "HTTP/1.1 frontends and backends that disagree on CL vs TE can be abused for request smuggling. This is a passive hint only; Lurkwire did not mutate the request.",
            &format!("Content-Length: {cls:?}; Transfer-Encoding: {tes:?}"),
        );
    }
    if cls.len() > 1 {
        push(
            out,
            flow,
            "duplicate-content-length",
            "Duplicate Content-Length headers",
            Severity::Medium,
            "Conflicting Content-Length values are a classic desynchronization primitive.",
            &cls.join(", "),
        );
    }
    for te in &tes {
        let lower = te.to_ascii_lowercase();
        if lower.contains("chunked") && lower != "chunked" {
            push(
                out,
                flow,
                "obfuscated-transfer-encoding",
                "Unusual Transfer-Encoding value",
                Severity::Low,
                "Obfuscated or stacked Transfer-Encoding values can be parsed differently by proxies and origin servers.",
                te,
            );
        }
    }
}

fn cache_poisoning_hints(flow: &ScanInput<'_>, resp_text: &str, out: &mut Vec<FindingDraft>) {
    const UNKEYED: &[&str] = &[
        "x-forwarded-host",
        "x-forwarded-scheme",
        "x-original-url",
        "x-rewrite-url",
        "x-host",
        "forwarded",
    ];
    let vary = header(&flow.resp_headers, "vary").unwrap_or("").to_ascii_lowercase();
    let location = header(&flow.resp_headers, "location").unwrap_or("");
    let cors = header(&flow.resp_headers, "access-control-allow-origin").unwrap_or("");
    for name in UNKEYED {
        let values = headers(&flow.req_headers, name);
        for value in values {
            if value.len() < 3 {
                continue;
            }
            let reflected = resp_text.contains(value) || location.contains(value) || cors.contains(value);
            if !reflected {
                continue;
            }
            let keyed = vary.split(',').any(|item| item.trim().eq_ignore_ascii_case(name));
            push(
                out,
                flow,
                "unkeyed-header-reflected",
                &format!("Possible unkeyed input: {name} is reflected"),
                if keyed { Severity::Low } else { Severity::Medium },
                if keyed {
                    "The header value is reflected, but Vary lists it. Confirm the cache key actually includes it."
                } else {
                    "The request header is reflected in the response and does not appear in Vary. If a shared cache is in front of this app, this may be a cache-poisoning primitive."
                },
                value,
            );
        }
    }
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

    fn input_on<'a>(
        path: &'a str,
        query: &'a str,
        status: u16,
        headers: &'a [HeaderPair],
        body: &'a str,
    ) -> ScanInput<'a> {
        let mut base = input(status, headers, body, &[]);
        base.path = path;
        base.query = query;
        base
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

    #[test]
    fn flags_cl_te_and_duplicate_content_length() {
        let req = vec![
            HeaderPair { name: "Content-Length".into(), value: "5".into() },
            HeaderPair { name: "Content-Length".into(), value: "10".into() },
            HeaderPair { name: "Transfer-Encoding".into(), value: "chunked".into() },
        ];
        let ids: Vec<_> = scan_flow(&input(200, &[], "ok", &req)).into_iter().map(|x| x.check_id).collect();
        assert!(ids.contains(&"cl-te-both-present".into()));
        assert!(ids.contains(&"duplicate-content-length".into()));
    }

    #[test]
    fn flags_reflected_forwarded_host_without_vary() {
        let req = vec![HeaderPair { name: "X-Forwarded-Host".into(), value: "evil.example".into() }];
        let resp = vec![HeaderPair { name: "Content-Type".into(), value: "text/html".into() }];
        let ids: Vec<_> = scan_flow(&input(200, &resp, "<html>https://evil.example/app</html>", &req))
            .into_iter()
            .map(|x| x.check_id)
            .collect();
        assert!(ids.contains(&"unkeyed-header-reflected".into()));
    }


    #[test]
    fn flags_sql_dump_and_reflected_xss() {
        let headers = vec![HeaderPair { name: "Content-Type".into(), value: "text/html".into() }];
        let dump = "<pre>First name: admin<br />Surname: 5f4dcc3b5aa765d61d8327deb882cf99</pre>\
<pre>First name: gordonb<br />Surname: e99a18c428cb38d5f260853678922e03</pre>";
        let ids: Vec<_> = scan_flow(&input_on(
            "/vulnerabilities/sqli/",
            "id=-1'+UNION+SELECT+user,+password+FROM+users%23&Submit=Submit",
            200,
            &headers,
            dump,
        ))
        .into_iter()
        .map(|x| x.check_id)
        .collect();
        assert!(ids.contains(&"sqli-data".to_string()), "{ids:?}");

        let xss_body = "Hello <script>alert(1)</script>";
        let ids: Vec<_> = scan_flow(&input_on(
            "/vulnerabilities/xss_r/",
            "name=%3Cscript%3Ealert(1)%3C/script%3E",
            200,
            &headers,
            xss_body,
        ))
        .into_iter()
        .map(|x| x.check_id)
        .collect();
        assert!(ids.contains(&"reflected-xss".to_string()), "{ids:?}");

        let safe = "Hello &lt;script&gt;alert(1)&lt;/script&gt;";
        let ids: Vec<_> = scan_flow(&input_on(
            "/vulnerabilities/xss_r/",
            "name=%3Cscript%3Ealert(1)%3C/script%3E",
            200,
            &headers,
            safe,
        ))
        .into_iter()
        .map(|x| x.check_id)
        .collect();
        assert!(!ids.contains(&"reflected-xss".to_string()), "encoded reflection must not flag");
    }

}
