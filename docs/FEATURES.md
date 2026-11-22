# Lurkwire feature catalog

This is the product roadmap expressed as concrete features, not slogans.
Each item is either **done** in the current tree or **planned**. Counts in this revision: **1000** items, **213** done, **787** planned.

Honesty rules:

- Done means the feature is implemented and wired, not a placeholder button.
- Planned means it is not in the tree yet. Several planned items already have a manual workaround in an existing tool.
- Attack features only run against hosts the operator has put in **scope**. Practice and documentation use authorized lab targets such as OWASP Juice Shop, DVWA, httpbin, and demo.testfire.net.
- Shipping a thousand stubs would be a lie; this file is the list, and releases tick items from planned to done.

## Design system

Visual language so the chrome reads like Firefox Proton or Chrome. _49 items: 37 done, 12 planned._

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
| 29 | done | Brand color tokens taken from the Lurkwire mark (purple and magenta) |
| 30 | done | Aliased radius and weight tokens so --radius-sm and --fw-600 resolve |
| 31 | done | Frame versus toolbar contrast that makes Proton tab ears read clearly |
| 32 | done | Chrome-style pill address bar that merges with the suggestion list |
| 33 | done | Refined empty states without dashed prototype borders |
| 34 | done | Single-wordmark new tab page with a brand atmospheric wash |
| 35 | done | Segmented traffic-monitor tabs and a quieter bookmarks-bar empty state |
| 36 | done | Assistant sidebar typography, bubbles, and composer polish |
| 37 | done | Reduced-motion mode that disables tab and dock animation |
| 38 | planned | High-contrast theme that meets WCAG AAA for text and chrome |
| 39 | planned | Forced-colors / Windows High Contrast mappings |
| 40 | planned | Compact density mode that tightens chrome by 4px |
| 41 | planned | Touch-friendly density with 40px hit targets |
| 42 | planned | User-selectable accent color |
| 43 | planned | Custom theme editor that exports a token JSON file |
| 44 | planned | Per-monitor scale-aware typography (125% / 150% / 200%) |
| 45 | planned | RTL layout mirroring for the chrome and tool dock |
| 46 | planned | Icon-only toolbar mode |
| 47 | planned | Window backdrop blur behind translucent toolbars on supporting compositors |
| 48 | planned | Light theme screenshot regression suite in CI |
| 49 | planned | Dark theme screenshot regression suite in CI |

## Browser chrome and tabs

Daily-driver tab strip, windows, and session behavior. _59 items: 20 done, 39 planned._

| # | Status | Feature |
| --- | --- | --- |
| 50 | done | New tab (Ctrl+T) |
| 51 | done | Close tab with a circular hover close affordance |
| 52 | done | Favicon in the tab, with a letter fallback when none is present |
| 53 | done | Loading throbber aligned with the favicon slot |
| 54 | done | Pinned tabs that hide the title and close button |
| 55 | done | Tab groups with a color underline |
| 56 | done | Audio indicator on a tab that is playing sound |
| 57 | done | Mute / unmute from the tab audio badge |
| 58 | done | Active tab Proton-style ear corners |
| 59 | done | Tab hover background |
| 60 | done | Tab title ellipsis |
| 61 | done | Drag region on the tab strip for moving the window |
| 62 | done | New window (Ctrl+N) |
| 63 | done | New private window (Ctrl+Shift+N) |
| 64 | done | Multiple windows with independent tab strips |
| 65 | done | Session restore preference (opt-in) |
| 66 | done | Internal lurkwire:// pages (new tab, settings, history, downloads, bookmarks, about) |
| 67 | done | Error icon on a failed tab load |
| 68 | planned | Drag-and-drop tab reorder within a window |
| 69 | planned | Detach a tab into a new window by dragging it off the strip |
| 70 | planned | Tear-off tab preview while dragging |
| 71 | done | Tab search (Ctrl+Shift+A) with type-ahead across open tabs |
| 72 | planned | Sleep unused background tabs to reclaim memory |
| 73 | planned | Memory usage chip per tab |
| 74 | planned | Duplicate tab |
| 75 | planned | Reopen closed tab (Ctrl+Shift+T) with a 25-item stack |
| 76 | planned | Reopen closed window |
| 77 | planned | Tab context menu: reload, pin, mute, group, close others, close to the right |
| 78 | planned | Close other tabs |
| 79 | planned | Close tabs to the right |
| 80 | planned | Close tabs to the left |
| 81 | planned | Unload tab (keep it in the strip, drop the renderer) |
| 82 | planned | Hibernate a tab group |
| 83 | planned | Vertical tabs sidebar |
| 84 | planned | Tree-style tabs |
| 85 | planned | Tab preview thumbnail on hover |
| 86 | planned | Picture-in-picture from a tab with video |
| 87 | planned | Name a window and show the name in the tab strip |
| 88 | planned | Move tab to another open window from the context menu |
| 89 | planned | Restore the last session automatically after a crash |
| 90 | planned | Startup: continue where I left off, open a specific page, or open a new tab |
| 91 | planned | Per-tab zoom remembered across sessions |
| 92 | planned | Discarded-tab favicon desaturation |
| 93 | planned | Tab crash page with Reload and Restore |
| 94 | planned | Confirm before closing a window with many tabs |
| 95 | planned | Middle-click a tab to close it |
| 96 | planned | Middle-click a link to open it in a background tab |
| 97 | planned | Ctrl+click a bookmark to open in a new tab |
| 98 | planned | Pin a lurkwire:// page as an app tab |
| 99 | planned | Overflow chevron when tabs no longer fit the strip |
| 100 | planned | Scroll the tab strip with the mouse wheel |
| 101 | planned | Touchpad two-finger swipe between tabs |
| 102 | planned | Keyboard: Ctrl+Tab / Ctrl+Shift+Tab cycle |
| 103 | planned | Keyboard: Ctrl+1 through Ctrl+8 select tab, Ctrl+9 last tab |
| 104 | planned | Recently closed tabs in the History menu |
| 105 | planned | Tab groups saved and named for later |
| 106 | planned | Auto-group tabs by site |
| 107 | planned | Send tab to another signed-in device |
| 108 | done | Reader-view tab that strips chrome from an article |

## Navigation and omnibox

Address bar, search, and suggestions. _44 items: 19 done, 25 planned._

| # | Status | Feature |
| --- | --- | --- |
| 109 | done | Chrome-style omnibox with identity icon and URL field |
| 110 | done | Focus ring on the omnibox (accent plus soft halo) |
| 111 | done | Auto-detect a URL versus a search query |
| 112 | done | Scheme-aware URL parsing that does not treat localhost:port as a scheme |
| 113 | done | Search suggestions with a type icon |
| 114 | done | History suggestions with favicon and secondary URL text |
| 115 | done | Bookmark suggestions in the dropdown |
| 116 | done | Suggestion rows sized and aligned to a 44px rhythm |
| 117 | done | Ctrl+L focuses the address bar |
| 118 | done | Inline completion ghost text |
| 119 | done | Back, forward, reload, and stop toolbar buttons |
| 120 | done | Reload with F5; hard reload with Ctrl+Shift+R (not bound to Repeater) |
| 121 | done | Identity chip for HTTPS, insecure HTTP, and internal pages |
| 122 | done | Star / bookmark toggle in the toolbar |
| 123 | done | Downloads toolbar button |
| 124 | done | App menu in-window (Wayland-safe) |
| 125 | done | Project switcher in the toolbar |
| 126 | done | Intercept toggle in the navbar |
| 127 | done | Memory chip in the toolbar |
| 128 | planned | Search engine manager (add, edit, keyword, default) |
| 129 | planned | Tab-to-search on a site that exposes OpenSearch |
| 130 | planned | Site-specific search keyword (for example wiki query) |
| 131 | planned | @-modifiers in the omnibox (@tabs, @history, @bookmarks, @tools) |
| 132 | planned | Clipboard URL suggestion when the clipboard holds a URL |
| 133 | planned | Calculator and unit conversion in the omnibox |
| 134 | planned | Paste and go |
| 135 | planned | Paste and search |
| 136 | planned | Copy URL without the scheme or with the canonical form |
| 137 | planned | Switch-to-tab suggestion when the URL is already open |
| 138 | planned | Certificate viewer from the identity popover |
| 139 | planned | Cookie and permission summary from the identity popover |
| 140 | planned | Clear site data from the identity popover |
| 141 | planned | Custom default search engine (DuckDuckGo, Startpage, self-hosted) |
| 142 | planned | Per-project default search engine |
| 143 | planned | QR code for the current URL |
| 144 | planned | Send the current URL to Repeater from the identity menu |
| 145 | planned | Punycode display for IDN domains with a spoof warning |
| 146 | planned | Copy clean URL (strip tracking parameters) |
| 147 | planned | Built-in tracking-parameter stripper list |
| 148 | planned | HTTPS-only mode with an upgrade-navigate and fallback interstitial |
| 149 | planned | Secure DNS (DoH) provider picker |
| 150 | planned | Type-ahead domain completion from history only, never from a remote suggest API unless opted in |
| 151 | planned | Off-the-record omnibox that does not write typed URLs to history |
| 152 | planned | Work-offline indicator in the identity popover |

