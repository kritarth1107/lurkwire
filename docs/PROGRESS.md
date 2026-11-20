# Lurkwire progress

Build order for v0.1. Checked items are on `main`.

- [x] 1. Monorepo scaffold and dev scripts
- [x] 2. Rust proxy with MITM, the CA, and the flow store
- [x] 3. Electron browser shell (tabs, address bar, projects) wired through the proxy
- [x] 4. HTTP history UI with search and filters
- [x] 5. Repeater
- [x] 6. Intercept (pause / edit / forward)
- [x] 7. Guardrails core: scope allowlist, rate limiter, global kill switch, append-only hash-chained audit log
- [x] 8. LLM layer + AI side panel (explain / suggest / draft into Repeater; human sends)
- [x] 9. Intruder-lite (sniper / pitchfork / battering ram, § positions, grep, scope and kill switch)
- [x] 10. JWT/session tools plus encode/decode (HS* re-sign, alg none, URL/Base64/Hex/HTML/hash)
- [x] 11. Passive scanner and anomaly flags
- [x] 12. Recon panel (crt.sh, DNS, RDAP/WHOIS, Wayback, optional Shodan BYO key)
- [x] 13. OOB collaborator via interactsh client
- [x] 14. Linux packaging (AppImage and deb via electron-builder)
- [x] Proton-style browser chrome (tabs, toolbar, sidebar, new tab, settings, themes)

- [x] Headless Electron smoke test (`npm run smoke`): load https://example.com through the proxy, assert the flow in History, and write PNGs to `docs/screenshots/`

Refreshed screenshots cover main light/dark, the app menu, a lurkwire://settings tab, the downloads popover, site info, the history workbench, Repeater, Intruder, Scanner, Recon, AI settings, and DevTools.

## Browser UX (after v0.1 modules)

- [x] Remove the vertical tabs feature (keep the tool sidebar)
- [x] Anchor popovers next to the button that opened them
- [x] Internal pages as tabs at lurkwire:// URLs
- [x] Standard browser shortcuts, multi-window, tab-bar interactions
- [x] Chrome-style app menu with shortcuts and submenus
- [x] Native per-tab Chrome DevTools (docked / undocked / inspect element)
- [x] Site info panel (certificate, permissions, cookies, site intel)
- [x] Burp-parity history, viewers, site map, Comparer, Sequencer-lite, Logger, annotations
- [x] Settings > AI: multi-provider connectors, model pickers, per-task routing

## v0.1 polish

- [x] Per-task local AI memory
- [x] Unpacked Chrome extension loading and Settings page
- [x] HTTP/2 to the upstream (browser-facing MITM stays HTTP/1.1)

## Night polish

- [x] Decode content-encoding (gzip/br/deflate/zstd) and charset in History viewers
- [x] Proper Monaco workers in the packaged build
- [x] Fix Electron deprecations (navigationHistory, session.extensions)
- [x] Real tab groups (create / name / color / collapse)
- [x] Bookmarks manager and opt-in Chrome/Firefox import
- [x] Session restore (reopen last tabs)
- [x] Silence DevTools Autofill errors

Packaged AppImage smoke (`npm run smoke:appimage`) browses example.com, httpbin.org, and iana.org, sends a Repeater request and a two-payload Intruder sniper at httpbin.org, asserts decoded bodies, and refreshes `docs/screenshots/`.

## Overnight tools (22 Nov)

- [x] Firefox-style tab throbber, globe fallback, mute/crash states
- [x] lurkwire://workbench API client (collections, environments and secrets, auth helpers, pre-request/test scripts, cookie jar, import/export, code snippets, collection runner with CSV/JSON data files, AI helpers, Send to Repeater/Intruder, and proxy-backed send with guardrails). Still open: mock server, in-app OAuth PKCE browser flow, gRPC/WebSocket/SSE clients, standalone binary body picker
- [x] Command palette (Ctrl+K), CSRF PoC generator, and security-header reports from History
- [x] Passive scanner hints for CL.TE request smuggling and unkeyed-header cache poisoning
- [ ] Additional pentester tools
