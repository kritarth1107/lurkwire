# Lurkwire feature catalog

This is the product roadmap expressed as concrete features, not slogans.
Each item is either **done** in the current tree or **planned**. Counts in this revision: **1000** items, **204** done, **796** planned.

Honesty rules:

- Done means the feature is implemented and wired, not a placeholder button.
- Planned means it is not in the tree yet. Several planned items already have a manual workaround in an existing tool.
- Attack features only run against hosts the operator has put in **scope**. Practice and documentation use authorized lab targets such as OWASP Juice Shop, DVWA, httpbin, and demo.testfire.net.
- Shipping a thousand stubs would be a lie; this file is the list, and releases tick items from planned to done.

## Design system

Visual language so the chrome reads like Firefox Proton or Chrome. _41 items: 28 done, 13 planned._

| # | Status | Feature |
| --- | --- | --- |
| 1 | done | Semantic color tokens for surface, elevated, sunken, toolbar, content, and overlay |
| 2 | done | Light theme token set |
| 3 | done | Dark theme token set |
| 4 | done | System theme follows the OS color scheme |
| 5 | done | Semantic roles for accent, accent-hover, accent-soft, and focus ring |
| 6 | done | Semantic success, warning, and danger colors with soft tints |
| 7 | done | Secondary / muted text tokens |
| 8 | done | Border and subtle-border tokens |
| 9 | done | 4px-based spacing scale (--space-1 through --space-10) |
| 10 | done | Radius scale from xs through pill, including tab radius |
| 11 | done | Elevation / shadow scale (xs, sm, md, lg) |
| 12 | done | Z-index scale for dock, dropdown, popover, tooltip, modal, and toast |
| 13 | done | Vendored Inter latin woff2 at 400, 500, 600, and 700 |
| 14 | done | Type ramp with consistent sizes, weights, and line heights |
| 15 | done | Tabular numerals on tables and numeric cells |
| 16 | done | Antialiased Inter with cv11/ss01 features |
| 17 | done | Motion tokens for fast, exit, medium, and slow durations with easing curves |
| 18 | done | Tab open animation |
| 19 | done | Tab close animation class |
| 20 | done | Tool dock open animation |
| 21 | done | Row / detail expand animation |
| 22 | done | Popover enter/exit motion reused by menus and tooltips |
| 23 | done | Focus-visible rings on interactive chrome |
| 24 | done | Hover, active, and selected states for toolbar buttons |
| 25 | done | Consistent tool-panel header, toolbar, list/detail, and resize handle |
| 26 | done | Shared empty-state treatment across tools |
| 27 | done | Loading skeleton treatment for in-flight tool work |
| 28 | done | Design-token usage test covering required token names and Inter wiring |
| 29 | planned | High-contrast theme that meets WCAG AAA for text and chrome |
| 30 | planned | Forced-colors / Windows High Contrast mappings |
| 31 | planned | Compact density mode that tightens chrome by 4px |
| 32 | planned | Touch-friendly density with 40px hit targets |
| 33 | planned | User-selectable accent color |
| 34 | planned | Custom theme editor that exports a token JSON file |
| 35 | planned | Reduced-motion mode that disables tab and dock animation |
| 36 | planned | Per-monitor scale-aware typography (125% / 150% / 200%) |
| 37 | planned | RTL layout mirroring for the chrome and tool dock |
| 38 | planned | Icon-only toolbar mode |
| 39 | planned | Window backdrop blur behind translucent toolbars on supporting compositors |
| 40 | planned | Light theme screenshot regression suite in CI |
| 41 | planned | Dark theme screenshot regression suite in CI |

## Browser chrome and tabs

Daily-driver tab strip, windows, and session behavior. _59 items: 20 done, 39 planned._

| # | Status | Feature |
| --- | --- | --- |
| 42 | done | New tab (Ctrl+T) |
| 43 | done | Close tab with a circular hover close affordance |
| 44 | done | Favicon in the tab, with a letter fallback when none is present |
| 45 | done | Loading throbber aligned with the favicon slot |
| 46 | done | Pinned tabs that hide the title and close button |
| 47 | done | Tab groups with a color underline |
| 48 | done | Audio indicator on a tab that is playing sound |
| 49 | done | Mute / unmute from the tab audio badge |
| 50 | done | Active tab Proton-style ear corners |
| 51 | done | Tab hover background |
| 52 | done | Tab title ellipsis |
| 53 | done | Drag region on the tab strip for moving the window |
| 54 | done | New window (Ctrl+N) |
| 55 | done | New private window (Ctrl+Shift+N) |
| 56 | done | Multiple windows with independent tab strips |
| 57 | done | Session restore preference (opt-in) |
| 58 | done | Internal lurkwire:// pages (new tab, settings, history, downloads, bookmarks, about) |
| 59 | done | Error icon on a failed tab load |
| 60 | planned | Drag-and-drop tab reorder within a window |
| 61 | planned | Detach a tab into a new window by dragging it off the strip |
| 62 | planned | Tear-off tab preview while dragging |
| 63 | done | Tab search (Ctrl+Shift+A) with type-ahead across open tabs |
| 64 | planned | Sleep unused background tabs to reclaim memory |
| 65 | planned | Memory usage chip per tab |
| 66 | planned | Duplicate tab |
| 67 | planned | Reopen closed tab (Ctrl+Shift+T) with a 25-item stack |
| 68 | planned | Reopen closed window |
| 69 | planned | Tab context menu: reload, pin, mute, group, close others, close to the right |
| 70 | planned | Close other tabs |
| 71 | planned | Close tabs to the right |
| 72 | planned | Close tabs to the left |
| 73 | planned | Unload tab (keep it in the strip, drop the renderer) |
| 74 | planned | Hibernate a tab group |
| 75 | planned | Vertical tabs sidebar |
| 76 | planned | Tree-style tabs |
| 77 | planned | Tab preview thumbnail on hover |
| 78 | planned | Picture-in-picture from a tab with video |
| 79 | planned | Name a window and show the name in the tab strip |
| 80 | planned | Move tab to another open window from the context menu |
| 81 | planned | Restore the last session automatically after a crash |
| 82 | planned | Startup: continue where I left off, open a specific page, or open a new tab |
| 83 | planned | Per-tab zoom remembered across sessions |
| 84 | planned | Discarded-tab favicon desaturation |
| 85 | planned | Tab crash page with Reload and Restore |
| 86 | planned | Confirm before closing a window with many tabs |
| 87 | planned | Middle-click a tab to close it |
| 88 | planned | Middle-click a link to open it in a background tab |
| 89 | planned | Ctrl+click a bookmark to open in a new tab |
| 90 | planned | Pin a lurkwire:// page as an app tab |
| 91 | planned | Overflow chevron when tabs no longer fit the strip |
| 92 | planned | Scroll the tab strip with the mouse wheel |
| 93 | planned | Touchpad two-finger swipe between tabs |
| 94 | planned | Keyboard: Ctrl+Tab / Ctrl+Shift+Tab cycle |
| 95 | planned | Keyboard: Ctrl+1 through Ctrl+8 select tab, Ctrl+9 last tab |
| 96 | planned | Recently closed tabs in the History menu |
| 97 | planned | Tab groups saved and named for later |
| 98 | planned | Auto-group tabs by site |
| 99 | planned | Send tab to another signed-in device |
| 100 | done | Reader-view tab that strips chrome from an article |

## Navigation and omnibox

Address bar, search, and suggestions. _44 items: 19 done, 25 planned._

