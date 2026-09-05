'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/*
 * This is the ONLY preload script in the app, and it is only ever attached
 * to the trusted chrome window (toolbar, tab strip, and the overlay panels
 * it renders). Every ordinary browser tab is a separate WebContentsView
 * created with no preload at all, so a website a person navigates to never
 * has access to anything exposed here.
 *
 * The channel-name string literals below must match `src/main/constants.js`
 * exactly. They are not `require()`-d from there because Electron's
 * sandboxed preload scripts run with a polyfilled `require()` that only
 * supports a small allowlist of built-ins - local relative-path requires
 * (and even some core modules) are not guaranteed to resolve. Inlining
 * short, stable string literals here is simpler and more robust than
 * fighting that constraint.
 */

/** Subscribes to a main -> renderer push channel; returns an unsubscribe function. */
function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('browserAPI', {
  app: {
    getVersion: () => ipcRenderer.invoke('app:get-version'),
    relaunch: () => ipcRenderer.invoke('app:relaunch')
  },

  ui: {
    setOverlayOpen: (open) => ipcRenderer.invoke('ui:set-overlay-open', open),
    reportToolbarHeight: (px) => ipcRenderer.invoke('ui:toolbar-height-changed', px),
    onOpenPanel: (cb) => subscribe('ui:open-panel', cb)
  },

  tabs: {
    getAll: () => ipcRenderer.invoke('tabs:get-all'),
    create: (options) => ipcRenderer.invoke('tabs:create', options),
    close: (id) => ipcRenderer.invoke('tabs:close', id),
    activate: (id) => ipcRenderer.invoke('tabs:activate', id),
    navigate: (id, input) => ipcRenderer.invoke('tabs:navigate', { id, input }),
    goHome: (id) => ipcRenderer.invoke('tabs:go-home', id),
    goBack: (id) => ipcRenderer.invoke('tabs:go-back', id),
    goForward: (id) => ipcRenderer.invoke('tabs:go-forward', id),
    reload: (id) => ipcRenderer.invoke('tabs:reload', id),
    stop: (id) => ipcRenderer.invoke('tabs:stop', id),
    reloadAll: () => ipcRenderer.invoke('tabs:reload-all'),
    recoverCrashed: (id) => ipcRenderer.invoke('tabs:recover-crashed', id),
    onCreated: (cb) => subscribe('tabs:on-created', cb),
    onUpdated: (cb) => subscribe('tabs:on-updated', cb),
    onRemoved: (cb) => subscribe('tabs:on-removed', cb),
    onActivated: (cb) => subscribe('tabs:on-activated', cb)
  },

  history: {
    getAll: (query) => ipcRenderer.invoke('history:get-all', query),
    getTopVisited: (limit) => ipcRenderer.invoke('history:get-top-visited', limit),
    deleteEntry: (id) => ipcRenderer.invoke('history:delete-entry', id),
    clearRange: (startTs, endTs) => ipcRenderer.invoke('history:clear-range', { startTs, endTs })
  },

  bookmarks: {
    getTree: () => ipcRenderer.invoke('bookmarks:get-tree'),
    add: (payload) => ipcRenderer.invoke('bookmarks:add', payload),
    remove: (id) => ipcRenderer.invoke('bookmarks:remove', id),
    update: (id, patch) => ipcRenderer.invoke('bookmarks:update', { id, patch }),
    createFolder: (payload) => ipcRenderer.invoke('bookmarks:create-folder', payload),
    isBookmarked: (url) => ipcRenderer.invoke('bookmarks:is-bookmarked', url),
    onChanged: (cb) => subscribe('bookmarks:on-changed', cb)
  },

  downloads: {
    getAll: () => ipcRenderer.invoke('downloads:get-all'),
    pause: (id) => ipcRenderer.invoke('downloads:pause', id),
    resume: (id) => ipcRenderer.invoke('downloads:resume', id),
    cancel: (id) => ipcRenderer.invoke('downloads:cancel', id),
    openFile: (id) => ipcRenderer.invoke('downloads:open-file', id),
    showInFolder: (id) => ipcRenderer.invoke('downloads:show-in-folder', id),
    clearCompleted: () => ipcRenderer.invoke('downloads:clear-completed'),
    openDownloadsFolder: () => ipcRenderer.invoke('downloads:open-downloads-folder'),
    onCreated: (cb) => subscribe('downloads:on-created', cb),
    onUpdated: (cb) => subscribe('downloads:on-updated', cb)
  },

  settings: {
    getAll: () => ipcRenderer.invoke('settings:get-all'),
    set: (partial) => ipcRenderer.invoke('settings:set', partial),
    chooseDownloadDir: () => ipcRenderer.invoke('settings:choose-download-dir'),
    clearBrowsingData: (options) => ipcRenderer.invoke('settings:clear-browsing-data', options),
    onChanged: (cb) => subscribe('settings:on-changed', cb)
  }
});
