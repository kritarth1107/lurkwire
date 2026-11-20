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
- [ ] 12. Recon panel (crt.sh, DNS, RDAP/WHOIS, Wayback, optional Shodan BYO key)
- [ ] 13. OOB collaborator via interactsh client
- [x] 14. Linux packaging (AppImage and deb via electron-builder)
- [x] Proton-style browser chrome (tabs, toolbar, sidebar, new tab, settings, themes)

- [x] Headless Electron smoke test (`npm run smoke`): load https://example.com through the proxy, assert the flow in History, and write PNGs to `docs/screenshots/`
