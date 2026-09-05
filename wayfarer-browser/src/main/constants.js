'use strict';

/**
 * Central, single-source-of-truth constants for the main process.
 *
 * IMPORTANT: the IPC channel name strings in `IPC` are duplicated as literals
 * inside `src/preload/chrome-preload.js`. That is not an oversight: Electron
 * sandboxes preload scripts with a polyfilled `require()` that cannot load
 * arbitrary local files (only a small allowlist of built-ins), so the preload
 * script cannot `require()` this file. If you rename a channel here, rename
 * it in the preload script too.
 */

// Persistent (on-disk) session partition used by every ordinary browser tab.
// Using a named partition (rather than the default session) keeps the
// browser's cookies/cache/storage in a clearly-scoped bucket that "Clear
// browsing data" can target explicitly, and leaves room to add a private
// ("incognito") mode later using a second, non-persistent partition.
const SESSION_PARTITION = 'persist:wayfarer-browsing';

// Sentinel value stored as a tab's `url` while it is showing the built-in
// New Tab page. It is never passed to `webContents.loadURL` - the New Tab
// UI is rendered by the trusted chrome window itself, not by a webpage.
const NEW_TAB_URL = 'wayfarer://new-tab';

const DEFAULT_WINDOW_SIZE = { width: 1280, height: 800, minWidth: 760, minHeight: 480 };

// Height reserved for the tab strip + navigation bar before the chrome
// renderer has told us its real measured height. The renderer measures its
// own toolbar with a ResizeObserver and reports the true value on load, so
// this is only used for the very first paint.
const DEFAULT_TOOLBAR_HEIGHT = 84;

const SEARCH_ENGINES = {
  google: { id: 'google', name: 'Google', searchUrl: 'https://www.google.com/search?q={searchTerms}' },
  duckduckgo: { id: 'duckduckgo', name: 'DuckDuckGo', searchUrl: 'https://duckduckgo.com/?q={searchTerms}' },
  bing: { id: 'bing', name: 'Bing', searchUrl: 'https://www.bing.com/search?q={searchTerms}' },
  ecosia: { id: 'ecosia', name: 'Ecosia', searchUrl: 'https://www.ecosia.org/search?q={searchTerms}' }
};

const DEFAULT_SETTINGS = {
  homepage: NEW_TAB_URL,
  searchEngine: 'google',
  // 'newtab' | 'homepage' | 'restore'
  startupBehavior: 'newtab',
  // null means "use Electron's default Downloads directory"
  downloadDirectory: null,
  // 'light' | 'dark' | 'system'
  theme: 'system',
  javascriptEnabled: true,
  hardwareAcceleration: true,
  doNotTrack: false,
  blockThirdPartyCookies: false
};

// Renderer <-> main IPC channel names, grouped by domain.
const IPC = {
  APP_GET_VERSION: 'app:get-version',
  APP_RELAUNCH: 'app:relaunch',

  UI_SET_OVERLAY_OPEN: 'ui:set-overlay-open',
  UI_TOOLBAR_HEIGHT_CHANGED: 'ui:toolbar-height-changed',
  // main -> renderer (push): asks the chrome UI to open a given panel, e.g. from a menu accelerator
  UI_OPEN_PANEL: 'ui:open-panel',

  TABS_GET_ALL: 'tabs:get-all',
  TABS_CREATE: 'tabs:create',
  TABS_CLOSE: 'tabs:close',
  TABS_ACTIVATE: 'tabs:activate',
  TABS_NAVIGATE: 'tabs:navigate',
  TABS_GO_HOME: 'tabs:go-home',
  TABS_GO_BACK: 'tabs:go-back',
  TABS_GO_FORWARD: 'tabs:go-forward',
  TABS_RELOAD: 'tabs:reload',
  TABS_STOP: 'tabs:stop',
  TABS_RELOAD_ALL: 'tabs:reload-all',
  TABS_RECOVER_CRASHED: 'tabs:recover-crashed',
  // main -> renderer (push)
  TABS_ON_UPDATED: 'tabs:on-updated',
  TABS_ON_CREATED: 'tabs:on-created',
  TABS_ON_REMOVED: 'tabs:on-removed',
  TABS_ON_ACTIVATED: 'tabs:on-activated',

  HISTORY_GET_ALL: 'history:get-all',
  HISTORY_GET_TOP_VISITED: 'history:get-top-visited',
  HISTORY_DELETE_ENTRY: 'history:delete-entry',
  HISTORY_CLEAR_RANGE: 'history:clear-range',

  BOOKMARKS_GET_TREE: 'bookmarks:get-tree',
  BOOKMARKS_ADD: 'bookmarks:add',
  BOOKMARKS_REMOVE: 'bookmarks:remove',
  BOOKMARKS_UPDATE: 'bookmarks:update',
  BOOKMARKS_CREATE_FOLDER: 'bookmarks:create-folder',
  BOOKMARKS_IS_BOOKMARKED: 'bookmarks:is-bookmarked',
  // main -> renderer (push)
  BOOKMARKS_ON_CHANGED: 'bookmarks:on-changed',

  DOWNLOADS_GET_ALL: 'downloads:get-all',
  DOWNLOADS_PAUSE: 'downloads:pause',
  DOWNLOADS_RESUME: 'downloads:resume',
  DOWNLOADS_CANCEL: 'downloads:cancel',
  DOWNLOADS_OPEN_FILE: 'downloads:open-file',
  DOWNLOADS_SHOW_IN_FOLDER: 'downloads:show-in-folder',
  DOWNLOADS_CLEAR_COMPLETED: 'downloads:clear-completed',
  DOWNLOADS_OPEN_DOWNLOADS_FOLDER: 'downloads:open-downloads-folder',
  // main -> renderer (push)
  DOWNLOADS_ON_UPDATED: 'downloads:on-updated',
  DOWNLOADS_ON_CREATED: 'downloads:on-created',

  SETTINGS_GET_ALL: 'settings:get-all',
  SETTINGS_SET: 'settings:set',
  SETTINGS_CHOOSE_DOWNLOAD_DIR: 'settings:choose-download-dir',
  SETTINGS_CLEAR_BROWSING_DATA: 'settings:clear-browsing-data',
  // main -> renderer (push)
  SETTINGS_ON_CHANGED: 'settings:on-changed'
};

module.exports = {
  SESSION_PARTITION,
  NEW_TAB_URL,
  DEFAULT_WINDOW_SIZE,
  DEFAULT_TOOLBAR_HEIGHT,
  SEARCH_ENGINES,
  DEFAULT_SETTINGS,
  IPC
};