| # | Status | Feature |
| --- | --- | --- |
| 101 | done | Chrome-style omnibox with identity icon and URL field |
| 102 | done | Focus ring on the omnibox (accent plus soft halo) |
| 103 | done | Auto-detect a URL versus a search query |
| 104 | done | Scheme-aware URL parsing that does not treat localhost:port as a scheme |
| 105 | done | Search suggestions with a type icon |
| 106 | done | History suggestions with favicon and secondary URL text |
| 107 | done | Bookmark suggestions in the dropdown |
| 108 | done | Suggestion rows sized and aligned to a 44px rhythm |
| 109 | done | Ctrl+L focuses the address bar |
| 110 | done | Inline completion ghost text |
| 111 | done | Back, forward, reload, and stop toolbar buttons |
| 112 | done | Reload with F5; hard reload with Ctrl+Shift+R (not bound to Repeater) |
| 113 | done | Identity chip for HTTPS, insecure HTTP, and internal pages |
| 114 | done | Star / bookmark toggle in the toolbar |
| 115 | done | Downloads toolbar button |
| 116 | done | App menu in-window (Wayland-safe) |
| 117 | done | Project switcher in the toolbar |
| 118 | done | Intercept toggle in the navbar |
| 119 | done | Memory chip in the toolbar |
| 120 | planned | Search engine manager (add, edit, keyword, default) |
| 121 | planned | Tab-to-search on a site that exposes OpenSearch |
| 122 | planned | Site-specific search keyword (for example wiki query) |
| 123 | planned | @-modifiers in the omnibox (@tabs, @history, @bookmarks, @tools) |
| 124 | planned | Clipboard URL suggestion when the clipboard holds a URL |
| 125 | planned | Calculator and unit conversion in the omnibox |
| 126 | planned | Paste and go |
| 127 | planned | Paste and search |
| 128 | planned | Copy URL without the scheme or with the canonical form |
| 129 | planned | Switch-to-tab suggestion when the URL is already open |
| 130 | planned | Certificate viewer from the identity popover |
| 131 | planned | Cookie and permission summary from the identity popover |
| 132 | planned | Clear site data from the identity popover |
| 133 | planned | Custom default search engine (DuckDuckGo, Startpage, self-hosted) |
| 134 | planned | Per-project default search engine |
| 135 | planned | QR code for the current URL |
| 136 | planned | Send the current URL to Repeater from the identity menu |
| 137 | planned | Punycode display for IDN domains with a spoof warning |
| 138 | planned | Copy clean URL (strip tracking parameters) |
| 139 | planned | Built-in tracking-parameter stripper list |
| 140 | planned | HTTPS-only mode with an upgrade-navigate and fallback interstitial |
| 141 | planned | Secure DNS (DoH) provider picker |
| 142 | planned | Type-ahead domain completion from history only, never from a remote suggest API unless opted in |
| 143 | planned | Off-the-record omnibox that does not write typed URLs to history |
| 144 | planned | Work-offline indicator in the identity popover |

## Bookmarks and library

Bookmarks bar, manager, and import. _34 items: 5 done, 29 planned._

| # | Status | Feature |
| --- | --- | --- |
| 145 | done | Bookmarks bar with favicon and title chips |
| 146 | done | Pixel-tight 32px bookmarks strip |
| 147 | done | Show / hide the bookmarks bar preference |
| 148 | done | Add a bookmark from the star button |
| 149 | done | Bookmark manager at lurkwire://bookmarks |
| 150 | planned | Bookmark folders on the bar |
| 151 | planned | Overflow chevron for bookmarks that do not fit |
| 152 | planned | Drag to reorder bookmarks |
| 153 | planned | Bookmark tags |
| 154 | planned | Bookmark descriptions and notes |
| 155 | planned | Full-text search over bookmark titles and URLs |
| 156 | planned | Import bookmarks from a Netscape HTML file |
| 157 | planned | Import bookmarks from Firefox |
| 158 | planned | Import bookmarks from Chrome / Chromium |
| 159 | planned | Export bookmarks to HTML |
| 160 | planned | Backup and restore bookmarks as JSON |
| 161 | planned | Bookmark this tab in a chosen folder from a compact dialog |
| 162 | planned | Bookmark all tabs as a folder |
| 163 | planned | Keyboard shortcut Ctrl+D to bookmark |
| 164 | planned | Keyboard shortcut Ctrl+Shift+D to bookmark all tabs |
| 165 | planned | Bookmarks menu in the app menu |
| 166 | planned | Open all bookmarks in a folder in new tabs |
| 167 | planned | Open all in a new window |
| 168 | planned | Open all in a private window |
| 169 | planned | Sort a folder by name, URL, or date added |
| 170 | planned | Read later / unread bookmark flag |
| 171 | planned | Favicon refresh for stale bookmarks |
| 172 | planned | Dead-link checker for a bookmark folder |
| 173 | planned | Sync bookmarks across machines once sign-in exists |
| 174 | planned | Separator items on the bookmarks bar |
| 175 | planned | Other Bookmarks folder |
| 176 | planned | Bookmark keywords that expand in the omnibox |
| 177 | planned | Starred page edit dialog: name, folder, tags |
| 178 | planned | Prevent duplicate bookmarks with a merge prompt |

## History, downloads, find, zoom, and print

Everyday browser utilities. _37 items: 11 done, 26 planned._

| # | Status | Feature |
| --- | --- | --- |
| 179 | done | Browsing history page at lurkwire://history |
| 180 | done | History available from the app menu (not the pentest bar) |
| 181 | done | Ctrl+H opens browsing history |
| 182 | done | Downloads page at lurkwire://downloads |
| 183 | done | Downloads toolbar popover (in-window) |
| 184 | done | Find in page (Ctrl+F) |
| 185 | done | History search with date filters |
| 186 | planned | History grouped by day and by site |
| 187 | planned | Delete a single history entry |
| 188 | planned | Delete history for a site |
| 189 | planned | Clear recent history dialog with time range and data types |
| 190 | planned | Clear cookies, cache, and storage independently |
| 191 | planned | Do not record history in a private window (partition already exists; finish the UI) |
| 192 | planned | Most visited tiles on the new tab page |
| 193 | planned | Recently closed on the new tab page |
| 194 | planned | Download progress in the toolbar button |
| 195 | done | Pause, resume, and cancel a download |
| 196 | done | Open the downloaded file |
| 197 | done | Show the downloaded file in the folder |
| 198 | planned | Always ask where to save files |
| 199 | planned | Set a default download directory |
| 200 | planned | Dangerous-file download warning |
| 201 | planned | Download history persisted across restarts |
| 202 | done | Find in page match count, previous, next, highlight all |
| 203 | planned | Find in page case-sensitive and regex modes |
| 204 | planned | Zoom in, zoom out, reset (Ctrl+Plus / Minus / 0) |
| 205 | planned | Per-site remembered zoom |
| 206 | planned | Full screen (F11) with a slim slide-down chrome |
| 207 | planned | Print dialog and print preview |
| 208 | planned | Print to PDF |
| 209 | planned | Save page as HTML, MHTML, or a complete directory |
| 210 | planned | Screenshot the visible tab |
| 211 | planned | Screenshot the full page |
| 212 | planned | Copy screenshot to clipboard |
| 213 | planned | Open file (Ctrl+O) for local HTML |
| 214 | planned | View page source |
| 215 | planned | Task manager for renderers and the proxy sidecar |

## Privacy, permissions, and browser security

A daily-driver privacy surface, not just a proxy. _33 items: 4 done, 29 planned._

| # | Status | Feature |
| --- | --- | --- |
| 216 | done | Private window that uses a separate session partition |
| 217 | done | Kill switch that stops proxying immediately |
| 218 | done | Insecure identity state for HTTP pages |
| 219 | done | CA certificate generated by the local MITM proxy and installable on the machine |
| 220 | planned | Permission prompts for camera, microphone, location, notifications, clipboard, serial, and USB |
| 221 | planned | Site permissions manager |
| 222 | planned | Default deny for third-party cookies |
| 223 | planned | Total cookie protection / per-site cookie jars |
| 224 | planned | Tracking-prevention standard and strict modes |
| 225 | planned | Block third-party storage access unless granted |
| 226 | planned | HTTPS-First upgrades |
| 227 | planned | Certificate transparency checks |
| 228 | planned | HSTS cache inspector |
| 229 | planned | Clear HSTS for a host (lab use) |
| 230 | planned | Client-certificate picker for mTLS sites |
| 231 | planned | Built-in password manager with a local vault |
| 232 | planned | Passkey / WebAuthn authenticator |
| 233 | planned | Import passwords from a CSV, Firefox, or Chrome export |
| 234 | planned | Global privacy control and DNT header toggle |
| 235 | planned | Referrer policy override |
| 236 | planned | User-Agent reduction and a UA override per project |
| 237 | planned | Timezone, locale, and language spoofing per project |
| 238 | planned | WebRTC IP leak protection (proxy-only ICE) |
| 239 | planned | Disable JavaScript per site |
| 240 | planned | Disable images, fonts, or media per site |
| 241 | planned | Cookie exceptions list |
| 242 | planned | Popup blocker with a manage-blocked UI |
| 243 | planned | Redirect tracker stripping |
| 244 | planned | First-party isolate for localStorage and IndexedDB |
| 245 | planned | Private-window leftover disk scrubber |
| 246 | planned | External protocol (mailto, tel) confirmation |
| 247 | planned | Warn on mixed content and provide a block or allow choice |
| 248 | planned | Local log of permission grants |

## Profiles, projects, and sessions

Separate work and keep an engagement tidy. _27 items: 5 done, 22 planned._

