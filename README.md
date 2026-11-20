# Lurkwire

Burp Suite + an LLM, built into a browser you live in.

## Status

Pre-alpha, under active development. Ubuntu/Linux first, then macOS and Windows.

## What it is

Lurkwire is an AI-native security browser for developers and pentesters. It is a daily-driver Chromium browser with a built-in intercepting proxy, Repeater, fuzzer, and scanner, plus your own or local LLMs. Capture works with zero setup because we own the browser — and the AI drafts while a human always sends.

## Planned v0.1 features

- Electron/Chromium daily-driver browser
- Rust intercepting TLS MITM proxy with a per-install CA trusted only inside the app
- Per-project traffic store (HTTP history)
- Repeater
- Intruder-lite
- JWT/session tooling
- OOB collaborator
- Passive scanner and anomaly detection
- Recon / site-intel panel
- Provider-agnostic LLM layer (bring your own OpenAI, Anthropic, Gemini, or Grok keys, or run local Ollama, LM Studio, or any OpenAI-compatible endpoint) — AI drafts, a human sends

## Guardrails by design

- Scope allowlist enforced in the proxy
- Rate limiting
- Global kill switch
- Append-only, hash-chained audit log
- Authorization attestation per project
- Secret redaction before anything goes to a cloud model
- Local-only mode

## Architecture at a glance

```mermaid
flowchart LR
  Shell[Electron / Chromium shell] --> Proxy[Rust proxy sidecar]
  Proxy --> Targets[In-scope targets]
  Proxy --> Store[(SQLite traffic store)]
  Shell --> Store
  Shell --> LLM[LLM layer]
  LLM --> Cloud[BYO OpenAI / Anthropic / Gemini / Grok]
  LLM --> Local[Ollama / LM Studio / OpenAI-compatible]
```

## Roadmap

Linux first, then macOS and Windows.

## Responsible use

Lurkwire is only for systems you own or are explicitly authorized to test. Do not use it against systems without permission.

## License

TBD
