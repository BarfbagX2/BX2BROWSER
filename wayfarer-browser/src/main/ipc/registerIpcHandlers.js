'use strict';

const { ipcMain, app, dialog, session } = require('electron');
const { IPC, SESSION_PARTITION } = require('../constants');

/**
 * Wires every renderer <-> main IPC channel used by the chrome UI.
 *
 * Security note: these handlers are reachable only from the trusted chrome
 * window's renderer, because that is the only renderer in the app with a
 * preload script at all - every ordinary browser tab is created with no
 * preload and `nodeIntegration: false`, so a website loaded in a tab has no
 * `ipcRenderer` to call these channels with in the first place. The
 * isolation is structural (tabs simply have no IPC surface), so there is
 * deliberately no separate per-call sender check below.
 *
 * Call this once at startup. It always resolves the *current* window via
 * `getAppWindow()`, so it keeps working correctly if the window is ever
 * recreated (e.g. after `activate` on mac once all windows were closed).
 *
 * @param {object} deps
 * @param {() => import('../windows/AppWindow').AppWindow | undefined} deps.getAppWindow
 * @param {import('../data/HistoryManager').HistoryManager} deps.historyManager
 * @param {import('../data/BookmarkManager').BookmarkManager} deps.bookmarkManager
 * @param {import('../downloads/DownloadManager').DownloadManager} deps.downloadManager
 * @param {import('../data/SettingsManager').SettingsManager} deps.settingsManager
 * @param {() => void} deps.relaunchApp
 */