| # | Status | Feature |
| --- | --- | --- |
| 249 | done | Named projects with a unique color |
| 250 | done | Create a project from the toolbar |
| 251 | done | Switch the current project |
| 252 | done | Project-scoped proxy history |
| 253 | done | Project-scoped scope rules, notes, and findings |
| 254 | planned | Named browser profiles (work, personal, lab) with isolated stores |
| 255 | planned | Open a profile in a dedicated window |
| 256 | planned | Avatar and color for a profile |
| 257 | planned | Container tabs (multi-account containers) inside one window |
| 258 | planned | Assign a site to always open in a container |
| 259 | planned | Export a project as a portable archive (flows, notes, scope, findings) |
| 260 | planned | Import a project archive |
| 261 | planned | Project templates (web app, API, thick-client HTTP) |
| 262 | planned | Engagement metadata: client, dates, rules of engagement, allowed CIDRs |
| 263 | planned | Read-only review mode for a finished project |
| 264 | planned | Lock a project with an OS keyring password |
| 265 | planned | Auto-delete a project and its traffic after N days |
| 266 | planned | Git-friendly project export (markdown notes, HAR, and JSON) |
| 267 | planned | Session macros: record a login and replay it before a scan |
| 268 | planned | Cookie jar profiles (low-priv, high-priv, anonymous) for Autorize |
| 269 | planned | Switch the captured session used by Repeater, Intruder, and Scanner in one click |
| 270 | planned | Account switcher that keeps N parallel cookie jars |
| 271 | planned | Client certificate bound to a project |
| 272 | planned | Upstream proxy (HTTP, HTTPS, SOCKS5) per project |
| 273 | planned | PAC file support for the upstream hop |
| 274 | planned | Split-tunnel: bypass the MITM for a host list |
| 275 | planned | Clock skew / date spoof for token-expiry tests |

## Proxy and traffic

The live HTTP(S) history a practitioner expects. _61 items: 25 done, 36 planned._

| # | Status | Feature |
| --- | --- | --- |
| 276 | done | Local MITM proxy sidecar written in Rust |
| 277 | done | HTTP and HTTPS interception with a project CA |
| 278 | done | Live traffic monitor in the tools dock |
| 279 | done | Traffic as a first-class top-bar tool (not buried in a left rail) |
| 280 | done | Filter the live list |
| 281 | done | Select a row and inspect the request and response |
| 282 | done | HTTP message viewer for headers and body |
| 283 | done | HAR export |
| 284 | done | Pause / live toggle |
| 285 | done | Right-click a request: Send to Repeater, Intruder, Scanner, Comparer, Workbench |
| 286 | done | Copy as curl |
| 287 | done | Copy as fetch |
| 288 | done | Copy URL |
| 289 | done | Add host to scope from a request |
| 290 | done | Highlight and comment on a request |
| 291 | done | Copy a CSRF proof-of-concept form |
| 292 | done | Copy a clickjacking proof-of-concept page |
| 293 | done | Copy a security-header report |
| 294 | done | Retest CORS from a request |
| 295 | done | Send discovered JWTs to the Decoder |
| 296 | done | Request metadata (method, host, path, status, length) |
| 297 | done | In-scope indicator on a flow |
| 298 | done | WebSocket, SSE, and gRPC frame capture surfaced in the Sockets tool |
| 299 | done | Live filter language (method, status, mime, host, path, regex, highlight color) |
| 300 | done | Saved filter presets |
| 301 | planned | Hide images, CSS, fonts, and analytics with one click |
| 302 | planned | Show only in-scope, only annotated, or only with findings |
| 303 | planned | Column picker and persisted column widths |
| 304 | planned | Sort by time, duration, status, size, or host |
| 305 | planned | Duration and TTFB column |
| 306 | planned | Waterfall timing view for a request (DNS, TCP, TLS, wait, download) |
| 307 | planned | Protocol column (HTTP/1.1, HTTP/2, HTTP/3) |
| 308 | planned | HTTP/2 and HTTP/3 interception |
| 309 | planned | Brotli and zstd response decoding in the viewer |
| 310 | planned | Pretty-print JSON, XML, HTML, and form bodies |
| 311 | planned | Hex and image viewers |
| 312 | planned | SVG and PDF preview |
| 313 | planned | Syntax-highlighted HTML and JS with wrap |
| 314 | planned | Search inside a request or response body |
| 315 | planned | Search across the whole history (bodies included, with a size cap) |
| 316 | planned | Auto-scroll lock / unlock the live tail |
| 317 | planned | Drop captured noise (heartbeats, health checks) with a rule |
| 318 | planned | Repeat the request from the history row without opening Repeater |
| 319 | planned | Compare this response to the previous one for the same URL |
| 320 | planned | Copy as wget, PowerShell, and HTTPie |
| 321 | planned | Copy as a Python requests snippet |
| 322 | planned | Copy as a Go net/http snippet |
| 323 | planned | Export selected rows as HAR or XML |
| 324 | planned | Import a HAR into the current project |
| 325 | planned | Import history from another proxy tool's XML or HAR |
| 326 | planned | Stream history to a JSONL file |
| 327 | planned | gRPC-Web and Connect-RPC decoded as JSON in the viewer |
| 328 | planned | GraphQL operation name column |
| 329 | planned | Automatic de-duplication of identical static assets |
| 330 | planned | Color-code 3xx, 4xx, and 5xx in the status column |
| 331 | planned | Request map (method plus path template) rolled up from raw URLs |
| 332 | planned | Right-click: copy host, copy path, copy query params as a table |
| 333 | planned | Response header annotations (CSP, HSTS, cookies) as chips |
| 334 | planned | Cookie set/cleared chips on a response row |
| 335 | planned | Mark a request as a login, logout, or CSRF step |
| 336 | planned | Traffic pause also queues websocket frames |

## Intercept, match/replace, scope, and sockets

Items under the Proxy menu. _38 items: 14 done, 24 planned._

| # | Status | Feature |
| --- | --- | --- |
| 337 | done | Intercept on/off (Ctrl+Shift+I) |
| 338 | done | Intercept and edit a request before it is forwarded |
| 339 | done | Intercept and edit a response before it is delivered to the browser |
| 340 | done | Forward, drop, or replay an intercepted message |
| 341 | done | Intercept badge in the navbar |
| 342 | done | Match and replace rules applied in the live Rust MITM path |
| 343 | done | Request match/replace runs before intercept |
| 344 | done | Response match/replace runs after upstream, with intercept edits winning last |
| 345 | done | Scope include and exclude host patterns |
| 346 | done | Active tools default-deny until an include matches |
| 347 | done | Exclude wins over include |
| 348 | done | Scope manager UI |
| 349 | done | WebSocket history tool |
| 350 | done | Replay a captured WebSocket frame |
| 351 | planned | Intercept filters (URL, method, mime, in-scope only, exclude static) |
| 352 | planned | Intercept queue with a list of held messages and a one-click forward-all |
| 353 | planned | Intercept breakpoints that match a regex or a header |
| 354 | planned | Automatically add a header on intercepted requests |
| 355 | planned | Pretty-edit JSON in the intercept pane |
| 356 | planned | Binary-safe intercept editor with hex and ASCII |
| 357 | planned | Hold and modify a WebSocket frame before it is forwarded |
| 358 | planned | Match/replace comments and enable/disable per rule |
| 359 | planned | Match/replace regex with capture groups and backreferences |
| 360 | planned | Match/replace only in-scope, or only when a header is present |
| 361 | planned | Header add, remove, and set as first-class rule types |
| 362 | planned | Body find-and-replace with a regex tester |
| 363 | planned | Import and export match/replace rules as JSON |
| 364 | planned | Scope by CIDR, port, and scheme |
| 365 | planned | Scope by a file of hostnames |
| 366 | planned | Advanced scope: AND/OR path, query, or header conditions |
| 367 | planned | Scope preview: how many recent flows would match |
| 368 | planned | Suite-wide use-scope toggle for each tool |
| 369 | planned | Out-of-scope warning before a Repeater send to a new host |
| 370 | planned | WebSocket JSON pretty printer and typo-safe editor |
| 371 | planned | WebSocket ping, pong, and close-frame builder |
| 372 | planned | SSE event stream inspector with typed events |
| 373 | planned | Socket.io / SockJS parser |
| 374 | planned | gRPC stream inspector with protobuf decode from a descriptor set or reflection |

## Attack tools

Repeater, Intruder, Scanner, smuggling, CORS, param miner, Autorize. _59 items: 24 done, 35 planned._

