# Lurkwire progress

Build order for v0.1. Checked items are on `main`.

- [x] 1. Monorepo scaffold and dev scripts
- [x] 2. Rust proxy with MITM, the CA, and the flow store
- [x] 3. Electron browser shell (tabs, address bar, projects) wired through the proxy
- [x] 4. HTTP history UI with search and filters
- [x] 5. Repeater
- [x] 6. Intercept (pause / edit / forward)
- [x] 7. Guardrails core: scope allowlist, rate limiter, global kill switch, append-only hash-chained audit log
- [ ] 8. LLM layer + AI side panel (explain / suggest / draft into Repeater; human sends)
- [ ] 9. Intruder-lite
- [ ] 10. JWT/session tools plus encode/decode
- [ ] 11. Passive scanner and anomaly flags
- [ ] 12. Recon panel (crt.sh, DNS, RDAP/WHOIS, Wayback, optional Shodan BYO key)
- [ ] 13. OOB collaborator via interactsh client
- [x] 14. Linux packaging (AppImage and deb via electron-builder)
- [x] Proton-style browser chrome (tabs, toolbar, sidebar, new tab, settings, themes)