## Bookmarks and library

Bookmarks bar, manager, and import. _34 items: 5 done, 29 planned._

| # | Status | Feature |
| --- | --- | --- |
| 153 | done | Bookmarks bar with favicon and title chips |
| 154 | done | Pixel-tight 32px bookmarks strip |
| 155 | done | Show / hide the bookmarks bar preference |
| 156 | done | Add a bookmark from the star button |
| 157 | done | Bookmark manager at lurkwire://bookmarks |
| 158 | planned | Bookmark folders on the bar |
| 159 | planned | Overflow chevron for bookmarks that do not fit |
| 160 | planned | Drag to reorder bookmarks |
| 161 | planned | Bookmark tags |
| 162 | planned | Bookmark descriptions and notes |
| 163 | planned | Full-text search over bookmark titles and URLs |
| 164 | planned | Import bookmarks from a Netscape HTML file |
| 165 | planned | Import bookmarks from Firefox |
| 166 | planned | Import bookmarks from Chrome / Chromium |
| 167 | planned | Export bookmarks to HTML |
| 168 | planned | Backup and restore bookmarks as JSON |
| 169 | planned | Bookmark this tab in a chosen folder from a compact dialog |
| 170 | planned | Bookmark all tabs as a folder |
| 171 | planned | Keyboard shortcut Ctrl+D to bookmark |
| 172 | planned | Keyboard shortcut Ctrl+Shift+D to bookmark all tabs |
| 173 | planned | Bookmarks menu in the app menu |
| 174 | planned | Open all bookmarks in a folder in new tabs |
| 175 | planned | Open all in a new window |
| 176 | planned | Open all in a private window |
| 177 | planned | Sort a folder by name, URL, or date added |
| 178 | planned | Read later / unread bookmark flag |
| 179 | planned | Favicon refresh for stale bookmarks |
| 180 | planned | Dead-link checker for a bookmark folder |
| 181 | planned | Sync bookmarks across machines once sign-in exists |
| 182 | planned | Separator items on the bookmarks bar |
| 183 | planned | Other Bookmarks folder |
| 184 | planned | Bookmark keywords that expand in the omnibox |
| 185 | planned | Starred page edit dialog: name, folder, tags |
| 186 | planned | Prevent duplicate bookmarks with a merge prompt |

## History, downloads, find, zoom, and print

Everyday browser utilities. _37 items: 11 done, 26 planned._

| # | Status | Feature |
| --- | --- | --- |
| 187 | done | Browsing history page at lurkwire://history |
| 188 | done | History available from the app menu (not the pentest bar) |
| 189 | done | Ctrl+H opens browsing history |
| 190 | done | Downloads page at lurkwire://downloads |
| 191 | done | Downloads toolbar popover (in-window) |
| 192 | done | Find in page (Ctrl+F) |
| 193 | done | History search with date filters |
| 194 | planned | History grouped by day and by site |
| 195 | planned | Delete a single history entry |
| 196 | planned | Delete history for a site |
| 197 | planned | Clear recent history dialog with time range and data types |
| 198 | planned | Clear cookies, cache, and storage independently |
| 199 | planned | Do not record history in a private window (partition already exists; finish the UI) |
| 200 | planned | Most visited tiles on the new tab page |
| 201 | planned | Recently closed on the new tab page |
| 202 | planned | Download progress in the toolbar button |
| 203 | done | Pause, resume, and cancel a download |
| 204 | done | Open the downloaded file |
| 205 | done | Show the downloaded file in the folder |
| 206 | planned | Always ask where to save files |
| 207 | planned | Set a default download directory |
| 208 | planned | Dangerous-file download warning |
| 209 | planned | Download history persisted across restarts |
| 210 | done | Find in page match count, previous, next, highlight all |
| 211 | planned | Find in page case-sensitive and regex modes |
| 212 | planned | Zoom in, zoom out, reset (Ctrl+Plus / Minus / 0) |
| 213 | planned | Per-site remembered zoom |
| 214 | planned | Full screen (F11) with a slim slide-down chrome |
| 215 | planned | Print dialog and print preview |
| 216 | planned | Print to PDF |
| 217 | planned | Save page as HTML, MHTML, or a complete directory |
| 218 | planned | Screenshot the visible tab |
| 219 | planned | Screenshot the full page |
| 220 | planned | Copy screenshot to clipboard |
| 221 | planned | Open file (Ctrl+O) for local HTML |
| 222 | planned | View page source |
| 223 | planned | Task manager for renderers and the proxy sidecar |

## Privacy, permissions, and browser security

A daily-driver privacy surface, not just a proxy. _33 items: 4 done, 29 planned._

| # | Status | Feature |
| --- | --- | --- |
| 224 | done | Private window that uses a separate session partition |
| 225 | done | Kill switch that stops proxying immediately |
| 226 | done | Insecure identity state for HTTP pages |
| 227 | done | CA certificate generated by the local MITM proxy and installable on the machine |
| 228 | planned | Permission prompts for camera, microphone, location, notifications, clipboard, serial, and USB |
| 229 | planned | Site permissions manager |
| 230 | planned | Default deny for third-party cookies |
| 231 | planned | Total cookie protection / per-site cookie jars |
| 232 | planned | Tracking-prevention standard and strict modes |
| 233 | planned | Block third-party storage access unless granted |
| 234 | planned | HTTPS-First upgrades |
| 235 | planned | Certificate transparency checks |
| 236 | planned | HSTS cache inspector |
| 237 | planned | Clear HSTS for a host (lab use) |
| 238 | planned | Client-certificate picker for mTLS sites |
| 239 | planned | Built-in password manager with a local vault |
| 240 | planned | Passkey / WebAuthn authenticator |
| 241 | planned | Import passwords from a CSV, Firefox, or Chrome export |
| 242 | planned | Global privacy control and DNT header toggle |
| 243 | planned | Referrer policy override |
| 244 | planned | User-Agent reduction and a UA override per project |
| 245 | planned | Timezone, locale, and language spoofing per project |
| 246 | planned | WebRTC IP leak protection (proxy-only ICE) |
| 247 | planned | Disable JavaScript per site |
| 248 | planned | Disable images, fonts, or media per site |
| 249 | planned | Cookie exceptions list |
| 250 | planned | Popup blocker with a manage-blocked UI |
| 251 | planned | Redirect tracker stripping |
| 252 | planned | First-party isolate for localStorage and IndexedDB |
| 253 | planned | Private-window leftover disk scrubber |
| 254 | planned | External protocol (mailto, tel) confirmation |
| 255 | planned | Warn on mixed content and provide a block or allow choice |
| 256 | planned | Local log of permission grants |

## Profiles, projects, and sessions

Separate work and keep an engagement tidy. _27 items: 5 done, 22 planned._

| # | Status | Feature |
| --- | --- | --- |
| 257 | done | Named projects with a unique color |
| 258 | done | Create a project from the toolbar |
| 259 | done | Switch the current project |
| 260 | done | Project-scoped proxy history |
| 261 | done | Project-scoped scope rules, notes, and findings |
| 262 | planned | Named browser profiles (work, personal, lab) with isolated stores |
| 263 | planned | Open a profile in a dedicated window |
| 264 | planned | Avatar and color for a profile |
| 265 | planned | Container tabs (multi-account containers) inside one window |
| 266 | planned | Assign a site to always open in a container |
| 267 | planned | Export a project as a portable archive (flows, notes, scope, findings) |
| 268 | planned | Import a project archive |
| 269 | planned | Project templates (web app, API, thick-client HTTP) |
| 270 | planned | Engagement metadata: client, dates, rules of engagement, allowed CIDRs |
| 271 | planned | Read-only review mode for a finished project |
| 272 | planned | Lock a project with an OS keyring password |
| 273 | planned | Auto-delete a project and its traffic after N days |
| 274 | planned | Git-friendly project export (markdown notes, HAR, and JSON) |
| 275 | planned | Session macros: record a login and replay it before a scan |
| 276 | planned | Cookie jar profiles (low-priv, high-priv, anonymous) for Autorize |
| 277 | planned | Switch the captured session used by Repeater, Intruder, and Scanner in one click |
| 278 | planned | Account switcher that keeps N parallel cookie jars |
| 279 | planned | Client certificate bound to a project |
| 280 | planned | Upstream proxy (HTTP, HTTPS, SOCKS5) per project |
| 281 | planned | PAC file support for the upstream hop |
| 282 | planned | Split-tunnel: bypass the MITM for a host list |
| 283 | planned | Clock skew / date spoof for token-expiry tests |

