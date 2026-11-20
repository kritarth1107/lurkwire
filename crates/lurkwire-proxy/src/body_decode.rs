use anyhow::Result;
use encoding_rs::{Encoding, UTF_8, WINDOWS_1252};
use flate2::read::{DeflateDecoder, GzDecoder, ZlibDecoder};
use std::io::Read;

use crate::types::HeaderPair;

/// Decompress `Content-Encoding` (gzip / deflate / br / zstd) and decode
/// the body using the charset from headers, a BOM, or an HTML meta tag.
pub fn decode_http_body(bytes: &[u8], headers: &[HeaderPair]) -> Vec<u8> {
    match decompress_body(bytes, &content_encodings(headers)) {
        Ok(decoded) => decoded,
        Err(_) => bytes.to_vec(),
    }
}

pub fn decode_http_text(bytes: &[u8], headers: &[HeaderPair]) -> String {
    let decoded = decode_http_body(bytes, headers);
    decode_text(&decoded, headers)
}

pub fn content_encodings(headers: &[HeaderPair]) -> Vec<String> {
    header_values(headers, "content-encoding")
        .into_iter()
        .flat_map(|value| {
            value
                .split(',')
                .map(|part| part.trim().to_ascii_lowercase())
                .filter(|part| !part.is_empty() && part != "identity")
                .collect::<Vec<_>>()
        })
        .collect()
}

pub fn decompress_body(bytes: &[u8], encodings: &[String]) -> Result<Vec<u8>> {
    let mut data = bytes.to_vec();
    for encoding in encodings.iter().rev() {
        data = match encoding.as_str() {
            "gzip" | "x-gzip" => gunzip(&data)?,
            "deflate" => inflate_http(&data)?,
            "br" | "brotli" => brotli_dec(&data)?,
            "zstd" | "zst" => zstd::decode_all(&data[..])?,
            _ => data,
        };
    }
    Ok(data)
}

fn gunzip(data: &[u8]) -> Result<Vec<u8>> {
    let mut decoder = GzDecoder::new(data);
    let mut out = Vec::new();
    decoder.read_to_end(&mut out)?;
    Ok(out)
}

/// HTTP "deflate" may be a zlib wrapper (RFC 1950) or raw DEFLATE (RFC 1951).
fn inflate_http(data: &[u8]) -> Result<Vec<u8>> {
    let mut out = Vec::new();
    if ZlibDecoder::new(data).read_to_end(&mut out).is_ok() && !out.is_empty() {
        return Ok(out);
    }
    out.clear();
    DeflateDecoder::new(data).read_to_end(&mut out)?;
    Ok(out)
}

fn brotli_dec(data: &[u8]) -> Result<Vec<u8>> {
    let mut decoder = brotli::Decompressor::new(data, 4096);
    let mut out = Vec::new();
    decoder.read_to_end(&mut out)?;
    Ok(out)
}

fn header_values(headers: &[HeaderPair], name: &str) -> Vec<String> {
    headers
        .iter()
        .filter(|h| h.name.eq_ignore_ascii_case(name))
        .map(|h| h.value.clone())
        .collect()
}

pub fn content_type(headers: &[HeaderPair]) -> Option<String> {
    header_values(headers, "content-type").into_iter().next()
}

pub fn charset_from_headers(headers: &[HeaderPair]) -> Option<String> {
    content_type(headers).and_then(|ct| charset_from_content_type(&ct))
}

pub fn charset_from_content_type(content_type: &str) -> Option<String> {
    for part in content_type.split(';').skip(1) {
        let part = part.trim();
        let Some((key, value)) = part.split_once('=') else {
            continue;
        };
        if key.trim().eq_ignore_ascii_case("charset") {
            let raw = value.trim().trim_matches('"').trim_matches('\'');
            if !raw.is_empty() {
                return Some(raw.to_string());
            }
        }
    }
    None
}

fn charset_from_html(bytes: &[u8]) -> Option<String> {
    let prefix = &bytes[..bytes.len().min(2048)];
    let ascii = String::from_utf8_lossy(prefix).to_ascii_lowercase();
    if let Some(idx) = ascii.find("charset=") {
        let rest = &ascii[idx + 8..];
        let rest = rest.trim_start_matches(['"', '\'', ' ']);
        let end = rest
            .find(|c: char| !c.is_ascii_alphanumeric() && c != '-' && c != '_')
            .unwrap_or(rest.len());
        let name = &rest[..end];
        if !name.is_empty() {
            return Some(name.to_string());
        }
    }
    None
}

fn charset_from_bom(bytes: &[u8]) -> Option<&'static Encoding> {
    if bytes.len() >= 3 && bytes[..3] == [0xEF, 0xBB, 0xBF] {
        return Some(UTF_8);
    }
    if bytes.len() >= 2 && bytes[..2] == [0xFF, 0xFE] {
        return Some(encoding_rs::UTF_16LE);
    }
    if bytes.len() >= 2 && bytes[..2] == [0xFE, 0xFF] {
        return Some(encoding_rs::UTF_16BE);
    }
    None
}

