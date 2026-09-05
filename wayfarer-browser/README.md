# Wayfarer

A fully standalone desktop web browser. Wayfarer is not a wrapper around your
system's default browser and does not depend on it: it embeds Chromium
directly (via Electron), keeps its own cookies/cache/history/bookmarks in
its own profile directory, and handles ordinary navigation, downloads, and
authentication entirely inside its own window.

## Features

- Tabs (create, close, switch, middle-click close, Ctrl+T / Ctrl+W / Ctrl+Tab / Ctrl+Shift+Tab)
- An address bar that tells URLs, bare domains, and search queries apart
- Back / forward / reload / stop / home, with a real loading indicator
- History, with search and per-entry or full clearing
- Bookmarks, with folders
- A download manager (progress, pause/resume where Chromium supports it, cancel, show in folder)
- Settings: homepage, default search engine, startup behavior, download location,
  light/dark/system theme, JavaScript on/off, hardware acceleration on/off,
  Do Not Track, best-effort third-party cookie blocking, and "Clear browsing data"
- A permission prompt for camera/microphone/location/notifications
- Graceful handling of failed navigations and crashed tabs
- External (non-http/https) links prompt before leaving the app, instead of opening silently

## Requirements

- Node.js 18 or newer
- npm

## Install

```sh
npm install
```

This downloads a prebuilt Electron binary as part of installing
`electron`, which is by far the largest part of the install.

## Run (development)

```sh
npm start
```

## Build distributable installers

```sh
npm run dist:linux   # AppImage + .deb
npm run dist:mac      # .dmg + .zip - must be run on macOS
npm run dist:win       # NSIS installer + portable .exe - must be run on Windows (or with Wine on Linux/macOS)
```