| # | Status | Feature |
| --- | --- | --- |
| 375 | done | Repeater with a draft filled from Send to Repeater (Ctrl+R) |
| 376 | done | Ctrl+Enter sends or resends in Repeater |
| 377 | done | Repeater request editor |
| 378 | done | Repeater response viewer |
| 379 | done | Intruder with payload positions marked in the request |
| 380 | done | Send to Intruder (Ctrl+I) |
| 381 | done | Intruder attack types: sniper, pitchfork, battering ram, cluster bomb |
| 382 | done | Intruder payload lists and presets |
| 383 | done | Intruder results table |
| 384 | done | Scanner queue |
| 385 | done | Scanner findings grouped by severity |
| 386 | done | Finding evidence in an HTTP viewer |
| 387 | done | Retest a finding |
| 388 | done | Send a request to the Scanner |
| 389 | done | Request smuggling tool with a local lab |
| 390 | done | In-scope remote smuggling probe |
| 391 | done | Param miner that compares status and length to a baseline |
| 392 | done | Autorize: replay a request as other sessions |
| 393 | done | CORS tester: Origin and preflight probes with a triage verdict |
| 394 | done | CORS menu entry under Attack |
| 395 | done | Repeater tabs for multiple requests in the same dock |
| 396 | done | Repeater request history with pin and comment |
| 397 | planned | Repeater environment variables and a project-level base URL |
| 398 | planned | Repeater send in a loop with a delay |
| 399 | planned | Repeater follow redirects with a hop inspector |
| 400 | planned | Repeater HTTP/2 pseudo-header editor |
| 401 | planned | Repeater send in the current browser session versus send from the sidecar |
| 402 | planned | Pretty and raw editors that stay in sync |
| 403 | planned | Request inspector: parsed query, cookies, multipart, JSON paths |
| 404 | planned | Response diff against the previous send automatically |
| 405 | planned | Intruder extract (regex, JSONPath, CSS selector, XPath) |
| 406 | done | Intruder match and payload grep |
| 407 | planned | Intruder resource pool and concurrency slider |
| 408 | planned | Intruder attack scheduler with start, pause, and resume |
| 409 | planned | Intruder payload processors: hash, encode, prefix, skip, cut, case |
| 410 | planned | Intruder character, number, date, and null payload generators |
| 411 | done | Intruder CSV and wordlist import |
| 412 | planned | Intruder result charts (status histogram, length outliers) |
| 413 | planned | Cluster-bomb safety cap and an estimated request count |
| 414 | planned | Scanner crawl and audit pipeline with a visible queue |
| 415 | planned | Scanner insertion points (URL, body, cookies, headers, JSON, XML, multipart) |
| 416 | planned | Scanner check packs for the common web classes, each with a safe confirm |
| 417 | planned | Scanner JavaScript-aware crawl (click, form fill, same-origin fetch hooks) |
| 418 | planned | Scanner API-aware crawl from an OpenAPI or HAR seed |
| 419 | planned | Scanner incremental retest of only failing checks |
| 420 | planned | Scanner false-positive mark and a suppression rule |
| 421 | planned | Scanner confidence and evidence quality flags |
| 422 | planned | Out-of-band scanner checks via the Collaborator |
| 423 | planned | CORS checks folded into the Scanner pack, with the lab tool kept for manual work |
| 424 | planned | Smuggling timing and differential confirmations |
| 425 | planned | HTTP/2 request smuggling helpers |
| 426 | planned | Param miner: cookie, header, and body parameter discovery |
| 427 | planned | Param miner wordlists for common frameworks |
| 428 | planned | Param miner cache-key probe for unkeyed inputs |
| 429 | planned | Autorize: automatic access-control diffs from live traffic with a low/high session pair |
| 430 | planned | Autorize enforcement detection (status, length, body hash, JSON field) |
| 431 | planned | Session recorder that produces a reusable login macro |
| 432 | planned | Token freshness hook before each Autorize or Intruder request |
| 433 | planned | Attack dashboard that rolls up running Intruder, Scanner, and Discover jobs |

## Recon tools

Site map, content discovery, intel, GraphQL, and out-of-band. _35 items: 6 done, 29 planned._

| # | Status | Feature |
| --- | --- | --- |
| 434 | done | Site map of hosts and paths seen by the proxy |
| 435 | done | Content discovery with an enlarged wordlist, limited to in-scope hosts |
| 436 | done | Recon and site intel pane for the current host |
| 437 | done | GraphQL explorer (schema, graph, query lab) |
| 438 | done | OOB collaborator with a copy-payload action and a hit log |
| 439 | done | JavaScript secret scanning helper that can be sent toward Notes |
| 440 | planned | Site map folder tree with method and status badges |
| 441 | planned | Site map merge of path templates (/users/{id}) |
| 442 | planned | Site map right-click send to any attack tool |
| 443 | planned | Site map export as sitemap.xml, CSV, or JSON |
| 444 | planned | Site map compare of two crawls |
| 445 | planned | Discover: recursive crawl of newly found directories |
| 446 | planned | Discover: extension permutations |
| 447 | planned | Discover: response-code filtering and size outliers |
| 448 | planned | Discover: custom wordlist per project |
| 449 | planned | Discover: parse robots.txt, sitemap.xml, and JS for extra paths |
| 450 | planned | Discover: backup-file and source-map hunt |
| 451 | planned | JavaScript endpoint extraction into the site map and Notes |
| 452 | planned | Secret scanning packs for common cloud and CI token shapes |
| 453 | planned | Recon: DNS, WHOIS, TLS certificate SAN, and HTTP fingerprint in one view |
| 454 | planned | Recon: technology fingerprint from a local database |
| 455 | planned | Recon: security.txt, humans.txt, ads.txt |
| 456 | planned | Recon: favicon hash lookup against a local dataset |
| 457 | planned | Recon: optional Shodan, Censys, or crt.sh connectors with operator-supplied keys |
| 458 | planned | Recon: subdomain wordlist and resolvers, strictly against in-scope roots |
| 459 | planned | GraphQL mutation and subscription lab |
| 460 | planned | GraphQL batching and alias-abuse probes with a cap |
| 461 | planned | GraphQL field-suggestion reconnaissance |
| 462 | planned | GraphQL authorization tests per field with a second session |
| 463 | planned | GraphQL persisted-query inspector |
| 464 | planned | OOB: multiple collaborator backends (Interactsh, self-hosted, DNS-only) |
| 465 | planned | OOB: payload templates correlated to a check identifier |
| 466 | planned | OOB: desktop and webhook alerting when a payload fires |
| 467 | planned | Screenshot a target unauthenticated surface for the report |
| 468 | planned | Wayback or Common Crawl URL import into the site map (in-scope hosts only) |

## Decode, JWT, comparer, sequencer, and cookies

Items under the Decode menu. _35 items: 14 done, 21 planned._

| # | Status | Feature |
| --- | --- | --- |
| 469 | done | Decoder++ with URL, Base64, hex, HTML, and related codecs |
| 470 | done | JWT tab: decode, inspect claims, and tamper |
| 471 | done | Unsigned and signed JWT helpers |
| 472 | done | Hash identifiers and hash codecs |
| 473 | done | Gzip and compressed payload decode |
| 474 | done | Decode-all / magic mode that tries a chain of codecs |
| 475 | done | Chef-style recipe tab |
| 476 | done | Comparer for two responses side by side |
| 477 | done | Sequencer that measures token and cookie randomness |
| 478 | done | Cookie manager: inspect, copy, export, or delete session cookies |
| 479 | done | JWT menu alias that opens the Decoder on the JWT tab |
| 480 | done | Cookie export already present in the manager |
| 481 | planned | Decoder compact mode in a standalone pane |
| 482 | planned | Decoder drop-a-file or hex-dump input |
| 483 | planned | Decoder output as hex, C, Python, or raw bytes |
| 484 | planned | Custom codec plugins in JavaScript or WASM |
| 485 | planned | JWT algorithm-confusion and header-injection labs against authorized targets |
| 486 | planned | JWT claim editor with typo-safe iat, nbf, and exp, then resign |
| 487 | planned | JWT JWKS fetch (in-scope) and key inventory |
| 488 | planned | Encrypted JWE support |
| 489 | planned | Paseto and other typed-token helpers |
| 490 | done | Comparer: request versus request and header-only diffs |
| 491 | done | Comparer: ignore whitespace and volatile fields |
| 492 | planned | Comparer: more than two items in a set, with a baseline |
| 493 | planned | Comparer: image / pixel diff for visual responses |
| 494 | planned | Sequencer: larger sample sizes and a chart of entropy over time |
| 495 | planned | Sequencer: statistical randomness tests with a plain-language verdict |
| 496 | planned | Sequencer: auto-capture a token from a live endpoint |
| 497 | planned | Cookie manager: edit flags (Secure, HttpOnly, SameSite, Prefix, Partitioned) |
| 498 | planned | Cookie manager: import a Netscape cookie file |
| 499 | planned | Cookie manager: replay a cookie into another profile |
| 500 | planned | Cookie manager: highlight first-party versus third-party versus session versus persistent |
| 501 | planned | Set-Cookie diff after a login |
| 502 | planned | Storage inspector: localStorage, sessionStorage, IndexedDB, Cache Storage |
| 503 | planned | Clear site storage from the cookie tool |

## Findings, notes, logger, CVSS, and report

Items under the Report menu. _31 items: 5 done, 26 planned._

