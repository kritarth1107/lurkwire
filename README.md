# Lurkwire

Burp Suite + an LLM, built into a browser you live in.

## Status

Pre-alpha, under active development. Ubuntu/Linux first, then macOS and Windows.

## What it is

Lurkwire is an AI-native security browser for developers, pentesters, and bug bounty hunters. It is a daily-driver Chromium browser with a built-in intercepting proxy, Repeater, fuzzer, and scanner, plus your own or local LLMs. Capture works with zero setup because the proxy is built into the browser — and the AI drafts while a human always sends.

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
  Proxy --> Targets[Targets]
  Proxy --> Store[(SQLite traffic store)]
  Shell --> Store
  Shell --> LLM[LLM layer]
  LLM --> Cloud[BYO OpenAI / Anthropic / Gemini / Grok]
  LLM --> Local[Ollama / LM Studio / OpenAI-compatible]
```

## Repository layout

- `apps/desktop` — Electron shell (React + Vite)
- `crates/lurkwire-proxy` — Rust intercepting proxy sidecar
- `docs/PROGRESS.md` — module checklist

## Development

Prerequisites: Node 20+, Rust (cargo/rustc), curl (for proxy MITM tests), and the usual Linux desktop libraries Electron needs (GTK, NSS).

```bash
# from the repo root
npm install
npm test              # proxy tests + desktop unit tests
npm run build:proxy:debug
npm run dev           # build the sidecar, then start the desktop app
```

Useful splits:

```bash
npm run dev:proxy     # cargo run -p lurkwire-proxy
npm run dev:ui        # Electron UI only
npm run build         # release sidecar + packaged renderer/main
```

### Run the proxy on its own

The sidecar prints one JSON line to stdout when it is ready (listen addresses, CA path, auth token). Tracing goes to stderr.

```bash
cargo run -p lurkwire-proxy -- --data-dir ./.data --listen 127.0.0.1:8080 --control 127.0.0.1:8787
# in another terminal:
curl -x http://127.0.0.1:8080 --cacert ./.data/ca.pem https://example.com/
curl -sS -H "Authorization: Bearer <token from the ready line>" http://127.0.0.1:8787/flows
```

The per-install CA is written to `<data-dir>/ca.pem` and is intended to be trusted only inside Lurkwire, not installed system-wide. The control API requires the bearer token on every route, including `/health`.

## Roadmap

Linux first, then macOS and Windows. See [docs/PROGRESS.md](docs/PROGRESS.md) for the module-by-module checklist.

## Disclaimer

Lurkwire is provided "as is", without warranty of any kind. You are solely responsible for how you use it and for complying with all applicable laws and the terms of any service or program you interact with. The authors and contributors accept no liability for any misuse, damage, data loss or legal consequences arising from the use of this software.

## License

TBD