Output lands in `release/`. Code signing and auto-update are not configured
here - `electron-builder`'s config in `package.json` covers unsigned local
builds; see [electron-builder's docs](https://www.electron.build/) for
signing certificates if you plan to distribute Wayfarer publicly.

## Project structure

```
wayfarer-browser/
├── package.json                  # dependencies + electron-builder config
├── build/                        # app icon (generated; see generate_icon*.py)
├── src/
│   ├── main/                     # Node/Electron main process (full system access)
│   │   ├── index.js              # entry point: app lifecycle, wiring, privacy hooks
│   │   ├── constants.js          # IPC channel names, defaults, search engines
│   │   ├── windows/AppWindow.js  # the native window + its TabManager + layout math
│   │   ├── browser/
│   │   │   ├── Tab.js                  # per-tab state
│   │   │   ├── TabManager.js           # tab lifecycle, WebContentsView, navigation events
│   │   │   ├── NavigationController.js # address-bar input -> URL or search heuristics
│   │   │   └── ContextMenuBuilder.js   # right-click menu for page content
│   │   ├── downloads/DownloadManager.js
│   │   ├── data/
│   │   │   ├── JsonStore.js        # generic atomic-write JSON persistence
│   │   │   ├── HistoryManager.js
│   │   │   ├── BookmarkManager.js
│   │   │   └── SettingsManager.js
│   │   ├── menu/AppMenu.js       # native application menu + accelerators
│   │   └── ipc/registerIpcHandlers.js
│   ├── preload/chrome-preload.js # the only preload script in the app (see Security below)
│   └── renderer/chrome/          # the toolbar/tab-strip UI (its own small SPA)
│       ├── index.html
│       ├── styles/                 # base.css, toolbar.css, tabstrip.css, panels.css
│       └── scripts/
│           ├── app.js                # bootstrap + wiring
│           ├── state.js              # tiny central store + pub/sub
│           ├── theme.js
│           ├── tabstrip.js / toolbar.js / newtab.js
│           └── panel-controller.js + panel-history/bookmarks/downloads/settings.js
└── scripts/verify-install.js     # best-effort postinstall sanity check
```

## Architecture, in short

**Chromium engine, via Electron.** Electron was chosen over CEF, WebView2, and
Qt WebEngine because it's the only one of the four that's genuinely
cross-platform from a single codebase, needs no native/C++ toolchain to build
(WebView2 is Windows-only; CEF and Qt WebEngine both mean a C++ embedder app),
and its JS/HTML/CSS surface let this whole browser - including its own
toolbar UI - be written and reasoned about in one language.

**One native window, many `WebContentsView`s.** The native `BrowserWindow`'s
own web contents *is* the toolbar/tab-strip chrome (a small local HTML/CSS/JS
app in `src/renderer/chrome/`). Each browser tab is a separate
`WebContentsView` (Electron's current API - it replaced the now-deprecated
`BrowserView`) that `TabManager` creates, positions below the toolbar, and
shows or hides by toggling which one is visible. Only the active tab's view
is ever visible, so switching tabs is instant and background tabs keep
running, same as a real browser.

**Only the chrome has any privilege.** The toolbar/tab-strip window has a
`preload.js` exposing a narrow `window.browserAPI` via `contextBridge`. Every
ordinary tab is created with **no preload at all** and
`contextIsolation: true` / `nodeIntegration: false` / `sandbox: true` - a
website you navigate to has exactly as much access to your system as it
would in any other Chromium-based browser: none. History, Bookmarks,
Downloads, and Settings are rendered as overlay panels *inside* the trusted
chrome window rather than as navigable tabs, specifically so that trust
boundary never has to be crossed.

**Own profile, isolated by construction.** Electron gives every app its own
`userData` directory keyed by app name - already a different location than
Chrome's or Edge's own profile, no special-casing required. Tabs use a named
persistent session partition (`persist:wayfarer-browsing`) rather than
Electron's default session, so "Clear browsing data" has an explicit,
narrow target.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| Ctrl/Cmd+T | New tab |
| Ctrl/Cmd+W | Close tab |
| Ctrl+Tab / Ctrl+Shift+Tab | Next / previous tab |
| Ctrl/Cmd+L | Focus the address bar |
| Ctrl/Cmd+R | Reload |
| Ctrl/Cmd+Shift+R | Reload, ignoring cache |
| Ctrl/Cmd+D | Bookmark this page |
| Ctrl/Cmd+Y | History |
| Ctrl/Cmd+, | Settings |
| Alt+Left / Alt+Right (Cmd+[ / Cmd+] on mac) | Back / forward |

## Security notes

- `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`
  everywhere, including the trusted chrome window.
- Tabs get no preload script and therefore no `browserAPI` at all - see
  "Only the chrome has any privilege" above.
- `target=_blank`/`window.open()` is always denied at the Electron level and
  redirected into a new in-app tab, so a page can never spawn a bare, unmanaged
  native window.
- Non-http(s) links (mailto:, tel:, custom app URI schemes, etc.) prompt for
  confirmation before `shell.openExternal` is used, rather than opening silently.
- A Content-Security-Policy is set on the chrome UI's own HTML.

## Scope decisions worth knowing about

A handful of things were deliberately left out to keep this a focused,
honestly-finished implementation rather than a half-built everything:

- **One window at a time.** There's no "New Window" - closing the window quits
  the app on Windows/Linux and parks it in the Dock on mac, like a simple
  utility rather than a multi-window browser. `TabManager` is already fully
  self-contained per window, so this isn't a structural dead end if you want
  to add it later.
- **No tab drag-to-reorder**, no extensions support, no find-in-page, no
  private/incognito mode - though the session-partition design in
  `TabManager`/`DownloadManager` would make an in-memory-only partition for
  private tabs a small addition, not a rearchitecture.
- **Permissions (camera/mic/location/notifications) are asked every time**,
  not remembered per-site - a real per-site permission store is a bigger
  feature than this scope called for.
- **Third-party cookie blocking is a `webRequest`-based best-effort filter**,
  not full Chromium Privacy Sandbox behavior.
- **No code signing or auto-update** - `electron-builder` is configured for
  local, unsigned builds only.

## License

MIT - see `package.json`. Replace the placeholder author field and the
generated `build/icon.*` files with your own before shipping this anywhere.