pub fn decode_text(bytes: &[u8], headers: &[HeaderPair]) -> String {
    if bytes.is_empty() {
        return String::new();
    }
    if let Some(enc) = charset_from_bom(bytes) {
        let (text, _, _) = enc.decode(bytes);
        return text.into_owned();
    }
    let label = charset_from_headers(headers)
        .or_else(|| charset_from_html(bytes))
        .unwrap_or_else(|| "utf-8".into());
    let encoding = Encoding::for_label(label.as_bytes()).unwrap_or(UTF_8);
    let (text, _, had_errors) = encoding.decode(bytes);
    if had_errors && encoding == UTF_8 && charset_from_headers(headers).is_none() {
        let (fallback, _, _) = WINDOWS_1252.decode(bytes);
        return fallback.into_owned();
    }
    text.into_owned()
}

pub fn preview_text(bytes: &[u8], headers: &[HeaderPair], max_chars: usize) -> Option<String> {
    if bytes.is_empty() {
        return None;
    }
    let text = decode_http_text(bytes, headers);
    if text.is_empty() {
        return None;
    }
    if text.as_bytes().contains(&0) {
        return None;
    }
    let mut end = text.len().min(max_chars);
    while end > 0 && !text.is_char_boundary(end) {
        end -= 1;
    }
    Some(text[..end].to_string())
}

pub fn indexable_text(bytes: &[u8], headers: &[HeaderPair], max_chars: usize) -> String {
    if let Some(ct) = content_type(headers) {
        let ct = ct.to_ascii_lowercase();
        if ct.contains("image/")
            || ct.contains("octet-stream")
            || ct.contains("font/")
            || ct.contains("video/")
            || ct.contains("audio/")
            || ct.contains("zip")
            || ct.contains("wasm")
        {
            return String::new();
        }
    }
    preview_text(bytes, headers, max_chars).unwrap_or_default()
}

#[cfg(test)]
fn header(name: &str, value: &str) -> HeaderPair {
    HeaderPair {
        name: name.into(),
        value: value.into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use flate2::write::{DeflateEncoder, GzEncoder, ZlibEncoder};
    use flate2::Compression;
    use std::io::Write;

    fn gzip(data: &[u8]) -> Vec<u8> {
        let mut enc = GzEncoder::new(Vec::new(), Compression::default());
        enc.write_all(data).unwrap();
        enc.finish().unwrap()
    }

    fn zlib(data: &[u8]) -> Vec<u8> {
        let mut enc = ZlibEncoder::new(Vec::new(), Compression::default());
        enc.write_all(data).unwrap();
        enc.finish().unwrap()
    }

    fn raw_deflate(data: &[u8]) -> Vec<u8> {
        let mut enc = DeflateEncoder::new(Vec::new(), Compression::default());
        enc.write_all(data).unwrap();
        enc.finish().unwrap()
    }

    fn brotli(data: &[u8]) -> Vec<u8> {
        let mut out = Vec::new();
        {
            let mut enc = brotli::CompressorWriter::new(&mut out, 4096, 5, 22);
            enc.write_all(data).unwrap();
            enc.flush().unwrap();
        }
        out
    }

    const HTML: &str = "<!doctype html><html><body>Example Domain</body></html>";

    #[test]
    fn decodes_gzip_br_deflate_and_zstd() {
        let plain = HTML.as_bytes();
        let cases: Vec<(&str, Vec<u8>)> = vec![
            ("gzip", gzip(plain)),
            ("x-gzip", gzip(plain)),
            ("br", brotli(plain)),
            ("deflate", zlib(plain)),
            ("deflate", raw_deflate(plain)),
            ("zstd", zstd::encode_all(plain, 0).unwrap()),
        ];
        for (encoding, compressed) in cases {
            assert_ne!(compressed, plain, "{encoding} should compress");
            let headers = [header("Content-Encoding", encoding), header("Content-Type", "text/html; charset=utf-8")];
            let text = decode_http_text(&compressed, &headers);
            assert!(
                text.contains("Example Domain"),
                "failed to decode {encoding}: {text:?}"
            );
        }
    }

    #[test]
    fn decodes_stacked_encodings_in_reverse() {
        let plain = b"stacked-body";
        let compressed = gzip(&zstd::encode_all(&plain[..], 0).unwrap());
        let headers = [header("Content-Encoding", "zstd, gzip")];
        let out = decode_http_body(&compressed, &headers);
        assert_eq!(out, plain);
    }

    #[test]
    fn decodes_charset_from_header_and_html_meta() {
        let latin = b"Caf\xe9";
        let headers = [header("Content-Type", "text/plain; charset=iso-8859-1")];
        assert_eq!(decode_http_text(latin, &headers), "Caf\u{e9}");

        let windows = b"\x80 trade";
        let headers = [header("Content-Type", r#"text/plain; charset="windows-1252""#)];
        assert_eq!(decode_http_text(windows, &headers), "\u{20ac} trade");

        let meta = b"<meta charset=\"iso-8859-1\">Caf\xe9";
        let decoded = decode_http_text(meta, &[]);
        assert!(decoded.contains("Caf\u{e9}"), "{decoded:?}");
        assert!(!decoded.contains("\u{fffd}"));
    }

    #[test]
    fn gzip_mojibake_is_not_returned_as_preview() {
        let compressed = gzip(HTML.as_bytes());
        let headers = [
            header("Content-Encoding", "gzip"),
            header("Content-Type", "text/html"),
        ];
        let preview = preview_text(&compressed, &headers, 1024).unwrap();
        assert!(preview.contains("Example Domain"));
        assert!(!preview.contains("\u{fffd}") || preview.starts_with("<!doctype"));
        // Compressed bytes must not leak through as "text".
        assert!(!preview.as_bytes().starts_with(&[0x1f, 0x8b]));
    }
}
