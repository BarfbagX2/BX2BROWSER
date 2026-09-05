'use strict';

const path = require('node:path');
const { app, BrowserWindow } = require('electron');
const { TabManager } = require('../browser/TabManager');
const { JsonStore } = require('../data/JsonStore');
const { DEFAULT_WINDOW_SIZE, DEFAULT_TOOLBAR_HEIGHT, NEW_TAB_URL } = require('../constants');

const CHROME_HTML_PATH = path.join(__dirname, '..', '..', 'renderer', 'chrome', 'index.html');
const PRELOAD_PATH = path.join(__dirname, '..', '..', 'preload', 'chrome-preload.js');
const ICON_PATH = path.join(__dirname, '..', '..', '..', 'build', 'icon.png');

/**
 * The browser's single top-level window.
 *
 * This app intentionally supports one window at a time (there is no "New
 * Window" action) rather than the multi-window model of a full desktop
 * browser - that's a deliberate scope decision, not an oversight, and it
 * keeps IPC routing simple since there's never a question of *which*
 * window a renderer message came from. `TabManager` is already fully
 * self-contained per window, so adding real multi-window support later
 * would mean keeping a collection of `AppWindow`s instead of one and
 * routing IPC by sender `WebContents` - it would not require restructuring
 * this class. Normal per-platform window-close behavior (quit on
 * Windows/Linux, stay running in the Dock on mac) is handled in
 * `src/main/index.js`, same as any other Electron app.
 *
 * AppWindow owns: the native window itself, the chrome UI it loads, the
 * `TabManager` for its tabs, and persisting/restoring which tabs were open
 * between launches.
 */
class AppWindow {
  /**
   * @param {import('../data/SettingsManager').SettingsManager} settingsManager
   * @param {import('../data/HistoryManager').HistoryManager} historyManager
   */
  constructor(settingsManager, historyManager) {
    this._settingsManager = settingsManager;
    this._toolbarHeight = DEFAULT_TOOLBAR_HEIGHT;

    this._sessionStore = new JsonStore(path.join(app.getPath('userData'), 'session.json'), {
      tabs: [],
      activeIndex: 0
    });

    this.win = new BrowserWindow({
      width: DEFAULT_WINDOW_SIZE.width,
      height: DEFAULT_WINDOW_SIZE.height,
      minWidth: DEFAULT_WINDOW_SIZE.minWidth,
      minHeight: DEFAULT_WINDOW_SIZE.minHeight,
      show: false,
      backgroundColor: '#16181d',
      icon: ICON_PATH,
      webPreferences: {
        preload: PRELOAD_PATH,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });

    this.tabManager = new TabManager({
      win: this.win,
      historyManager,
      getSettings: () => this._settingsManager.getAll()
    });

    this.win.on('resize', () => this._recomputeContentRect());
    this.win.webContents.on('did-finish-load', () => this._recomputeContentRect());
    this.win.once('ready-to-show', () => this.win.show());

    this.win.loadFile(CHROME_HTML_PATH);
  }

  /** Called by the renderer once it has measured its own toolbar's real height. */
  setToolbarHeight(px) {
    if (typeof px === 'number' && px >= 0 && px !== this._toolbarHeight) {
      this._toolbarHeight = px;
      this._recomputeContentRect();
    }
  }

  /** Called when a chrome-rendered overlay (New Tab page aside, an overlay panel) opens/closes. */
  setOverlayOpen(open) {
    this.tabManager.setOverlayOpen(open);
  }

  _recomputeContentRect() {
    const [width, height] = this.win.getContentSize();
    this.tabManager.setContentRect({
      x: 0,
      y: this._toolbarHeight,
      width,
      height: Math.max(0, height - this._toolbarHeight)
    });
  }

  /** Opens the window's initial tab(s) according to the configured startup behavior. */
  openStartupTabs() {
    const behavior = this._settingsManager.get('startupBehavior');
    const snapshot = this._sessionStore.get();

    if (behavior === 'restore' && snapshot.tabs && snapshot.tabs.length > 0) {
      this.tabManager.restoreSessionSnapshot(snapshot);
      return;
    }

    if (behavior === 'homepage') {
      const homepage = this._settingsManager.get('homepage');
      const url = homepage && homepage !== NEW_TAB_URL ? homepage : undefined;
      this.tabManager.createTab({ url, activate: true });
      return;
    }

    this.tabManager.createTab({ activate: true });
  }

  /** Persists the current set of open tabs so "Continue where you left off" can restore them. Call before quit. */
  saveSessionSnapshotSync() {
    this._sessionStore.set(this.tabManager.getSessionSnapshot());
    this._sessionStore.flushSync();
  }
}

module.exports = { AppWindow };