## Proxy and traffic

The live HTTP(S) history a practitioner expects. _61 items: 25 done, 36 planned._

| # | Status | Feature |
| --- | --- | --- |
| 284 | done | Local MITM proxy sidecar written in Rust |
| 285 | done | HTTP and HTTPS interception with a project CA |
| 286 | done | Live traffic monitor in the tools dock |
| 287 | done | Traffic as a first-class top-bar tool (not buried in a left rail) |
| 288 | done | Filter the live list |
| 289 | done | Select a row and inspect the request and response |
| 290 | done | HTTP message viewer for headers and body |
| 291 | done | HAR export |
| 292 | done | Pause / live toggle |
| 293 | done | Right-click a request: Send to Repeater, Intruder, Scanner, Comparer, Workbench |
| 294 | done | Copy as curl |
| 295 | done | Copy as fetch |
| 296 | done | Copy URL |
| 297 | done | Add host to scope from a request |
| 298 | done | Highlight and comment on a request |
| 299 | done | Copy a CSRF proof-of-concept form |
| 300 | done | Copy a clickjacking proof-of-concept page |
| 301 | done | Copy a security-header report |
| 302 | done | Retest CORS from a request |
| 303 | done | Send discovered JWTs to the Decoder |
| 304 | done | Request metadata (method, host, path, status, length) |
| 305 | done | In-scope indicator on a flow |
| 306 | done | WebSocket, SSE, and gRPC frame capture surfaced in the Sockets tool |
| 307 | done | Live filter language (method, status, mime, host, path, regex, highlight color) |
| 308 | done | Saved filter presets |
| 309 | planned | Hide images, CSS, fonts, and analytics with one click |
| 310 | planned | Show only in-scope, only annotated, or only with findings |
| 311 | planned | Column picker and persisted column widths |
| 312 | planned | Sort by time, duration, status, size, or host |
| 313 | planned | Duration and TTFB column |
| 314 | planned | Waterfall timing view for a request (DNS, TCP, TLS, wait, download) |
| 315 | planned | Protocol column (HTTP/1.1, HTTP/2, HTTP/3) |
| 316 | planned | HTTP/2 and HTTP/3 interception |
| 317 | planned | Brotli and zstd response decoding in the viewer |
| 318 | planned | Pretty-print JSON, XML, HTML, and form bodies |
| 319 | planned | Hex and image viewers |
| 320 | planned | SVG and PDF preview |
| 321 | planned | Syntax-highlighted HTML and JS with wrap |
| 322 | planned | Search inside a request or response body |
| 323 | planned | Search across the whole history (bodies included, with a size cap) |
| 324 | planned | Auto-scroll lock / unlock the live tail |
| 325 | planned | Drop captured noise (heartbeats, health checks) with a rule |
| 326 | planned | Repeat the request from the history row without opening Repeater |
| 327 | planned | Compare this response to the previous one for the same URL |
| 328 | planned | Copy as wget, PowerShell, and HTTPie |
| 329 | planned | Copy as a Python requests snippet |
| 330 | planned | Copy as a Go net/http snippet |
| 331 | planned | Export selected rows as HAR or XML |
| 332 | planned | Import a HAR into the current project |
| 333 | planned | Import history from another proxy tool's XML or HAR |
| 334 | planned | Stream history to a JSONL file |
| 335 | planned | gRPC-Web and Connect-RPC decoded as JSON in the viewer |
| 336 | planned | GraphQL operation name column |
| 337 | planned | Automatic de-duplication of identical static assets |
| 338 | planned | Color-code 3xx, 4xx, and 5xx in the status column |
| 339 | planned | Request map (method plus path template) rolled up from raw URLs |
| 340 | planned | Right-click: copy host, copy path, copy query params as a table |
| 341 | planned | Response header annotations (CSP, HSTS, cookies) as chips |
| 342 | planned | Cookie set/cleared chips on a response row |
| 343 | planned | Mark a request as a login, logout, or CSRF step |
| 344 | planned | Traffic pause also queues websocket frames |

## Intercept, match/replace, scope, and sockets

Items under the Proxy menu. _38 items: 14 done, 24 planned._

| # | Status | Feature |
| --- | --- | --- |
| 345 | done | Intercept on/off (Ctrl+Shift+I) |
| 346 | done | Intercept and edit a request before it is forwarded |
| 347 | done | Intercept and edit a response before it is delivered to the browser |
| 348 | done | Forward, drop, or replay an intercepted message |
| 349 | done | Intercept badge in the navbar |
| 350 | done | Match and replace rules applied in the live Rust MITM path |
| 351 | done | Request match/replace runs before intercept |
| 352 | done | Response match/replace runs after upstream, with intercept edits winning last |
| 353 | done | Scope include and exclude host patterns |
| 354 | done | Active tools default-deny until an include matches |
| 355 | done | Exclude wins over include |
| 356 | done | Scope manager UI |
| 357 | done | WebSocket history tool |
| 358 | done | Replay a captured WebSocket frame |
| 359 | planned | Intercept filters (URL, method, mime, in-scope only, exclude static) |
| 360 | planned | Intercept queue with a list of held messages and a one-click forward-all |
| 361 | planned | Intercept breakpoints that match a regex or a header |
| 362 | planned | Automatically add a header on intercepted requests |
| 363 | planned | Pretty-edit JSON in the intercept pane |
| 364 | planned | Binary-safe intercept editor with hex and ASCII |
| 365 | planned | Hold and modify a WebSocket frame before it is forwarded |
| 366 | planned | Match/replace comments and enable/disable per rule |
| 367 | planned | Match/replace regex with capture groups and backreferences |
| 368 | planned | Match/replace only in-scope, or only when a header is present |
| 369 | planned | Header add, remove, and set as first-class rule types |
| 370 | planned | Body find-and-replace with a regex tester |
| 371 | planned | Import and export match/replace rules as JSON |
| 372 | planned | Scope by CIDR, port, and scheme |
| 373 | planned | Scope by a file of hostnames |
| 374 | planned | Advanced scope: AND/OR path, query, or header conditions |
| 375 | planned | Scope preview: how many recent flows would match |
| 376 | planned | Suite-wide use-scope toggle for each tool |
| 377 | planned | Out-of-scope warning before a Repeater send to a new host |
| 378 | planned | WebSocket JSON pretty printer and typo-safe editor |
| 379 | planned | WebSocket ping, pong, and close-frame builder |
| 380 | planned | SSE event stream inspector with typed events |
| 381 | planned | Socket.io / SockJS parser |
| 382 | planned | gRPC stream inspector with protobuf decode from a descriptor set or reflection |

## Attack tools

Repeater, Intruder, Scanner, smuggling, CORS, param miner, Autorize. _59 items: 24 done, 35 planned._

