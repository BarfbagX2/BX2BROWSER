'use strict';

const { app, Menu, dialog } = require('electron');
const { IPC } = require('../constants');

/**
 * Builds the native application menu. All of the interesting logic already
 * lives on `TabManager`/`BookmarkManager` - this file's job is purely to
 * map platform-appropriate menu items and keyboard accelerators onto calls
 * to that existing API, so there is exactly one place tab/bookmark behavior
 * is implemented.
 *
 * @param {object} deps
 * @param {() => import('../windows/AppWindow').AppWindow | undefined} deps.getAppWindow
 * @param {import('../data/BookmarkManager').BookmarkManager} deps.bookmarkManager
 */
function buildApplicationMenu({ getAppWindow, bookmarkManager }) {
  const isMac = process.platform === 'darwin';

  const withActiveTab = (fn) => {
    const appWindow = getAppWindow();
    const id = appWindow?.tabManager.getActiveTabId();
    if (appWindow && id) fn(appWindow, id);
  };

  const sendOpenPanel = (panel) => {
    getAppWindow()?.win.webContents.send(IPC.UI_OPEN_PANEL, panel);
  };

  const template = [];

  if (isMac) {
    template.push({
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: 'Settings\u2026', accelerator: 'Command+,', click: () => sendOpenPanel('settings') },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    });
  }

  template.push({
    label: 'File',
    submenu: [
      {
        label: 'New Tab',
        accelerator: 'CommandOrControl+T',
        click: () => getAppWindow()?.tabManager.createTab({ activate: true })
      },
      {
        label: 'Close Tab',
        accelerator: 'CommandOrControl+W',
        click: () => withActiveTab((w, id) => w.tabManager.closeTab(id))
      },
      // On every platform this closes the *window*; on mac that leaves the
      // app running in the Dock (see the activate handler in main/index.js)
      // rather than quitting, matching normal mac app behavior.
      { role: 'close', label: 'Close Window', accelerator: 'CommandOrControl+Shift+W' },
      { type: 'separator' },
      ...(isMac ? [] : [{ label: 'Settings\u2026', accelerator: 'Control+,', click: () => sendOpenPanel('settings') }]),
      ...(isMac ? [] : [{ type: 'separator' }, { role: 'quit' }])
    ]
  });

  template.push({ role: 'editMenu' });

  template.push({
    label: 'View',
    submenu: [
      {
        label: 'Reload',
        accelerator: 'CommandOrControl+R',
        click: () => withActiveTab((w, id) => w.tabManager.reload(id))
      },
      {
        label: 'Force Reload',
        accelerator: 'CommandOrControl+Shift+R',
        click: () => withActiveTab((w, id) => w.tabManager.reloadIgnoringCache(id))
      },
      { type: 'separator' },
      {
        label: 'Toggle Page DevTools',
        accelerator: 'CommandOrControl+Alt+I',
        click: () => withActiveTab((w, id) => w.tabManager.toggleDevTools(id))
      },
      {
        label: 'Toggle Browser UI DevTools',
        click: () => getAppWindow()?.win.webContents.toggleDevTools()
      },
      { type: 'separator' },
      {
        label: 'Zoom In',
        accelerator: 'CommandOrControl+Plus',
        click: () => withActiveTab((w, id) => w.tabManager.zoomIn(id))
      },
      {
        label: 'Zoom Out',
        accelerator: 'CommandOrControl+-',
        click: () => withActiveTab((w, id) => w.tabManager.zoomOut(id))
      },
      {
        label: 'Actual Size',
        accelerator: 'CommandOrControl+0',
        click: () => withActiveTab((w, id) => w.tabManager.zoomReset(id))
      },
      { type: 'separator' },
      { role: 'togglefullscreen' }
    ]
  });

  template.push({
    label: 'Tabs',
    submenu: [
      { label: 'Next Tab', accelerator: 'Control+Tab', click: () => getAppWindow()?.tabManager.activateNextTab() },
      {
        label: 'Previous Tab',
        accelerator: 'Control+Shift+Tab',
        click: () => getAppWindow()?.tabManager.activatePreviousTab()
      }
    ]
  });

  template.push({
    label: 'History',
    submenu: [
      {
        label: 'Back',
        accelerator: isMac ? 'Command+[' : 'Alt+Left',
        click: () => withActiveTab((w, id) => w.tabManager.goBack(id))
      },
      {
        label: 'Forward',
        accelerator: isMac ? 'Command+]' : 'Alt+Right',
        click: () => withActiveTab((w, id) => w.tabManager.goForward(id))
      },
      { type: 'separator' },
      { label: 'Show Full History', accelerator: 'CommandOrControl+Y', click: () => sendOpenPanel('history') }
    ]
  });

  template.push({
    label: 'Bookmarks',
    submenu: [
      {
        label: 'Bookmark This Page',
        accelerator: 'CommandOrControl+D',
        click: () =>
          withActiveTab((w, id) => {
            const tab = w.tabManager.getTabJSON(id);
            if (!tab || tab.status !== 'content' || !tab.url) return;
            const existing = bookmarkManager.isBookmarked(tab.url);
            if (existing.bookmarked) bookmarkManager.remove(existing.id);
            else bookmarkManager.add({ url: tab.url, title: tab.title });
          })
      },
      {
        label: 'Show All Bookmarks',
        accelerator: 'CommandOrControl+Shift+O',
        click: () => sendOpenPanel('bookmarks')
      }
    ]
  });

  if (isMac) {
    template.push({ role: 'windowMenu' });
  }

  template.push({
    label: 'Help',
    submenu: [
      {
        label: 'About Wayfarer',
        click: () =>
          dialog.showMessageBox(getAppWindow()?.win, {
            type: 'info',
            title: 'About Wayfarer',
            message: 'Wayfarer',
            detail: `Version ${app.getVersion()}\nElectron ${process.versions.electron}\nChromium ${process.versions.chrome}`
          })
      }
    ]
  });

  return Menu.buildFromTemplate(template);
}

module.exports = { buildApplicationMenu };
