'use strict';

const { app, BrowserWindow, Menu, session, dialog } = require('electron');
const { AppWindow } = require('./windows/AppWindow');
const { SettingsManager } = require('./data/SettingsManager');
const { HistoryManager } = require('./data/HistoryManager');
const { BookmarkManager } = require('./data/BookmarkManager');
const { DownloadManager } = require('./downloads/DownloadManager');
const { registerIpcHandlers, attachTabManagerEventForwarding } = require('./ipc/registerIpcHandlers');
const { buildApplicationMenu } = require('./menu/AppMenu');
const { SESSION_PARTITION } = require('./constants');

// Set explicitly (rather than relying on package.json parsing timing) since
// it determines the per-app userData directory every persisted file below
// lives in - already fully isolated from any other browser's profile,
// Chrome/Edge included, because every Electron app gets its own userData
// path keyed by app name.
app.setName('Wayfarer');

// --- single-instance lock ---
// A browser writing history/bookmarks/settings to shared JSON files is not
// safe to run twice at once against the same profile directory. If another
// copy is already running, hand off to it and quit instead.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  let appWindow = null;

  app.on('second-instance', () => {
    if (appWindow) {
      if (appWindow.win.isMinimized()) appWindow.win.restore();
      appWindow.win.focus();
    }
  });

  // Settings must exist before app is ready, because whether hardware
  // acceleration is enabled has to be decided before any window (or even
  // the GPU process) is created - it cannot be changed at runtime.
  const settingsManager = new SettingsManager();
  if (settingsManager.get('hardwareAcceleration') === false) {
    app.disableHardwareAcceleration();
  }

  app.whenReady().then(() => {
    const historyManager = new HistoryManager();
    const bookmarkManager = new BookmarkManager();
    const browsingSession = session.fromPartition(SESSION_PARTITION);
    const downloadManager = new DownloadManager(browsingSession, () => settingsManager.getAll());

    setupPrivacyHooks(browsingSession, settingsManager, () => appWindow);

    function createAppWindow() {
      appWindow = new AppWindow(settingsManager, historyManager);
      attachTabManagerEventForwarding(appWindow);
      appWindow.openStartupTabs();
      appWindow.win.on('closed', () => {
        appWindow = null;
      });
    }

    createAppWindow();

    registerIpcHandlers({
      getAppWindow: () => appWindow,
      historyManager,
      bookmarkManager,
      downloadManager,
      settingsManager,
      relaunchApp: () => {
        app.relaunch();
        app.exit(0);
      }
    });

    Menu.setApplicationMenu(buildApplicationMenu({ getAppWindow: () => appWindow, bookmarkManager }));

    // Standard mac behavior: clicking the Dock icon after every window has
    // been closed should reopen one, rather than doing nothing.
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createAppWindow();
    });

    app.on('before-quit', () => {
      if (appWindow) appWindow.saveSessionSnapshotSync();
      historyManager.flushSync();
      bookmarkManager.flushSync();
      downloadManager.flushSync();
      settingsManager.flushSync();
    });
  });

  // Standard mac behavior: quit fully on other platforms when the last
  // window closes, but stay running in the Dock on mac until Cmd+Q.
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

/**
 * Wires the privacy-related settings (Do Not Track, third-party cookie
 * blocking) and a simple Allow/Block prompt for sensitive permission
 * requests (camera, microphone, geolocation, notifications) onto the
 * browser's shared persistent session.
 *
 * This is a deliberately lightweight model compared to a full browser's
 * per-site, persistently-remembered permission settings (which would need
 * their own storage and management UI) - every sensitive permission is
 * asked about every time here. That's a reasonable, honestly-documented
 * scope cut rather than a half-built "remember my choice" feature.
 */
function setupPrivacyHooks(browsingSession, settingsManager, getAppWindow) {
  browsingSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const sensitive = ['media', 'geolocation', 'notifications', 'camera', 'microphone'];
    if (!sensitive.includes(permission)) {
      callback(true);
      return;
    }
    const requestingUrl = details.requestingUrl || webContents.getURL();
    dialog
      .showMessageBox(getAppWindow()?.win, {
        type: 'question',
        buttons: ['Allow', 'Block'],
        defaultId: 1,
        cancelId: 1,
        title: 'Permission request',
        message: `Allow this site to use ${permission}?`,
        detail: requestingUrl
      })
      .then(({ response }) => callback(response === 0))
      .catch(() => callback(false));
  });

  browsingSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = { ...details.requestHeaders };
    if (settingsManager.get('doNotTrack')) {
      headers['DNT'] = '1';
    }
    if (settingsManager.get('blockThirdPartyCookies') && isThirdPartyRequest(details)) {
      delete headers['Cookie'];
    }
    callback({ requestHeaders: headers });
  });

  browsingSession.webRequest.onHeadersReceived((details, callback) => {
    if (settingsManager.get('blockThirdPartyCookies') && isThirdPartyRequest(details)) {
      const responseHeaders = { ...details.responseHeaders };
      delete responseHeaders['set-cookie'];
      delete responseHeaders['Set-Cookie'];
      callback({ responseHeaders });
      return;
    }
    callback({});
  });
}

function isThirdPartyRequest(details) {
  try {
    const requestHost = new URL(details.url).hostname;
    // Best-effort: if we can't determine the top-level page (some requests
    // aren't associated with a webContents), fail open rather than risk
    // breaking a legitimate request.
    const topFrameUrl = details.webContents && !details.webContents.isDestroyed() ? details.webContents.getURL() : null;
    if (!topFrameUrl) return false;
    const topHost = new URL(topFrameUrl).hostname;
    if (requestHost === topHost) return false;
    return !requestHost.endsWith(`.${topHost}`) && !topHost.endsWith(`.${requestHost}`);
  } catch {
    return false;
  }
}