| # | Status | Feature |
| --- | --- | --- |
| 383 | done | Repeater with a draft filled from Send to Repeater (Ctrl+R) |
| 384 | done | Ctrl+Enter sends or resends in Repeater |
| 385 | done | Repeater request editor |
| 386 | done | Repeater response viewer |
| 387 | done | Intruder with payload positions marked in the request |
| 388 | done | Send to Intruder (Ctrl+I) |
| 389 | done | Intruder attack types: sniper, pitchfork, battering ram, cluster bomb |
| 390 | done | Intruder payload lists and presets |
| 391 | done | Intruder results table |
| 392 | done | Scanner queue |
| 393 | done | Scanner findings grouped by severity |
| 394 | done | Finding evidence in an HTTP viewer |
| 395 | done | Retest a finding |
| 396 | done | Send a request to the Scanner |
| 397 | done | Request smuggling tool with a local lab |
| 398 | done | In-scope remote smuggling probe |
| 399 | done | Param miner that compares status and length to a baseline |
| 400 | done | Autorize: replay a request as other sessions |
| 401 | done | CORS tester: Origin and preflight probes with a triage verdict |
| 402 | done | CORS menu entry under Attack |
| 403 | done | Repeater tabs for multiple requests in the same dock |
| 404 | done | Repeater request history with pin and comment |
| 405 | planned | Repeater environment variables and a project-level base URL |
| 406 | planned | Repeater send in a loop with a delay |
| 407 | planned | Repeater follow redirects with a hop inspector |
| 408 | planned | Repeater HTTP/2 pseudo-header editor |
| 409 | planned | Repeater send in the current browser session versus send from the sidecar |
| 410 | planned | Pretty and raw editors that stay in sync |
| 411 | planned | Request inspector: parsed query, cookies, multipart, JSON paths |
| 412 | planned | Response diff against the previous send automatically |
| 413 | planned | Intruder extract (regex, JSONPath, CSS selector, XPath) |
| 414 | done | Intruder match and payload grep |
| 415 | planned | Intruder resource pool and concurrency slider |
| 416 | planned | Intruder attack scheduler with start, pause, and resume |
| 417 | planned | Intruder payload processors: hash, encode, prefix, skip, cut, case |
| 418 | planned | Intruder character, number, date, and null payload generators |
| 419 | done | Intruder CSV and wordlist import |
| 420 | planned | Intruder result charts (status histogram, length outliers) |
| 421 | planned | Cluster-bomb safety cap and an estimated request count |
| 422 | planned | Scanner crawl and audit pipeline with a visible queue |
| 423 | planned | Scanner insertion points (URL, body, cookies, headers, JSON, XML, multipart) |
| 424 | planned | Scanner check packs for the common web classes, each with a safe confirm |
| 425 | planned | Scanner JavaScript-aware crawl (click, form fill, same-origin fetch hooks) |
| 426 | planned | Scanner API-aware crawl from an OpenAPI or HAR seed |
| 427 | planned | Scanner incremental retest of only failing checks |
| 428 | planned | Scanner false-positive mark and a suppression rule |
| 429 | planned | Scanner confidence and evidence quality flags |
| 430 | planned | Out-of-band scanner checks via the Collaborator |
| 431 | planned | CORS checks folded into the Scanner pack, with the lab tool kept for manual work |
| 432 | planned | Smuggling timing and differential confirmations |
| 433 | planned | HTTP/2 request smuggling helpers |
| 434 | planned | Param miner: cookie, header, and body parameter discovery |
| 435 | planned | Param miner wordlists for common frameworks |
| 436 | planned | Param miner cache-key probe for unkeyed inputs |
| 437 | planned | Autorize: automatic access-control diffs from live traffic with a low/high session pair |
| 438 | planned | Autorize enforcement detection (status, length, body hash, JSON field) |
| 439 | planned | Session recorder that produces a reusable login macro |
| 440 | planned | Token freshness hook before each Autorize or Intruder request |
| 441 | planned | Attack dashboard that rolls up running Intruder, Scanner, and Discover jobs |

## Recon tools

Site map, content discovery, intel, GraphQL, and out-of-band. _35 items: 6 done, 29 planned._

| # | Status | Feature |
| --- | --- | --- |
| 442 | done | Site map of hosts and paths seen by the proxy |
| 443 | done | Content discovery with an enlarged wordlist, limited to in-scope hosts |
| 444 | done | Recon and site intel pane for the current host |
| 445 | done | GraphQL explorer (schema, graph, query lab) |
| 446 | done | OOB collaborator with a copy-payload action and a hit log |
| 447 | done | JavaScript secret scanning helper that can be sent toward Notes |
| 448 | planned | Site map folder tree with method and status badges |
| 449 | planned | Site map merge of path templates (/users/{id}) |
| 450 | planned | Site map right-click send to any attack tool |
| 451 | planned | Site map export as sitemap.xml, CSV, or JSON |
| 452 | planned | Site map compare of two crawls |
| 453 | planned | Discover: recursive crawl of newly found directories |
| 454 | planned | Discover: extension permutations |
| 455 | planned | Discover: response-code filtering and size outliers |
| 456 | planned | Discover: custom wordlist per project |
| 457 | planned | Discover: parse robots.txt, sitemap.xml, and JS for extra paths |
| 458 | planned | Discover: backup-file and source-map hunt |
| 459 | planned | JavaScript endpoint extraction into the site map and Notes |
| 460 | planned | Secret scanning packs for common cloud and CI token shapes |
| 461 | planned | Recon: DNS, WHOIS, TLS certificate SAN, and HTTP fingerprint in one view |
| 462 | planned | Recon: technology fingerprint from a local database |
| 463 | planned | Recon: security.txt, humans.txt, ads.txt |
| 464 | planned | Recon: favicon hash lookup against a local dataset |
| 465 | planned | Recon: optional Shodan, Censys, or crt.sh connectors with operator-supplied keys |
| 466 | planned | Recon: subdomain wordlist and resolvers, strictly against in-scope roots |
| 467 | planned | GraphQL mutation and subscription lab |
| 468 | planned | GraphQL batching and alias-abuse probes with a cap |
| 469 | planned | GraphQL field-suggestion reconnaissance |
| 470 | planned | GraphQL authorization tests per field with a second session |
| 471 | planned | GraphQL persisted-query inspector |
| 472 | planned | OOB: multiple collaborator backends (Interactsh, self-hosted, DNS-only) |
| 473 | planned | OOB: payload templates correlated to a check identifier |
| 474 | planned | OOB: desktop and webhook alerting when a payload fires |
| 475 | planned | Screenshot a target unauthenticated surface for the report |
| 476 | planned | Wayback or Common Crawl URL import into the site map (in-scope hosts only) |

## Decode, JWT, comparer, sequencer, and cookies

Items under the Decode menu. _35 items: 14 done, 21 planned._

| # | Status | Feature |
| --- | --- | --- |
| 477 | done | Decoder++ with URL, Base64, hex, HTML, and related codecs |
| 478 | done | JWT tab: decode, inspect claims, and tamper |
| 479 | done | Unsigned and signed JWT helpers |
| 480 | done | Hash identifiers and hash codecs |
| 481 | done | Gzip and compressed payload decode |
| 482 | done | Decode-all / magic mode that tries a chain of codecs |
| 483 | done | Chef-style recipe tab |
| 484 | done | Comparer for two responses side by side |
| 485 | done | Sequencer that measures token and cookie randomness |
| 486 | done | Cookie manager: inspect, copy, export, or delete session cookies |
| 487 | done | JWT menu alias that opens the Decoder on the JWT tab |
| 488 | done | Cookie export already present in the manager |
| 489 | planned | Decoder compact mode in a standalone pane |
| 490 | planned | Decoder drop-a-file or hex-dump input |
| 491 | planned | Decoder output as hex, C, Python, or raw bytes |
| 492 | planned | Custom codec plugins in JavaScript or WASM |
| 493 | planned | JWT algorithm-confusion and header-injection labs against authorized targets |
| 494 | planned | JWT claim editor with typo-safe iat, nbf, and exp, then resign |
| 495 | planned | JWT JWKS fetch (in-scope) and key inventory |
| 496 | planned | Encrypted JWE support |
| 497 | planned | Paseto and other typed-token helpers |
| 498 | done | Comparer: request versus request and header-only diffs |
| 499 | done | Comparer: ignore whitespace and volatile fields |
| 500 | planned | Comparer: more than two items in a set, with a baseline |
| 501 | planned | Comparer: image / pixel diff for visual responses |
| 502 | planned | Sequencer: larger sample sizes and a chart of entropy over time |
| 503 | planned | Sequencer: statistical randomness tests with a plain-language verdict |
| 504 | planned | Sequencer: auto-capture a token from a live endpoint |
| 505 | planned | Cookie manager: edit flags (Secure, HttpOnly, SameSite, Prefix, Partitioned) |
| 506 | planned | Cookie manager: import a Netscape cookie file |
| 507 | planned | Cookie manager: replay a cookie into another profile |
| 508 | planned | Cookie manager: highlight first-party versus third-party versus session versus persistent |
| 509 | planned | Set-Cookie diff after a login |
| 510 | planned | Storage inspector: localStorage, sessionStorage, IndexedDB, Cache Storage |
| 511 | planned | Clear site storage from the cookie tool |

## Findings, notes, logger, CVSS, and report

Items under the Report menu. _31 items: 5 done, 26 planned._