| # | Status | Feature |
| --- | --- | --- |
| 504 | done | Findings report tool that exports Markdown and HTML from scanner findings and notes |
| 505 | done | Notes tool with CVSS 3.1 scoring |
| 506 | done | CVSS menu alias that opens Notes on the scorer |
| 507 | done | Event logger with filters |
| 508 | done | Engagement notes stored with the project |
| 509 | planned | Findings inbox with triage states: new, confirmed, false positive, duplicate, accepted risk, fixed |
| 510 | planned | Finding fields: title, asset, CWE, CVSS, evidence, steps, impact, remediation, references |
| 511 | planned | Attach request/response pairs and screenshots to a finding |
| 512 | planned | Deduplicate findings by fingerprint |
| 513 | planned | Merge findings and keep a history of triage decisions |
| 514 | planned | Retest all confirmed findings and update their status |
| 515 | planned | Jira, Linear, or GitHub issue export with operator-supplied tokens |
| 516 | planned | ASVS, OWASP Top 10, and WSTG mapping on each finding |
| 517 | planned | Custom report templates (letterhead, severity colors, executive versus technical) |
| 518 | planned | PDF report export |
| 519 | planned | DOCX report export |
| 520 | planned | CSV and JSON finding export for a GRC tool |
| 521 | planned | Report includes a scope appendix and a methodology appendix |
| 522 | planned | Report includes a traffic coverage chart (paths hit versus site map) |
| 523 | planned | Signed report hash so a PDF can be later verified |
| 524 | planned | Notes: markdown editor with a preview, tags, and backlinks |
| 525 | planned | Notes: embed a flow, a finding, or a screenshot |
| 526 | planned | Notes: templates for login, recon, and daily standup |
| 527 | planned | Logger: structured columns, regex highlight, and export |
| 528 | planned | Logger: ring buffer size preference and a persist-to-disk switch |
| 529 | planned | Audit log hash chain already used by the sidecar, surfaced in the Logger |
| 530 | planned | CVSS 4.0 support |
| 531 | planned | EPSS and CISA KEV enrichment (opt-in, cached) |
| 532 | planned | SSVC decision helper |
| 533 | planned | Risk register view for a client workshop |
| 534 | planned | Meeting-ready one-pager from the top N findings |

## Assistant, workbench, and platform

LLM sidebar, API workbench, packaging, and quality. _75 items: 22 done, 53 planned._

| # | Status | Feature |
| --- | --- | --- |
| 535 | done | Right-hand LLM assistant sidebar |
| 536 | done | Assistant toggle on the categorized tool bar |
| 537 | done | Resizable LLM sidebar width, persisted |
| 538 | done | LLM provider settings and connectors |
| 539 | done | Redaction before a prompt is sent |
| 540 | done | API workbench (HTTP, GraphQL, gRPC collections) |
| 541 | done | Send a captured flow into the workbench |
| 542 | done | Command palette (Ctrl+K) that searches pages, tools, and send-to actions |
| 543 | done | Keyboard shortcut sheet (Ctrl+/) |
| 544 | done | In-window popovers and menus (Wayland-safe, no stray BrowserWindows) |
| 545 | done | Categorized Proxy, Attack, Recon, Decode, and Report menus |
| 546 | done | Pinned 1-click tools (Traffic, Intercept, Repeater, Intruder, Scanner) with a persisted pin set |
| 547 | done | Keyboard-navigable tool menus (arrows, enter, escape, type-to-search, left/right between menus) |
| 548 | done | Linux AppImage and .deb packaging |
| 549 | done | CI for unit tests and Linux package |
| 550 | done | Packaged AppImage smoke test |
| 551 | done | Unit tests for send-to routing, match/replace direction, param miner, decode-all, report export, menus, and tokens |
| 552 | done | Public repository, README, and LICENSE |
| 553 | done | Token and menu-group unit tests ship with the desktop workspace |
| 554 | done | Linux dist:linux produces an AppImage and a .deb |
| 555 | done | This feature catalog committed at docs/FEATURES.md |
| 556 | planned | Assistant: tool-use that can quote a flow, draft a Repeater request, or open a finding (always with a confirm) |
| 557 | planned | Assistant: local-only models via Ollama or llama.cpp |
| 558 | planned | Assistant: project memory that stays on disk and is never used as training data |
| 559 | done | Assistant: explain this finding and draft a remediation actions |
| 560 | planned | Workbench: environments, secrets vault, and chainable scripts |
| 561 | planned | Workbench: Postman / Insomnia import |
| 562 | planned | Workbench: OpenAPI import that scaffolds a collection |
| 563 | planned | Workbench: contract tests run against an in-scope base URL |
| 564 | planned | Workbench: gRPC reflection and proto upload |
| 565 | planned | Extensions: Chromium-compatible MV3 with a reviewed permission prompt |
| 566 | planned | Extensions: a curated lab store (no silent drive-by installs) |
| 567 | planned | Userscripts per project |
| 568 | planned | Accessibility: full keyboard path through every tool, announced live regions, and a screen-reader audit |
| 569 | planned | Localization: English, plus a translation pipeline for additional locales |
| 570 | planned | macOS .dmg and notarized build |
| 571 | planned | Windows NSIS / MSIX build with optional default-browser registration |
| 572 | planned | Auto-update with signed artifacts and a release channel (stable, beta) |
| 573 | planned | Crash reporter that is off by default and strips secrets |
| 574 | planned | Official documentation site generated from this catalog |
| 575 | planned | Fuzz the sidecar and the renderer IPC in CI |
| 576 | planned | Supply-chain: signed SBOM, pinned actions, and a regular advisory process |
| 577 | planned | Headless CLI for scan and report in pipelines |
| 578 | planned | Remote collaborator / team server (self-hosted) |
| 579 | planned | Role-based access on a team server (operator, reviewer, guest) |
| 580 | planned | Signed Linux packages |
| 581 | planned | Flatpak package |
| 582 | planned | Nix package / flake |
| 583 | planned | Homebrew cask for macOS |
| 584 | planned | WinGet and Chocolatey packages |
| 585 | planned | Reproducible builds documented in the repo |
| 586 | planned | SBOM attached to every release |
| 587 | planned | Vulnerability disclosure policy in SECURITY.md |
| 588 | planned | Cargo audit and npm audit in CI with an allow list |
| 589 | planned | Load test: long-lived traffic without dropping the UI frame rate |
| 590 | planned | Memory leak test for an 8-hour proxy session |
| 591 | planned | Startup time budget and a CI check |
| 592 | planned | AppImage smoke on Ubuntu LTS and a current Fedora |
| 593 | planned | Wayland and X11 smoke (menus stay in-window on both) |
| 594 | planned | HiDPI smoke at 200% |
| 595 | planned | Keyboard-only smoke of the tool menus and the omnibox |
| 596 | planned | Screen reader smoke of the tab strip and a finding |
| 597 | planned | ADR folder for design decisions |
| 598 | planned | Contributor guide |
| 599 | planned | Code of conduct |
| 600 | planned | Threat model document for the desktop app and the sidecar |
| 601 | planned | IPC allow-list review (renderer talks to the sidecar only through preload) |
| 602 | planned | ContextIsolation and sandbox remain on; a CI test fails if they are relaxed |
| 603 | planned | No Node integration in the renderer; a CI test fails if it is turned on |
| 604 | planned | Content-security-policy for lurkwire:// pages |
| 605 | planned | Secret scanning of the repo in CI |
| 606 | planned | Disk-full behavior: freeze captures and warn, never corrupt the project database |
| 607 | planned | Project database migration tests |
| 608 | planned | Portable mode with the store next to the binary |
| 609 | planned | Feature flags for incomplete work so a planned item never ships as a stub button |

## Shortcuts, viewers, settings, checks, interop, and onboarding

Concrete remaining work generated from structured lists so the roadmap stays specific. _391 items: 2 done, 389 planned._