function registerIpcHandlers({ getAppWindow, historyManager, bookmarkManager, downloadManager, settingsManager, relaunchApp }) {
  const tabs = () => getAppWindow().tabManager;

  const send = (channel, payload) => {
    const win = getAppWindow()?.win;
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  };

  // --- app ---
  ipcMain.handle(IPC.APP_GET_VERSION, () => app.getVersion());
  ipcMain.handle(IPC.APP_RELAUNCH, () => relaunchApp());

  // --- ui / layout coordination ---
  ipcMain.handle(IPC.UI_SET_OVERLAY_OPEN, (_event, open) => getAppWindow()?.setOverlayOpen(Boolean(open)));
  ipcMain.handle(IPC.UI_TOOLBAR_HEIGHT_CHANGED, (_event, px) => getAppWindow()?.setToolbarHeight(px));

  // --- tabs ---
  ipcMain.handle(IPC.TABS_GET_ALL, () => ({
    tabs: tabs().getAllTabsJSON(),
    activeTabId: tabs().getActiveTabId()
  }));
  ipcMain.handle(IPC.TABS_CREATE, (_event, options = {}) => tabs().createTab(options));
  ipcMain.handle(IPC.TABS_CLOSE, (_event, id) => tabs().closeTab(id));
  ipcMain.handle(IPC.TABS_ACTIVATE, (_event, id) => tabs().activateTab(id));
  ipcMain.handle(IPC.TABS_NAVIGATE, (_event, { id, input }) => tabs().navigate(id, input));
  ipcMain.handle(IPC.TABS_GO_HOME, (_event, id) => tabs().goHome(id));
  ipcMain.handle(IPC.TABS_GO_BACK, (_event, id) => tabs().goBack(id));
  ipcMain.handle(IPC.TABS_GO_FORWARD, (_event, id) => tabs().goForward(id));
  ipcMain.handle(IPC.TABS_RELOAD, (_event, id) => tabs().reload(id));
  ipcMain.handle(IPC.TABS_STOP, (_event, id) => tabs().stop(id));
  ipcMain.handle(IPC.TABS_RELOAD_ALL, () => tabs().reloadAllTabs());
  ipcMain.handle(IPC.TABS_RECOVER_CRASHED, (_event, id) => tabs().recoverCrashedTab(id));

  // --- history ---
  ipcMain.handle(IPC.HISTORY_GET_ALL, (_event, query) => historyManager.getAll(query));
  ipcMain.handle(IPC.HISTORY_GET_TOP_VISITED, (_event, limit) => historyManager.getTopVisited(limit));
  ipcMain.handle(IPC.HISTORY_DELETE_ENTRY, (_event, id) => historyManager.deleteEntry(id));
  ipcMain.handle(IPC.HISTORY_CLEAR_RANGE, (_event, { startTs, endTs } = {}) => historyManager.clearRange(startTs, endTs));

  // --- bookmarks ---
  ipcMain.handle(IPC.BOOKMARKS_GET_TREE, () => bookmarkManager.getTree());
  ipcMain.handle(IPC.BOOKMARKS_ADD, (_event, payload) => bookmarkManager.add(payload));
  ipcMain.handle(IPC.BOOKMARKS_REMOVE, (_event, id) => bookmarkManager.remove(id));
  ipcMain.handle(IPC.BOOKMARKS_UPDATE, (_event, { id, patch }) => bookmarkManager.update(id, patch));
  ipcMain.handle(IPC.BOOKMARKS_CREATE_FOLDER, (_event, payload) => bookmarkManager.createFolder(payload));
  ipcMain.handle(IPC.BOOKMARKS_IS_BOOKMARKED, (_event, url) => bookmarkManager.isBookmarked(url));

  // --- downloads ---
  ipcMain.handle(IPC.DOWNLOADS_GET_ALL, () => downloadManager.getAll());
  ipcMain.handle(IPC.DOWNLOADS_PAUSE, (_event, id) => downloadManager.pause(id));
  ipcMain.handle(IPC.DOWNLOADS_RESUME, (_event, id) => downloadManager.resume(id));
  ipcMain.handle(IPC.DOWNLOADS_CANCEL, (_event, id) => downloadManager.cancel(id));
  ipcMain.handle(IPC.DOWNLOADS_OPEN_FILE, (_event, id) => downloadManager.openFile(id));
  ipcMain.handle(IPC.DOWNLOADS_SHOW_IN_FOLDER, (_event, id) => downloadManager.showInFolder(id));
  ipcMain.handle(IPC.DOWNLOADS_CLEAR_COMPLETED, () => downloadManager.clearCompleted());
  ipcMain.handle(IPC.DOWNLOADS_OPEN_DOWNLOADS_FOLDER, () => downloadManager.openDownloadsFolder());

  // --- settings ---
  ipcMain.handle(IPC.SETTINGS_GET_ALL, () => settingsManager.getAll());
  ipcMain.handle(IPC.SETTINGS_SET, (_event, partial) => settingsManager.set(partial));
  ipcMain.handle(IPC.SETTINGS_CHOOSE_DOWNLOAD_DIR, async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(getAppWindow()?.win, {
      properties: ['openDirectory', 'createDirectory']
    });
    if (canceled || filePaths.length === 0) return null;
    return settingsManager.set({ downloadDirectory: filePaths[0] });
  });
  ipcMain.handle(IPC.SETTINGS_CLEAR_BROWSING_DATA, async (_event, options = {}) => {
    if (options.history) {
      historyManager.clearRange(options.rangeStartTs || 0, Date.now());
    }
    const partitionSession = session.fromPartition(SESSION_PARTITION);
    const tasks = [];
    if (options.cookiesAndSiteData) tasks.push(partitionSession.clearStorageData());
    if (options.cachedFiles) tasks.push(partitionSession.clearCache());
    await Promise.all(tasks);
    return { success: true };
  });

  // --- forward app-level (not per-window) manager events to the renderer ---
  bookmarkManager.on('changed', () => send(IPC.BOOKMARKS_ON_CHANGED, bookmarkManager.getTree()));
  settingsManager.on('changed', (settings) => send(IPC.SETTINGS_ON_CHANGED, settings));
  downloadManager.on('created', (record) => send(IPC.DOWNLOADS_ON_CREATED, record));
  downloadManager.on('updated', (record) => send(IPC.DOWNLOADS_ON_UPDATED, record));
}

/**
 * Forwards one window's TabManager events to its own renderer. Unlike the
 * app-level managers above, TabManager is per-window, so this is called
 * separately every time an AppWindow is created (see src/main/index.js).
 *
 * @param {import('../windows/AppWindow').AppWindow} appWindow
 */
function attachTabManagerEventForwarding(appWindow) {
  const send = (channel, payload) => {
    if (!appWindow.win.isDestroyed()) appWindow.win.webContents.send(channel, payload);
  };
  appWindow.tabManager.on('created', (tab) => send(IPC.TABS_ON_CREATED, tab));
  appWindow.tabManager.on('updated', (tab) => send(IPC.TABS_ON_UPDATED, tab));
  appWindow.tabManager.on('removed', (id) => send(IPC.TABS_ON_REMOVED, id));
  appWindow.tabManager.on('activated', (id) => send(IPC.TABS_ON_ACTIVATED, id));
}

module.exports = { registerIpcHandlers, attachTabManagerEventForwarding };