| # | Status | Feature |
| --- | --- | --- |
| 512 | done | Findings report tool that exports Markdown and HTML from scanner findings and notes |
| 513 | done | Notes tool with CVSS 3.1 scoring |
| 514 | done | CVSS menu alias that opens Notes on the scorer |
| 515 | done | Event logger with filters |
| 516 | done | Engagement notes stored with the project |
| 517 | planned | Findings inbox with triage states: new, confirmed, false positive, duplicate, accepted risk, fixed |
| 518 | planned | Finding fields: title, asset, CWE, CVSS, evidence, steps, impact, remediation, references |
| 519 | planned | Attach request/response pairs and screenshots to a finding |
| 520 | planned | Deduplicate findings by fingerprint |
| 521 | planned | Merge findings and keep a history of triage decisions |
| 522 | planned | Retest all confirmed findings and update their status |
| 523 | planned | Jira, Linear, or GitHub issue export with operator-supplied tokens |
| 524 | planned | ASVS, OWASP Top 10, and WSTG mapping on each finding |
| 525 | planned | Custom report templates (letterhead, severity colors, executive versus technical) |
| 526 | planned | PDF report export |
| 527 | planned | DOCX report export |
| 528 | planned | CSV and JSON finding export for a GRC tool |
| 529 | planned | Report includes a scope appendix and a methodology appendix |
| 530 | planned | Report includes a traffic coverage chart (paths hit versus site map) |
| 531 | planned | Signed report hash so a PDF can be later verified |
| 532 | planned | Notes: markdown editor with a preview, tags, and backlinks |
| 533 | planned | Notes: embed a flow, a finding, or a screenshot |
| 534 | planned | Notes: templates for login, recon, and daily standup |
| 535 | planned | Logger: structured columns, regex highlight, and export |
| 536 | planned | Logger: ring buffer size preference and a persist-to-disk switch |
| 537 | planned | Audit log hash chain already used by the sidecar, surfaced in the Logger |
| 538 | planned | CVSS 4.0 support |
| 539 | planned | EPSS and CISA KEV enrichment (opt-in, cached) |
| 540 | planned | SSVC decision helper |
| 541 | planned | Risk register view for a client workshop |
| 542 | planned | Meeting-ready one-pager from the top N findings |

## Assistant, workbench, and platform

LLM sidebar, API workbench, packaging, and quality. _75 items: 22 done, 53 planned._

| # | Status | Feature |
| --- | --- | --- |
| 543 | done | Right-hand LLM assistant sidebar |
| 544 | done | Assistant toggle on the categorized tool bar |
| 545 | done | Resizable LLM sidebar width, persisted |
| 546 | done | LLM provider settings and connectors |
| 547 | done | Redaction before a prompt is sent |
| 548 | done | API workbench (HTTP, GraphQL, gRPC collections) |
| 549 | done | Send a captured flow into the workbench |
| 550 | done | Command palette (Ctrl+K) that searches pages, tools, and send-to actions |
| 551 | done | Keyboard shortcut sheet (Ctrl+/) |
| 552 | done | In-window popovers and menus (Wayland-safe, no stray BrowserWindows) |
| 553 | done | Categorized Proxy, Attack, Recon, Decode, and Report menus |
| 554 | done | Pinned 1-click tools (Traffic, Intercept, Repeater, Intruder, Scanner) with a persisted pin set |
| 555 | done | Keyboard-navigable tool menus (arrows, enter, escape, type-to-search, left/right between menus) |
| 556 | done | Linux AppImage and .deb packaging |
| 557 | done | CI for unit tests and Linux package |
| 558 | done | Packaged AppImage smoke test |
| 559 | done | Unit tests for send-to routing, match/replace direction, param miner, decode-all, report export, menus, and tokens |
| 560 | done | Public repository, README, and LICENSE |
| 561 | done | Token and menu-group unit tests ship with the desktop workspace |
| 562 | done | Linux dist:linux produces an AppImage and a .deb |
| 563 | done | This feature catalog committed at docs/FEATURES.md |
| 564 | planned | Assistant: tool-use that can quote a flow, draft a Repeater request, or open a finding (always with a confirm) |
| 565 | planned | Assistant: local-only models via Ollama or llama.cpp |
| 566 | planned | Assistant: project memory that stays on disk and is never used as training data |
| 567 | done | Assistant: explain this finding and draft a remediation actions |
| 568 | planned | Workbench: environments, secrets vault, and chainable scripts |
| 569 | planned | Workbench: Postman / Insomnia import |
| 570 | planned | Workbench: OpenAPI import that scaffolds a collection |
| 571 | planned | Workbench: contract tests run against an in-scope base URL |
| 572 | planned | Workbench: gRPC reflection and proto upload |
| 573 | planned | Extensions: Chromium-compatible MV3 with a reviewed permission prompt |
| 574 | planned | Extensions: a curated lab store (no silent drive-by installs) |
| 575 | planned | Userscripts per project |
| 576 | planned | Accessibility: full keyboard path through every tool, announced live regions, and a screen-reader audit |
| 577 | planned | Localization: English, plus a translation pipeline for additional locales |
| 578 | planned | macOS .dmg and notarized build |
| 579 | planned | Windows NSIS / MSIX build with optional default-browser registration |
| 580 | planned | Auto-update with signed artifacts and a release channel (stable, beta) |
| 581 | planned | Crash reporter that is off by default and strips secrets |
| 582 | planned | Official documentation site generated from this catalog |
| 583 | planned | Fuzz the sidecar and the renderer IPC in CI |
| 584 | planned | Supply-chain: signed SBOM, pinned actions, and a regular advisory process |
| 585 | planned | Headless CLI for scan and report in pipelines |
| 586 | planned | Remote collaborator / team server (self-hosted) |
| 587 | planned | Role-based access on a team server (operator, reviewer, guest) |
| 588 | planned | Signed Linux packages |
| 589 | planned | Flatpak package |
| 590 | planned | Nix package / flake |
| 591 | planned | Homebrew cask for macOS |
| 592 | planned | WinGet and Chocolatey packages |
| 593 | planned | Reproducible builds documented in the repo |
| 594 | planned | SBOM attached to every release |
| 595 | planned | Vulnerability disclosure policy in SECURITY.md |
| 596 | planned | Cargo audit and npm audit in CI with an allow list |
| 597 | planned | Load test: long-lived traffic without dropping the UI frame rate |
| 598 | planned | Memory leak test for an 8-hour proxy session |
| 599 | planned | Startup time budget and a CI check |
| 600 | planned | AppImage smoke on Ubuntu LTS and a current Fedora |
| 601 | planned | Wayland and X11 smoke (menus stay in-window on both) |
| 602 | planned | HiDPI smoke at 200% |
| 603 | planned | Keyboard-only smoke of the tool menus and the omnibox |
| 604 | planned | Screen reader smoke of the tab strip and a finding |
| 605 | planned | ADR folder for design decisions |
| 606 | planned | Contributor guide |
| 607 | planned | Code of conduct |
| 608 | planned | Threat model document for the desktop app and the sidecar |
| 609 | planned | IPC allow-list review (renderer talks to the sidecar only through preload) |
| 610 | planned | ContextIsolation and sandbox remain on; a CI test fails if they are relaxed |
| 611 | planned | No Node integration in the renderer; a CI test fails if it is turned on |
| 612 | planned | Content-security-policy for lurkwire:// pages |
| 613 | planned | Secret scanning of the repo in CI |
| 614 | planned | Disk-full behavior: freeze captures and warn, never corrupt the project database |
| 615 | planned | Project database migration tests |
| 616 | planned | Portable mode with the store next to the binary |
| 617 | planned | Feature flags for incomplete work so a planned item never ships as a stub button |

## Shortcuts, viewers, settings, checks, interop, and onboarding

Concrete remaining work generated from structured lists so the roadmap stays specific. _383 items: 2 done, 381 planned._