| # | Status | Feature |
| --- | --- | --- |
| 610 | planned | Keyboard shortcut: Ctrl+Shift+B to toggle the bookmarks bar |
| 611 | planned | Keyboard shortcut: Ctrl+Shift+O to open the bookmark manager |
| 612 | done | Keyboard shortcut: Ctrl+J to open downloads |
| 613 | planned | Keyboard shortcut: Ctrl+Shift+Delete to open clear-history |
| 614 | planned | Keyboard shortcut: Alt+Home to open the homepage |
| 615 | planned | Keyboard shortcut: Alt+Left to go back |
| 616 | planned | Keyboard shortcut: Alt+Right to go forward |
| 617 | planned | Keyboard shortcut: Ctrl+U to view source |
| 618 | planned | Keyboard shortcut: Ctrl+S to save page |
| 619 | planned | Keyboard shortcut: Ctrl+P to print |
| 620 | planned | Keyboard shortcut: Ctrl+G to find next |
| 621 | planned | Keyboard shortcut: Ctrl+Shift+G to find previous |
| 622 | planned | Keyboard shortcut: F3 to find next (alternate) |
| 623 | planned | Keyboard shortcut: F6 to cycle focus between chrome and content |
| 624 | planned | Keyboard shortcut: F7 to caret browse |
| 625 | planned | Keyboard shortcut: F10 to focus the app menu |
| 626 | planned | Keyboard shortcut: F11 to full screen |
| 627 | planned | Keyboard shortcut: Shift+F5 to hard reload (alias of Ctrl+Shift+R) |
| 628 | planned | Keyboard shortcut: Ctrl+W to close tab |
| 629 | planned | Keyboard shortcut: Ctrl+Shift+W to close window |
| 630 | planned | Keyboard shortcut: Ctrl+Shift+T to reopen last tab |
| 631 | planned | Keyboard shortcut: Ctrl+M to mute tab |
| 632 | planned | Keyboard shortcut: Ctrl+D to bookmark this tab |
| 633 | planned | Keyboard shortcut: Ctrl+Shift+K to focus the Logger quick filter |
| 634 | planned | Keyboard shortcut: Ctrl+Shift+E to toggle the tool dock |
| 635 | done | Keyboard shortcut: Ctrl+Shift+A to open tab search |
| 636 | planned | Keyboard shortcut: Ctrl+Shift+M to toggle the Assistant |
| 637 | planned | Keyboard shortcut: Ctrl+Alt+R to open Repeater without sending a request |
| 638 | planned | Keyboard shortcut: Ctrl+Alt+I to open Intruder without sending a request |
| 639 | planned | Keyboard shortcut: Ctrl+Alt+S to open Scanner |
| 640 | planned | Keyboard shortcut: Ctrl+Alt+T to open Traffic and focus the filter |
| 641 | planned | Keyboard shortcut: Alt+1 through Alt+5 to open a pinned tool by pin order |
| 642 | planned | Keyboard shortcut: Ctrl+Alt+C to copy as curl for the current tab request |
| 643 | planned | Keyboard shortcut: Ctrl+Alt+F to copy as fetch for the current tab request |
| 644 | planned | Keyboard shortcut: Ctrl+Alt+N to new Note from the current tab |
| 645 | planned | Keyboard shortcut: Ctrl+Alt+G to new Finding from the current tab |
| 646 | planned | Body viewer: first-class pretty printer and validator for JSON |
| 647 | planned | Body viewer: first-class pretty printer and validator for XML |
| 648 | planned | Body viewer: first-class pretty printer and validator for HTML |
| 649 | planned | Body viewer: first-class pretty printer and validator for CSV |
| 650 | planned | Body viewer: first-class pretty printer and validator for YAML |
| 651 | planned | Body viewer: first-class pretty printer and validator for protobuf |
| 652 | planned | Body viewer: first-class pretty printer and validator for MessagePack |
| 653 | planned | Body viewer: first-class pretty printer and validator for CBOR |
| 654 | planned | Body viewer: first-class pretty printer and validator for Avro |
| 655 | planned | Body viewer: first-class pretty printer and validator for Thrift |
| 656 | planned | Body viewer: first-class pretty printer and validator for multipart/form-data |
| 657 | planned | Body viewer: first-class pretty printer and validator for application/x-www-form-urlencoded |
| 658 | planned | Body viewer: first-class pretty printer and validator for text/event-stream |
| 659 | planned | Body viewer: first-class pretty printer and validator for application/grpc |
| 660 | planned | Body viewer: first-class pretty printer and validator for application/grpc-web+proto |
| 661 | planned | Body viewer: first-class pretty printer and validator for image/svg+xml |
| 662 | planned | Body viewer: first-class pretty printer and validator for application/pdf |
| 663 | planned | Body viewer: first-class pretty printer and validator for application/jose |
| 664 | planned | Body viewer: first-class pretty printer and validator for application/jwt |
| 665 | planned | Body viewer: first-class pretty printer and validator for application/problem+json |
| 666 | planned | Body viewer: first-class pretty printer and validator for application/hal+json |
| 667 | planned | Body viewer: first-class pretty printer and validator for application/vnd.api+json |
| 668 | planned | Body viewer: first-class pretty printer and validator for application/zip |
| 669 | planned | Body viewer: first-class pretty printer and validator for image/png |
| 670 | planned | Body viewer: first-class pretty printer and validator for image/jpeg |
| 671 | planned | Body viewer: first-class pretty printer and validator for image/gif |
| 672 | planned | Body viewer: first-class pretty printer and validator for image/webp |
| 673 | planned | Body viewer: first-class pretty printer and validator for font/woff2 |
| 674 | planned | Body viewer: first-class pretty printer and validator for text/markdown |
| 675 | planned | Body viewer: first-class pretty printer and validator for application/wasm |
| 676 | planned | Desktop integration: GNOME Wayland window controls and a server-side decoration pref |
| 677 | planned | Desktop integration: KDE Plasma icon theme and a tray icon that follows the color scheme |
| 678 | planned | Desktop integration: Windows 11 snap layouts and a jump list (recent projects, new private window) |
| 679 | planned | Desktop integration: Windows toast notifications for Collaborator hits |
| 680 | planned | Desktop integration: macOS menu bar extra with a live intercept badge |
| 681 | planned | Desktop integration: macOS notarization and a documented hardened-runtime exception list |
| 682 | planned | Desktop integration: macOS keychain for the vault and for the CA |
| 683 | planned | Desktop integration: Touch ID or Windows Hello to unlock the vault |
| 684 | planned | Desktop integration: libsecret on Linux for the vault |
| 685 | planned | Desktop integration: Portal-based file picker on sandboxed Linux builds |
| 686 | planned | Desktop integration: XDG desktop file and icon that survive a reinstall |
| 687 | planned | Desktop integration: AppStream metadata for the Linux package |
| 688 | planned | Desktop integration: Respect prefers-reduced-motion from the OS |
| 689 | planned | Desktop integration: Respect accent color from the OS where available |
| 690 | planned | Desktop integration: Jump-list or dock menu: new tab, new private window, last project |
| 691 | planned | Settings: search box that filters every settings row |
| 692 | planned | Settings: sections for general, appearance, privacy, search, downloads, network, lab, accessibility, and about |
| 693 | planned | Settings: restore defaults per section |
| 694 | planned | Settings: export settings as JSON |
| 695 | planned | Settings: import settings and warn on unknown keys |
| 696 | planned | Settings: language of the app UI independent of Accept-Language |
| 697 | planned | Settings: check for updates button |
| 698 | planned | Settings: release notes in the About page |
| 699 | planned | Settings: license and Inter OFL attribution in the About page |
| 700 | planned | Settings: open the profile directory from Settings |
| 701 | planned | Settings: reset the CA and regenerate it, with a warning that browsers must re-trust it |
| 702 | planned | Settings: show the CA fingerprint in About and in Settings |
| 703 | planned | Settings: install the CA into the OS trust store with an explicit, documented command (never silently) |
| 704 | planned | Settings: uninstall the CA from the OS store with the same care |
| 705 | planned | Settings: proxy listen address and port configuration |
| 706 | planned | Settings: random listen port for a shared machine |
| 707 | planned | Settings: bind to localhost only (default) versus a LAN interface with a confirmation |
| 708 | planned | Settings: control-plane socket authentication token rotation |
| 709 | planned | Settings: sidecar log level preference |
| 710 | planned | Settings: keep the sidecar running when the last window closes (off by default) |
| 711 | planned | Settings: launch at login (opt-in) |
| 712 | planned | Settings: minimize to a tray with a live intercept badge |
| 713 | planned | Settings: tray actions: pause traffic, open last project, kill switch |
| 714 | planned | Settings: notification when a Collaborator hit arrives |
| 715 | planned | Settings: notification when a scan finishes |
| 716 | planned | Settings: do-not-disturb that silences notifications |
| 717 | planned | Settings: theme preview for light and dark |
| 718 | planned | Settings: show the bookmarks bar on the new tab page only |
| 719 | planned | Settings: homepage preference |
| 720 | planned | Settings: new-tab content preference: blank, new-tab page, homepage |
| 721 | planned | Settings: spell-check languages |
| 722 | planned | Settings: block pop-ups (on by default) |
| 723 | planned | Settings: always show full URLs (no trimming of https and www) |
| 724 | planned | Settings: show punycode always |
| 725 | planned | Settings: ask before closing multiple tabs |
| 726 | planned | Settings: memory saver |
| 727 | planned | Settings: disable preconnect and prefetch in a lab profile |
| 728 | planned | Settings: lab banner required before Discover, Intruder, or Scanner start |
| 729 | planned | Settings: lab: enforce scope in the sidecar, with a visible bypass that is off by default and audited |
| 730 | planned | Settings: lab: maximum requests per second |
| 731 | planned | Settings: lab: collaborator server picker |
| 732 | planned | Settings: LLM: never-send hosts list |
| 733 | planned | Settings: LLM: store chats per project and a clear-chats action |
| 734 | planned | Settings: accessibility: always show focus, reduced motion, high contrast |
| 735 | planned | Onboarding: tour of the chrome for a first run (tabs, omnibox, Proxy menu, Assistant) |
| 736 | planned | Onboarding: sample project that points at Juice Shop on localhost:3000 |
| 737 | planned | Onboarding: sample project that points at DVWA on localhost:4280 |
| 738 | planned | Onboarding: in-app lab recipes for common classes, matching the practice targets |
| 739 | planned | Onboarding: practice-range page that refuses to start tools against anything not in the lab host allow list |
| 740 | planned | Onboarding: interactive tutorial: intercept a request and add a header |
| 741 | planned | Onboarding: interactive tutorial: send to Repeater and change a body field |
| 742 | planned | Onboarding: interactive tutorial: mark Intruder positions and run a sniper payload |
| 743 | planned | Onboarding: interactive tutorial: plant a Collaborator payload and watch a hit |
| 744 | planned | Onboarding: interactive tutorial: score a finding with CVSS and export a report |
| 745 | planned | Onboarding: what's-new sheet after an update, generated from the changelog |
| 746 | planned | Onboarding: in-app hints that can be dismissed and restored from Settings |
| 747 | planned | Playbook: OWASP WSTG information gathering checklist with a done/skipped state per project |
| 748 | planned | Playbook: WSTG configuration management checklist with a done/skipped state per project |
| 749 | planned | Playbook: WSTG identity management checklist with a done/skipped state per project |
| 750 | planned | Playbook: WSTG authentication checklist with a done/skipped state per project |
| 751 | planned | Playbook: WSTG authorization checklist with a done/skipped state per project |
| 752 | planned | Playbook: WSTG session management checklist with a done/skipped state per project |
| 753 | planned | Playbook: WSTG input validation checklist with a done/skipped state per project |
| 754 | planned | Playbook: WSTG error handling checklist with a done/skipped state per project |
| 755 | planned | Playbook: WSTG cryptography checklist with a done/skipped state per project |
| 756 | planned | Playbook: WSTG business logic checklist with a done/skipped state per project |
| 757 | planned | Playbook: WSTG client-side checklist with a done/skipped state per project |
| 758 | planned | Playbook: WSTG API testing checklist with a done/skipped state per project |
| 759 | planned | Playbook: ASVS V1 architecture checklist with a done/skipped state per project |
| 760 | planned | Playbook: ASVS V2 authentication checklist with a done/skipped state per project |
| 761 | planned | Playbook: ASVS V3 session checklist with a done/skipped state per project |
| 762 | planned | Playbook: ASVS V4 access control checklist with a done/skipped state per project |
| 763 | planned | Playbook: ASVS V5 validation checklist with a done/skipped state per project |
| 764 | planned | Playbook: ASVS V6 cryptography at rest and in transit checklist with a done/skipped state per project |
| 765 | planned | Playbook: ASVS V7 stored cryptography checklist with a done/skipped state per project |
| 766 | planned | Playbook: ASVS V8 data protection checklist with a done/skipped state per project |
| 767 | planned | Playbook: ASVS V9 communication checklist with a done/skipped state per project |
| 768 | planned | Playbook: ASVS V10 malicious code checklist with a done/skipped state per project |
| 769 | planned | Playbook: ASVS V11 business logic checklist with a done/skipped state per project |
| 770 | planned | Playbook: ASVS V12 files checklist with a done/skipped state per project |
| 771 | planned | Playbook: ASVS V13 API checklist with a done/skipped state per project |
| 772 | planned | Playbook: ASVS V14 configuration checklist with a done/skipped state per project |
| 773 | planned | Playbook: MASVS when a webview is in scope checklist with a done/skipped state per project |
| 774 | planned | Playbook: SOC2 evidence pack (screenshots plus hash chain) checklist with a done/skipped state per project |
| 775 | planned | Playbook: ISO 27001 control mapping appendix checklist with a done/skipped state per project |
| 776 | planned | Playbook: NIST 800-53 selected web controls appendix checklist with a done/skipped state per project |
| 777 | planned | Playbook: CIS Web Software Benchmark mapping checklist with a done/skipped state per project |
| 778 | planned | Playbook: CWE Top 25 reverse index in the report checklist with a done/skipped state per project |
| 779 | planned | Interop: import issues from another proxy tool's XML or SARIF |
| 780 | planned | Interop: import a Nuclei JSONL result (in-scope hosts only) |
| 781 | planned | Interop: import an Nmap XML host list into Recon (in-scope roots only) |
| 782 | planned | Interop: import ffuf or gobuster JSON into Discover |
| 783 | planned | Interop: import httpx or katana URLs into the site map |
| 784 | planned | Interop: SARIF export of findings |
| 785 | planned | Interop: CycloneDX export when a JavaScript SBOM is produced |
| 786 | planned | Interop: JUnit-like export of Scanner checks for a pipeline |
| 787 | planned | Interop: webhook on finding-created and on collaborator-hit |
| 788 | planned | Interop: Slack or Teams incoming webhook (opt-in) |
| 789 | planned | Interop: GitHub Action for a future lurkwire scan CLI |
| 790 | planned | HTTP hygiene check: Content-Type sniffing |
| 791 | planned | HTTP hygiene check: X-Content-Type-Options |
| 792 | planned | HTTP hygiene check: X-Frame-Options versus CSP frame-ancestors |
| 793 | planned | HTTP hygiene check: Referrer-Policy |
| 794 | planned | HTTP hygiene check: Permissions-Policy on authenticated pages |
| 795 | planned | HTTP hygiene check: Cache-Control on authenticated responses |
| 796 | planned | HTTP hygiene check: Vary when Authorization or Cookie is present |
| 797 | planned | HTTP hygiene check: Server and X-Powered-By notes |
| 798 | planned | HTTP hygiene check: source-map comments |
| 799 | planned | HTTP hygiene check: directory listing |
| 800 | planned | HTTP hygiene check: default error page fingerprint |
| 801 | planned | HTTP hygiene check: unexpected TRACE or TRACK |
| 802 | planned | HTTP hygiene check: unexpected PUT or DELETE on a static root |
| 803 | planned | HTTP hygiene check: OpenAPI or Swagger UI left enabled |
| 804 | planned | HTTP hygiene check: GraphQL IDE left enabled |
| 805 | planned | HTTP hygiene check: debug endpoints on an in-scope host |
| 806 | planned | HTTP hygiene check: login page served over HTTP |
| 807 | planned | HTTP hygiene check: session cookie Secure flag |
| 808 | planned | HTTP hygiene check: session cookie HttpOnly flag |
| 809 | planned | HTTP hygiene check: session cookie SameSite flag |
| 810 | planned | HTTP hygiene check: session identifier appearing in a URL |
| 811 | planned | HTTP hygiene check: token appearing in a query string |
| 812 | planned | HTTP hygiene check: token leaking via Referer |
| 813 | planned | HTTP hygiene check: API key in a frontend bundle |
| 814 | planned | HTTP hygiene check: CSP missing or unsafe-inline on an authenticated page |
| 815 | planned | HTTP hygiene check: SRI missing on a third-party script |
| 816 | planned | HTTP hygiene check: cookie SameSite=None on a login response |
| 817 | planned | HTTP hygiene check: cacheable authenticated response |
| 818 | planned | HTTP hygiene check: security.txt present and well-formed |
| 819 | planned | HTTP hygiene check: robots.txt paths offered to Discover without treating them as authorization |
| 820 | planned | HTTP hygiene check: JWT with a surprising algorithm or a very late expiry |
| 821 | planned | HTTP hygiene check: scope enforced in the sidecar, not only the UI |
| 822 | planned | HTTP hygiene check: rate cap per host for automated tools |
| 823 | planned | HTTP hygiene check: evidence locker for request and response pairs used in a report |
| 824 | planned | HTTP hygiene check: screenshot redaction of the omnibox before export |
| 825 | planned | HTTP hygiene check: time-zone consistent timestamps in the report |
| 826 | planned | HTTP hygiene check: delta report since the last export |
| 827 | planned | HTTP hygiene check: one-click promotion of an Intruder row to a finding |
| 828 | planned | HTTP hygiene check: one-click promotion of a Logger event to a Note |
| 829 | planned | Browser deep cut: picture-in-picture mute and seek controls |
| 830 | planned | Browser deep cut: media key support for a foreground tab |
| 831 | planned | Browser deep cut: per-site autoplay policy |
| 832 | planned | Browser deep cut: persistent notifications permission review every 30 days |
| 833 | planned | Browser deep cut: Web serial and USB allowed only in a named lab profile |
| 834 | planned | Browser deep cut: font fingerprint resistance in strict mode |
| 835 | planned | Browser deep cut: audio context fingerprint resistance |
| 836 | planned | Browser deep cut: screen-size spoof in a private window |
| 837 | planned | Browser deep cut: Accept-Language override per project |
| 838 | planned | Browser deep cut: custom DNS over TLS beside DoH |
| 839 | planned | Browser deep cut: captive portal detection that bypasses the MITM safely |
| 840 | planned | Browser deep cut: certificate error interstitial with a technical view |
| 841 | planned | Browser deep cut: temporary certificate exception limited to the current session |
| 842 | planned | Browser deep cut: HSTS preload list (opt-in, dated) |
| 843 | planned | Browser deep cut: OCSP or CRL status in the identity popover |
| 844 | planned | Browser deep cut: TLS fingerprint inspector and a lab override |
| 845 | planned | Browser deep cut: HTTP/3 toggle per project |
| 846 | planned | Browser deep cut: IPv6 enable or disable per project |
| 847 | planned | Browser deep cut: network log export as a netlog or SSLKEYLOGFILE (lab only, warn) |
| 848 | planned | Browser deep cut: PAC editor with a tester |
| 849 | planned | Browser deep cut: SOCKS5 with remote DNS |
| 850 | planned | Browser deep cut: upstream proxy authentication prompt that does not echo into history |
| 851 | planned | Browser deep cut: Kerberos or NTLM pass-through for a lab directory (opt-in) |
| 852 | planned | Browser deep cut: master password for the local vault |
| 853 | planned | Browser deep cut: vault auto-lock after idle |
| 854 | planned | Browser deep cut: generated passwords with a pronounceable option |
| 855 | planned | Browser deep cut: TOTP filler from the vault |
| 856 | planned | Browser deep cut: passkey discoverable credential manager |
| 857 | planned | Browser deep cut: form data never saved in a private window |
| 858 | planned | Browser deep cut: caret browse mode |
| 859 | planned | Browser deep cut: reader view typography controls |
| 860 | planned | Browser deep cut: text-only zoom that does not scale layout |
| 861 | planned | Browser deep cut: minimum font size |
| 862 | planned | Browser deep cut: page style disable |
| 863 | planned | Browser deep cut: PDF viewer with form fill |
| 864 | planned | Browser deep cut: markdown preview for local .md files |
| 865 | planned | Browser deep cut: CSV preview as a table (capped) |
| 866 | planned | Browser deep cut: RSS or Atom preview with a subscribe-to-bookmarks action |
| 867 | planned | Browser deep cut: custom protocol handlers per profile |
| 868 | planned | Browser deep cut: open with a system browser when a site must bypass the lab CA |
| 869 | planned | Browser deep cut: copy all URLs in this window |
| 870 | planned | Browser deep cut: paste a list of URLs as tabs |
| 871 | planned | Browser deep cut: named session slots |
| 872 | planned | Browser deep cut: GPU process toggle and a software-render fallback |
| 873 | planned | Browser deep cut: process-per-site versus process-per-tab preference |
| 874 | planned | Browser deep cut: site isolation always-on |
| 875 | planned | Browser deep cut: COOP, COEP, and CORP report viewer |
| 876 | planned | Browser deep cut: Reporting API and NEL log in the Logger |
| 877 | planned | Browser deep cut: Permissions-Policy inspector |
| 878 | planned | Browser deep cut: CSP reports collected into Notes |
| 879 | planned | Browser deep cut: Trusted Types violation log |
| 880 | planned | Browser deep cut: mixed-content auto-upgrade log |
| 881 | planned | Browser deep cut: storage access prompt that is never silently granted in a lab profile |
| 882 | planned | Browser deep cut: bundled fingerprint test page at lurkwire://fingerprints |
| 883 | planned | Browser deep cut: WebGL vendor spoof |
| 884 | planned | Browser deep cut: canvas noise in strict privacy mode |
| 885 | planned | Browser deep cut: sensor and battery API spoof or block |
| 886 | planned | Browser deep cut: QR code generated for the current page |
| 887 | planned | Browser deep cut: share sheet on supporting OS layers |
| 888 | planned | Browser deep cut: set as default browser |
| 889 | planned | Browser deep cut: internal lurkwire://gpu, lurkwire://processes, and lurkwire://net-internals pages |
| 890 | planned | Browser deep cut: feature flag page at lurkwire://flags |
| 891 | planned | Browser deep cut: reset all flags to default |
| 892 | planned | Documentation: worked example 001 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 893 | planned | Documentation: worked example 002 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 894 | planned | Documentation: worked example 003 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 895 | planned | Documentation: worked example 004 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 896 | planned | Documentation: worked example 005 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 897 | planned | Documentation: worked example 006 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 898 | planned | Documentation: worked example 007 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 899 | planned | Documentation: worked example 008 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 900 | planned | Documentation: worked example 009 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 901 | planned | Documentation: worked example 010 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 902 | planned | Documentation: worked example 011 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 903 | planned | Documentation: worked example 012 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 904 | planned | Documentation: worked example 013 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 905 | planned | Documentation: worked example 014 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 906 | planned | Documentation: worked example 015 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 907 | planned | Documentation: worked example 016 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 908 | planned | Documentation: worked example 017 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 909 | planned | Documentation: worked example 018 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 910 | planned | Documentation: worked example 019 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 911 | planned | Documentation: worked example 020 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 912 | planned | Documentation: worked example 021 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 913 | planned | Documentation: worked example 022 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 914 | planned | Documentation: worked example 023 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 915 | planned | Documentation: worked example 024 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 916 | planned | Documentation: worked example 025 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 917 | planned | Documentation: worked example 026 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 918 | planned | Documentation: worked example 027 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 919 | planned | Documentation: worked example 028 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 920 | planned | Documentation: worked example 029 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 921 | planned | Documentation: worked example 030 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 922 | planned | Documentation: worked example 031 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 923 | planned | Documentation: worked example 032 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 924 | planned | Documentation: worked example 033 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 925 | planned | Documentation: worked example 034 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 926 | planned | Documentation: worked example 035 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 927 | planned | Documentation: worked example 036 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 928 | planned | Documentation: worked example 037 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 929 | planned | Documentation: worked example 038 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 930 | planned | Documentation: worked example 039 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 931 | planned | Documentation: worked example 040 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 932 | planned | Documentation: worked example 041 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 933 | planned | Documentation: worked example 042 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 934 | planned | Documentation: worked example 043 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 935 | planned | Documentation: worked example 044 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 936 | planned | Documentation: worked example 045 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 937 | planned | Documentation: worked example 046 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 938 | planned | Documentation: worked example 047 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 939 | planned | Documentation: worked example 048 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 940 | planned | Documentation: worked example 049 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 941 | planned | Documentation: worked example 050 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 942 | planned | Documentation: worked example 051 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 943 | planned | Documentation: worked example 052 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 944 | planned | Documentation: worked example 053 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 945 | planned | Documentation: worked example 054 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 946 | planned | Documentation: worked example 055 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 947 | planned | Documentation: worked example 056 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 948 | planned | Documentation: worked example 057 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 949 | planned | Documentation: worked example 058 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 950 | planned | Documentation: worked example 059 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 951 | planned | Documentation: worked example 060 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 952 | planned | Documentation: worked example 061 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 953 | planned | Documentation: worked example 062 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 954 | planned | Documentation: worked example 063 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 955 | planned | Documentation: worked example 064 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 956 | planned | Documentation: worked example 065 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 957 | planned | Documentation: worked example 066 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 958 | planned | Documentation: worked example 067 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 959 | planned | Documentation: worked example 068 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 960 | planned | Documentation: worked example 069 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 961 | planned | Documentation: worked example 070 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 962 | planned | Documentation: worked example 071 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 963 | planned | Documentation: worked example 072 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 964 | planned | Documentation: worked example 073 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 965 | planned | Documentation: worked example 074 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 966 | planned | Documentation: worked example 075 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 967 | planned | Documentation: worked example 076 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 968 | planned | Documentation: worked example 077 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 969 | planned | Documentation: worked example 078 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 970 | planned | Documentation: worked example 079 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 971 | planned | Documentation: worked example 080 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 972 | planned | Documentation: worked example 081 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 973 | planned | Documentation: worked example 082 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 974 | planned | Documentation: worked example 083 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 975 | planned | Documentation: worked example 084 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 976 | planned | Documentation: worked example 085 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 977 | planned | Documentation: worked example 086 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 978 | planned | Documentation: worked example 087 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 979 | planned | Documentation: worked example 088 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 980 | planned | Documentation: worked example 089 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 981 | planned | Documentation: worked example 090 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 982 | planned | Documentation: worked example 091 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 983 | planned | Documentation: worked example 092 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 984 | planned | Documentation: worked example 093 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 985 | planned | Documentation: worked example 094 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 986 | planned | Documentation: worked example 095 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 987 | planned | Documentation: worked example 096 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 988 | planned | Documentation: worked example 097 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 989 | planned | Documentation: worked example 098 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 990 | planned | Documentation: worked example 099 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 991 | planned | Documentation: worked example 100 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 992 | planned | Documentation: worked example 101 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 993 | planned | Documentation: worked example 102 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 994 | planned | Documentation: worked example 103 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 995 | planned | Documentation: worked example 104 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 996 | planned | Documentation: worked example 105 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 997 | planned | Documentation: worked example 106 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 998 | planned | Documentation: worked example 107 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 999 | planned | Documentation: worked example 108 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 1000 | planned | Documentation: worked example 109 of a scoped lab workflow, with a screenshot slot and an evidence template |

## Revision

This catalog landed with the professional design-system and categorized-menu work. Update the counts in the next pass as items move from planned to done.