| # | Status | Feature |
| --- | --- | --- |
| 618 | planned | Keyboard shortcut: Ctrl+Shift+B to toggle the bookmarks bar |
| 619 | planned | Keyboard shortcut: Ctrl+Shift+O to open the bookmark manager |
| 620 | done | Keyboard shortcut: Ctrl+J to open downloads |
| 621 | planned | Keyboard shortcut: Ctrl+Shift+Delete to open clear-history |
| 622 | planned | Keyboard shortcut: Alt+Home to open the homepage |
| 623 | planned | Keyboard shortcut: Alt+Left to go back |
| 624 | planned | Keyboard shortcut: Alt+Right to go forward |
| 625 | planned | Keyboard shortcut: Ctrl+U to view source |
| 626 | planned | Keyboard shortcut: Ctrl+S to save page |
| 627 | planned | Keyboard shortcut: Ctrl+P to print |
| 628 | planned | Keyboard shortcut: Ctrl+G to find next |
| 629 | planned | Keyboard shortcut: Ctrl+Shift+G to find previous |
| 630 | planned | Keyboard shortcut: F3 to find next (alternate) |
| 631 | planned | Keyboard shortcut: F6 to cycle focus between chrome and content |
| 632 | planned | Keyboard shortcut: F7 to caret browse |
| 633 | planned | Keyboard shortcut: F10 to focus the app menu |
| 634 | planned | Keyboard shortcut: F11 to full screen |
| 635 | planned | Keyboard shortcut: Shift+F5 to hard reload (alias of Ctrl+Shift+R) |
| 636 | planned | Keyboard shortcut: Ctrl+W to close tab |
| 637 | planned | Keyboard shortcut: Ctrl+Shift+W to close window |
| 638 | planned | Keyboard shortcut: Ctrl+Shift+T to reopen last tab |
| 639 | planned | Keyboard shortcut: Ctrl+M to mute tab |
| 640 | planned | Keyboard shortcut: Ctrl+D to bookmark this tab |
| 641 | planned | Keyboard shortcut: Ctrl+Shift+K to focus the Logger quick filter |
| 642 | planned | Keyboard shortcut: Ctrl+Shift+E to toggle the tool dock |
| 643 | done | Keyboard shortcut: Ctrl+Shift+A to open tab search |
| 644 | planned | Keyboard shortcut: Ctrl+Shift+M to toggle the Assistant |
| 645 | planned | Keyboard shortcut: Ctrl+Alt+R to open Repeater without sending a request |
| 646 | planned | Keyboard shortcut: Ctrl+Alt+I to open Intruder without sending a request |
| 647 | planned | Keyboard shortcut: Ctrl+Alt+S to open Scanner |
| 648 | planned | Keyboard shortcut: Ctrl+Alt+T to open Traffic and focus the filter |
| 649 | planned | Keyboard shortcut: Alt+1 through Alt+5 to open a pinned tool by pin order |
| 650 | planned | Keyboard shortcut: Ctrl+Alt+C to copy as curl for the current tab request |
| 651 | planned | Keyboard shortcut: Ctrl+Alt+F to copy as fetch for the current tab request |
| 652 | planned | Keyboard shortcut: Ctrl+Alt+N to new Note from the current tab |
| 653 | planned | Keyboard shortcut: Ctrl+Alt+G to new Finding from the current tab |
| 654 | planned | Body viewer: first-class pretty printer and validator for JSON |
| 655 | planned | Body viewer: first-class pretty printer and validator for XML |
| 656 | planned | Body viewer: first-class pretty printer and validator for HTML |
| 657 | planned | Body viewer: first-class pretty printer and validator for CSV |
| 658 | planned | Body viewer: first-class pretty printer and validator for YAML |
| 659 | planned | Body viewer: first-class pretty printer and validator for protobuf |
| 660 | planned | Body viewer: first-class pretty printer and validator for MessagePack |
| 661 | planned | Body viewer: first-class pretty printer and validator for CBOR |
| 662 | planned | Body viewer: first-class pretty printer and validator for Avro |
| 663 | planned | Body viewer: first-class pretty printer and validator for Thrift |
| 664 | planned | Body viewer: first-class pretty printer and validator for multipart/form-data |
| 665 | planned | Body viewer: first-class pretty printer and validator for application/x-www-form-urlencoded |
| 666 | planned | Body viewer: first-class pretty printer and validator for text/event-stream |
| 667 | planned | Body viewer: first-class pretty printer and validator for application/grpc |
| 668 | planned | Body viewer: first-class pretty printer and validator for application/grpc-web+proto |
| 669 | planned | Body viewer: first-class pretty printer and validator for image/svg+xml |
| 670 | planned | Body viewer: first-class pretty printer and validator for application/pdf |
| 671 | planned | Body viewer: first-class pretty printer and validator for application/jose |
| 672 | planned | Body viewer: first-class pretty printer and validator for application/jwt |
| 673 | planned | Body viewer: first-class pretty printer and validator for application/problem+json |
| 674 | planned | Body viewer: first-class pretty printer and validator for application/hal+json |
| 675 | planned | Body viewer: first-class pretty printer and validator for application/vnd.api+json |
| 676 | planned | Body viewer: first-class pretty printer and validator for application/zip |
| 677 | planned | Body viewer: first-class pretty printer and validator for image/png |
| 678 | planned | Body viewer: first-class pretty printer and validator for image/jpeg |
| 679 | planned | Body viewer: first-class pretty printer and validator for image/gif |
| 680 | planned | Body viewer: first-class pretty printer and validator for image/webp |
| 681 | planned | Body viewer: first-class pretty printer and validator for font/woff2 |
| 682 | planned | Body viewer: first-class pretty printer and validator for text/markdown |
| 683 | planned | Body viewer: first-class pretty printer and validator for application/wasm |
| 684 | planned | Desktop integration: GNOME Wayland window controls and a server-side decoration pref |
| 685 | planned | Desktop integration: KDE Plasma icon theme and a tray icon that follows the color scheme |
| 686 | planned | Desktop integration: Windows 11 snap layouts and a jump list (recent projects, new private window) |
| 687 | planned | Desktop integration: Windows toast notifications for Collaborator hits |
| 688 | planned | Desktop integration: macOS menu bar extra with a live intercept badge |
| 689 | planned | Desktop integration: macOS notarization and a documented hardened-runtime exception list |
| 690 | planned | Desktop integration: macOS keychain for the vault and for the CA |
| 691 | planned | Desktop integration: Touch ID or Windows Hello to unlock the vault |
| 692 | planned | Desktop integration: libsecret on Linux for the vault |
| 693 | planned | Desktop integration: Portal-based file picker on sandboxed Linux builds |
| 694 | planned | Desktop integration: XDG desktop file and icon that survive a reinstall |
| 695 | planned | Desktop integration: AppStream metadata for the Linux package |
| 696 | planned | Desktop integration: Respect prefers-reduced-motion from the OS |
| 697 | planned | Desktop integration: Respect accent color from the OS where available |
| 698 | planned | Desktop integration: Jump-list or dock menu: new tab, new private window, last project |
| 699 | planned | Settings: search box that filters every settings row |
| 700 | planned | Settings: sections for general, appearance, privacy, search, downloads, network, lab, accessibility, and about |
| 701 | planned | Settings: restore defaults per section |
| 702 | planned | Settings: export settings as JSON |
| 703 | planned | Settings: import settings and warn on unknown keys |
| 704 | planned | Settings: language of the app UI independent of Accept-Language |
| 705 | planned | Settings: check for updates button |
| 706 | planned | Settings: release notes in the About page |
| 707 | planned | Settings: license and Inter OFL attribution in the About page |
| 708 | planned | Settings: open the profile directory from Settings |
| 709 | planned | Settings: reset the CA and regenerate it, with a warning that browsers must re-trust it |
| 710 | planned | Settings: show the CA fingerprint in About and in Settings |
| 711 | planned | Settings: install the CA into the OS trust store with an explicit, documented command (never silently) |
| 712 | planned | Settings: uninstall the CA from the OS store with the same care |
| 713 | planned | Settings: proxy listen address and port configuration |
| 714 | planned | Settings: random listen port for a shared machine |
| 715 | planned | Settings: bind to localhost only (default) versus a LAN interface with a confirmation |
| 716 | planned | Settings: control-plane socket authentication token rotation |
| 717 | planned | Settings: sidecar log level preference |
| 718 | planned | Settings: keep the sidecar running when the last window closes (off by default) |
| 719 | planned | Settings: launch at login (opt-in) |
| 720 | planned | Settings: minimize to a tray with a live intercept badge |
| 721 | planned | Settings: tray actions: pause traffic, open last project, kill switch |
| 722 | planned | Settings: notification when a Collaborator hit arrives |
| 723 | planned | Settings: notification when a scan finishes |
| 724 | planned | Settings: do-not-disturb that silences notifications |
| 725 | planned | Settings: theme preview for light and dark |
| 726 | planned | Settings: show the bookmarks bar on the new tab page only |
| 727 | planned | Settings: homepage preference |
| 728 | planned | Settings: new-tab content preference: blank, new-tab page, homepage |
| 729 | planned | Settings: spell-check languages |
| 730 | planned | Settings: block pop-ups (on by default) |
| 731 | planned | Settings: always show full URLs (no trimming of https and www) |
| 732 | planned | Settings: show punycode always |
| 733 | planned | Settings: ask before closing multiple tabs |
| 734 | planned | Settings: memory saver |
| 735 | planned | Settings: disable preconnect and prefetch in a lab profile |
| 736 | planned | Settings: lab banner required before Discover, Intruder, or Scanner start |
| 737 | planned | Settings: lab: enforce scope in the sidecar, with a visible bypass that is off by default and audited |
| 738 | planned | Settings: lab: maximum requests per second |
| 739 | planned | Settings: lab: collaborator server picker |
| 740 | planned | Settings: LLM: never-send hosts list |
| 741 | planned | Settings: LLM: store chats per project and a clear-chats action |
| 742 | planned | Settings: accessibility: always show focus, reduced motion, high contrast |
| 743 | planned | Onboarding: tour of the chrome for a first run (tabs, omnibox, Proxy menu, Assistant) |
| 744 | planned | Onboarding: sample project that points at Juice Shop on localhost:3000 |
| 745 | planned | Onboarding: sample project that points at DVWA on localhost:4280 |
| 746 | planned | Onboarding: in-app lab recipes for common classes, matching the practice targets |
| 747 | planned | Onboarding: practice-range page that refuses to start tools against anything not in the lab host allow list |
| 748 | planned | Onboarding: interactive tutorial: intercept a request and add a header |
| 749 | planned | Onboarding: interactive tutorial: send to Repeater and change a body field |
| 750 | planned | Onboarding: interactive tutorial: mark Intruder positions and run a sniper payload |
| 751 | planned | Onboarding: interactive tutorial: plant a Collaborator payload and watch a hit |
| 752 | planned | Onboarding: interactive tutorial: score a finding with CVSS and export a report |
| 753 | planned | Onboarding: what's-new sheet after an update, generated from the changelog |
| 754 | planned | Onboarding: in-app hints that can be dismissed and restored from Settings |
| 755 | planned | Playbook: OWASP WSTG information gathering checklist with a done/skipped state per project |
| 756 | planned | Playbook: WSTG configuration management checklist with a done/skipped state per project |
| 757 | planned | Playbook: WSTG identity management checklist with a done/skipped state per project |
| 758 | planned | Playbook: WSTG authentication checklist with a done/skipped state per project |
| 759 | planned | Playbook: WSTG authorization checklist with a done/skipped state per project |
| 760 | planned | Playbook: WSTG session management checklist with a done/skipped state per project |
| 761 | planned | Playbook: WSTG input validation checklist with a done/skipped state per project |
| 762 | planned | Playbook: WSTG error handling checklist with a done/skipped state per project |
| 763 | planned | Playbook: WSTG cryptography checklist with a done/skipped state per project |
| 764 | planned | Playbook: WSTG business logic checklist with a done/skipped state per project |
| 765 | planned | Playbook: WSTG client-side checklist with a done/skipped state per project |
| 766 | planned | Playbook: WSTG API testing checklist with a done/skipped state per project |
| 767 | planned | Playbook: ASVS V1 architecture checklist with a done/skipped state per project |
| 768 | planned | Playbook: ASVS V2 authentication checklist with a done/skipped state per project |
| 769 | planned | Playbook: ASVS V3 session checklist with a done/skipped state per project |
| 770 | planned | Playbook: ASVS V4 access control checklist with a done/skipped state per project |
| 771 | planned | Playbook: ASVS V5 validation checklist with a done/skipped state per project |
| 772 | planned | Playbook: ASVS V6 cryptography at rest and in transit checklist with a done/skipped state per project |
| 773 | planned | Playbook: ASVS V7 stored cryptography checklist with a done/skipped state per project |
| 774 | planned | Playbook: ASVS V8 data protection checklist with a done/skipped state per project |
| 775 | planned | Playbook: ASVS V9 communication checklist with a done/skipped state per project |
| 776 | planned | Playbook: ASVS V10 malicious code checklist with a done/skipped state per project |
| 777 | planned | Playbook: ASVS V11 business logic checklist with a done/skipped state per project |
| 778 | planned | Playbook: ASVS V12 files checklist with a done/skipped state per project |
| 779 | planned | Playbook: ASVS V13 API checklist with a done/skipped state per project |
| 780 | planned | Playbook: ASVS V14 configuration checklist with a done/skipped state per project |
| 781 | planned | Playbook: MASVS when a webview is in scope checklist with a done/skipped state per project |
| 782 | planned | Playbook: SOC2 evidence pack (screenshots plus hash chain) checklist with a done/skipped state per project |
| 783 | planned | Playbook: ISO 27001 control mapping appendix checklist with a done/skipped state per project |
| 784 | planned | Playbook: NIST 800-53 selected web controls appendix checklist with a done/skipped state per project |
| 785 | planned | Playbook: CIS Web Software Benchmark mapping checklist with a done/skipped state per project |
| 786 | planned | Playbook: CWE Top 25 reverse index in the report checklist with a done/skipped state per project |
| 787 | planned | Interop: import issues from another proxy tool's XML or SARIF |
| 788 | planned | Interop: import a Nuclei JSONL result (in-scope hosts only) |
| 789 | planned | Interop: import an Nmap XML host list into Recon (in-scope roots only) |
| 790 | planned | Interop: import ffuf or gobuster JSON into Discover |
| 791 | planned | Interop: import httpx or katana URLs into the site map |
| 792 | planned | Interop: SARIF export of findings |
| 793 | planned | Interop: CycloneDX export when a JavaScript SBOM is produced |
| 794 | planned | Interop: JUnit-like export of Scanner checks for a pipeline |
| 795 | planned | Interop: webhook on finding-created and on collaborator-hit |
| 796 | planned | Interop: Slack or Teams incoming webhook (opt-in) |
| 797 | planned | Interop: GitHub Action for a future lurkwire scan CLI |
| 798 | planned | HTTP hygiene check: Content-Type sniffing |
| 799 | planned | HTTP hygiene check: X-Content-Type-Options |
| 800 | planned | HTTP hygiene check: X-Frame-Options versus CSP frame-ancestors |
| 801 | planned | HTTP hygiene check: Referrer-Policy |
| 802 | planned | HTTP hygiene check: Permissions-Policy on authenticated pages |
| 803 | planned | HTTP hygiene check: Cache-Control on authenticated responses |
| 804 | planned | HTTP hygiene check: Vary when Authorization or Cookie is present |
| 805 | planned | HTTP hygiene check: Server and X-Powered-By notes |
| 806 | planned | HTTP hygiene check: source-map comments |
| 807 | planned | HTTP hygiene check: directory listing |
| 808 | planned | HTTP hygiene check: default error page fingerprint |
| 809 | planned | HTTP hygiene check: unexpected TRACE or TRACK |
| 810 | planned | HTTP hygiene check: unexpected PUT or DELETE on a static root |
| 811 | planned | HTTP hygiene check: OpenAPI or Swagger UI left enabled |
| 812 | planned | HTTP hygiene check: GraphQL IDE left enabled |
| 813 | planned | HTTP hygiene check: debug endpoints on an in-scope host |
| 814 | planned | HTTP hygiene check: login page served over HTTP |
| 815 | planned | HTTP hygiene check: session cookie Secure flag |
| 816 | planned | HTTP hygiene check: session cookie HttpOnly flag |
| 817 | planned | HTTP hygiene check: session cookie SameSite flag |
| 818 | planned | HTTP hygiene check: session identifier appearing in a URL |
| 819 | planned | HTTP hygiene check: token appearing in a query string |
| 820 | planned | HTTP hygiene check: token leaking via Referer |
| 821 | planned | HTTP hygiene check: API key in a frontend bundle |
| 822 | planned | HTTP hygiene check: CSP missing or unsafe-inline on an authenticated page |
| 823 | planned | HTTP hygiene check: SRI missing on a third-party script |
| 824 | planned | HTTP hygiene check: cookie SameSite=None on a login response |
| 825 | planned | HTTP hygiene check: cacheable authenticated response |
| 826 | planned | HTTP hygiene check: security.txt present and well-formed |
| 827 | planned | HTTP hygiene check: robots.txt paths offered to Discover without treating them as authorization |
| 828 | planned | HTTP hygiene check: JWT with a surprising algorithm or a very late expiry |
| 829 | planned | HTTP hygiene check: scope enforced in the sidecar, not only the UI |
| 830 | planned | HTTP hygiene check: rate cap per host for automated tools |
| 831 | planned | HTTP hygiene check: evidence locker for request and response pairs used in a report |
| 832 | planned | HTTP hygiene check: screenshot redaction of the omnibox before export |
| 833 | planned | HTTP hygiene check: time-zone consistent timestamps in the report |
| 834 | planned | HTTP hygiene check: delta report since the last export |
| 835 | planned | HTTP hygiene check: one-click promotion of an Intruder row to a finding |
| 836 | planned | HTTP hygiene check: one-click promotion of a Logger event to a Note |
| 837 | planned | Browser deep cut: picture-in-picture mute and seek controls |
| 838 | planned | Browser deep cut: media key support for a foreground tab |
| 839 | planned | Browser deep cut: per-site autoplay policy |
| 840 | planned | Browser deep cut: persistent notifications permission review every 30 days |
| 841 | planned | Browser deep cut: Web serial and USB allowed only in a named lab profile |
| 842 | planned | Browser deep cut: font fingerprint resistance in strict mode |
| 843 | planned | Browser deep cut: audio context fingerprint resistance |
| 844 | planned | Browser deep cut: screen-size spoof in a private window |
| 845 | planned | Browser deep cut: Accept-Language override per project |
| 846 | planned | Browser deep cut: custom DNS over TLS beside DoH |
| 847 | planned | Browser deep cut: captive portal detection that bypasses the MITM safely |
| 848 | planned | Browser deep cut: certificate error interstitial with a technical view |
| 849 | planned | Browser deep cut: temporary certificate exception limited to the current session |
| 850 | planned | Browser deep cut: HSTS preload list (opt-in, dated) |
| 851 | planned | Browser deep cut: OCSP or CRL status in the identity popover |
| 852 | planned | Browser deep cut: TLS fingerprint inspector and a lab override |
| 853 | planned | Browser deep cut: HTTP/3 toggle per project |
| 854 | planned | Browser deep cut: IPv6 enable or disable per project |
| 855 | planned | Browser deep cut: network log export as a netlog or SSLKEYLOGFILE (lab only, warn) |
| 856 | planned | Browser deep cut: PAC editor with a tester |
| 857 | planned | Browser deep cut: SOCKS5 with remote DNS |
| 858 | planned | Browser deep cut: upstream proxy authentication prompt that does not echo into history |
| 859 | planned | Browser deep cut: Kerberos or NTLM pass-through for a lab directory (opt-in) |
| 860 | planned | Browser deep cut: master password for the local vault |
| 861 | planned | Browser deep cut: vault auto-lock after idle |
| 862 | planned | Browser deep cut: generated passwords with a pronounceable option |
| 863 | planned | Browser deep cut: TOTP filler from the vault |
| 864 | planned | Browser deep cut: passkey discoverable credential manager |
| 865 | planned | Browser deep cut: form data never saved in a private window |
| 866 | planned | Browser deep cut: caret browse mode |
| 867 | planned | Browser deep cut: reader view typography controls |
| 868 | planned | Browser deep cut: text-only zoom that does not scale layout |
| 869 | planned | Browser deep cut: minimum font size |
| 870 | planned | Browser deep cut: page style disable |
| 871 | planned | Browser deep cut: PDF viewer with form fill |
| 872 | planned | Browser deep cut: markdown preview for local .md files |
| 873 | planned | Browser deep cut: CSV preview as a table (capped) |
| 874 | planned | Browser deep cut: RSS or Atom preview with a subscribe-to-bookmarks action |
| 875 | planned | Browser deep cut: custom protocol handlers per profile |
| 876 | planned | Browser deep cut: open with a system browser when a site must bypass the lab CA |
| 877 | planned | Browser deep cut: copy all URLs in this window |
| 878 | planned | Browser deep cut: paste a list of URLs as tabs |
| 879 | planned | Browser deep cut: named session slots |
| 880 | planned | Browser deep cut: GPU process toggle and a software-render fallback |
| 881 | planned | Browser deep cut: process-per-site versus process-per-tab preference |
| 882 | planned | Browser deep cut: site isolation always-on |
| 883 | planned | Browser deep cut: COOP, COEP, and CORP report viewer |
| 884 | planned | Browser deep cut: Reporting API and NEL log in the Logger |
| 885 | planned | Browser deep cut: Permissions-Policy inspector |
| 886 | planned | Browser deep cut: CSP reports collected into Notes |
| 887 | planned | Browser deep cut: Trusted Types violation log |
| 888 | planned | Browser deep cut: mixed-content auto-upgrade log |
| 889 | planned | Browser deep cut: storage access prompt that is never silently granted in a lab profile |
| 890 | planned | Browser deep cut: bundled fingerprint test page at lurkwire://fingerprints |
| 891 | planned | Browser deep cut: WebGL vendor spoof |
| 892 | planned | Browser deep cut: canvas noise in strict privacy mode |
| 893 | planned | Browser deep cut: sensor and battery API spoof or block |
| 894 | planned | Browser deep cut: QR code generated for the current page |
| 895 | planned | Browser deep cut: share sheet on supporting OS layers |
| 896 | planned | Browser deep cut: set as default browser |
| 897 | planned | Browser deep cut: internal lurkwire://gpu, lurkwire://processes, and lurkwire://net-internals pages |
| 898 | planned | Browser deep cut: feature flag page at lurkwire://flags |
| 899 | planned | Browser deep cut: reset all flags to default |
| 900 | planned | Documentation: worked example 001 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 901 | planned | Documentation: worked example 002 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 902 | planned | Documentation: worked example 003 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 903 | planned | Documentation: worked example 004 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 904 | planned | Documentation: worked example 005 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 905 | planned | Documentation: worked example 006 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 906 | planned | Documentation: worked example 007 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 907 | planned | Documentation: worked example 008 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 908 | planned | Documentation: worked example 009 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 909 | planned | Documentation: worked example 010 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 910 | planned | Documentation: worked example 011 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 911 | planned | Documentation: worked example 012 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 912 | planned | Documentation: worked example 013 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 913 | planned | Documentation: worked example 014 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 914 | planned | Documentation: worked example 015 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 915 | planned | Documentation: worked example 016 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 916 | planned | Documentation: worked example 017 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 917 | planned | Documentation: worked example 018 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 918 | planned | Documentation: worked example 019 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 919 | planned | Documentation: worked example 020 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 920 | planned | Documentation: worked example 021 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 921 | planned | Documentation: worked example 022 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 922 | planned | Documentation: worked example 023 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 923 | planned | Documentation: worked example 024 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 924 | planned | Documentation: worked example 025 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 925 | planned | Documentation: worked example 026 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 926 | planned | Documentation: worked example 027 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 927 | planned | Documentation: worked example 028 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 928 | planned | Documentation: worked example 029 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 929 | planned | Documentation: worked example 030 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 930 | planned | Documentation: worked example 031 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 931 | planned | Documentation: worked example 032 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 932 | planned | Documentation: worked example 033 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 933 | planned | Documentation: worked example 034 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 934 | planned | Documentation: worked example 035 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 935 | planned | Documentation: worked example 036 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 936 | planned | Documentation: worked example 037 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 937 | planned | Documentation: worked example 038 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 938 | planned | Documentation: worked example 039 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 939 | planned | Documentation: worked example 040 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 940 | planned | Documentation: worked example 041 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 941 | planned | Documentation: worked example 042 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 942 | planned | Documentation: worked example 043 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 943 | planned | Documentation: worked example 044 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 944 | planned | Documentation: worked example 045 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 945 | planned | Documentation: worked example 046 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 946 | planned | Documentation: worked example 047 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 947 | planned | Documentation: worked example 048 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 948 | planned | Documentation: worked example 049 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 949 | planned | Documentation: worked example 050 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 950 | planned | Documentation: worked example 051 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 951 | planned | Documentation: worked example 052 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 952 | planned | Documentation: worked example 053 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 953 | planned | Documentation: worked example 054 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 954 | planned | Documentation: worked example 055 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 955 | planned | Documentation: worked example 056 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 956 | planned | Documentation: worked example 057 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 957 | planned | Documentation: worked example 058 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 958 | planned | Documentation: worked example 059 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 959 | planned | Documentation: worked example 060 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 960 | planned | Documentation: worked example 061 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 961 | planned | Documentation: worked example 062 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 962 | planned | Documentation: worked example 063 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 963 | planned | Documentation: worked example 064 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 964 | planned | Documentation: worked example 065 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 965 | planned | Documentation: worked example 066 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 966 | planned | Documentation: worked example 067 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 967 | planned | Documentation: worked example 068 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 968 | planned | Documentation: worked example 069 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 969 | planned | Documentation: worked example 070 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 970 | planned | Documentation: worked example 071 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 971 | planned | Documentation: worked example 072 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 972 | planned | Documentation: worked example 073 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 973 | planned | Documentation: worked example 074 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 974 | planned | Documentation: worked example 075 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 975 | planned | Documentation: worked example 076 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 976 | planned | Documentation: worked example 077 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 977 | planned | Documentation: worked example 078 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 978 | planned | Documentation: worked example 079 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 979 | planned | Documentation: worked example 080 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 980 | planned | Documentation: worked example 081 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 981 | planned | Documentation: worked example 082 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 982 | planned | Documentation: worked example 083 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 983 | planned | Documentation: worked example 084 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 984 | planned | Documentation: worked example 085 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 985 | planned | Documentation: worked example 086 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 986 | planned | Documentation: worked example 087 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 987 | planned | Documentation: worked example 088 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 988 | planned | Documentation: worked example 089 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 989 | planned | Documentation: worked example 090 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 990 | planned | Documentation: worked example 091 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 991 | planned | Documentation: worked example 092 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 992 | planned | Documentation: worked example 093 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 993 | planned | Documentation: worked example 094 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 994 | planned | Documentation: worked example 095 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 995 | planned | Documentation: worked example 096 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 996 | planned | Documentation: worked example 097 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 997 | planned | Documentation: worked example 098 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 998 | planned | Documentation: worked example 099 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 999 | planned | Documentation: worked example 100 of a scoped lab workflow, with a screenshot slot and an evidence template |
| 1000 | planned | Documentation: worked example 101 of a scoped lab workflow, with a screenshot slot and an evidence template |

## Revision

This catalog landed with the professional design-system and categorized-menu work. The v9 chrome polish pass added brand tokens, a pill omnibox, Proton tab contrast, and assistant/empty-state refinements.

