'use strict';

const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { WebContentsView, dialog, shell } = require('electron');
const { Tab } = require('./Tab');
const { ContextMenuBuilder } = require('./ContextMenuBuilder');
const { resolveAddressBarInput, isWebProtocol } = require('./NavigationController');
const { SESSION_PARTITION, NEW_TAB_URL } = require('../constants');

/**
 * Owns every tab in one browser window: creating and destroying the
 * Chromium `WebContentsView` behind each one, wiring up its navigation
 * events, and deciding which single view (if any) should actually be
 * visible in the content area at any moment.
 *
 * Layout model: every open tab keeps its `WebContentsView` alive and
 * attached for as long as the tab exists (so background tabs keep running,
 * just like a real browser), but only the active tab's view is ever made
 * visible - and even that one is hidden while an overlay (New Tab page,
 * a crashed-tab notice, or a History/Bookmarks/Downloads/Settings panel
 * rendered by the trusted chrome UI) needs to occupy that same screen
 * space. `_applyLayout()` is the single place that decides this.
 */
class TabManager extends EventEmitter {
  /**
   * @param {object} deps
   * @param {import('electron').BrowserWindow} deps.win
   * @param {import('../data/HistoryManager').HistoryManager} deps.historyManager
   * @param {() => object} deps.getSettings
   */
  constructor({ win, historyManager, getSettings }) {
    super();
    this._win = win;
    this._contentView = win.contentView;
    this._historyManager = historyManager;
    this._getSettings = getSettings;

    /** @type {Map<string, Tab>} */
    this._tabs = new Map();
    this._order = [];
    this._activeTabId = null;
    this._overlayOpen = false;
    this._contentRect = { x: 0, y: 0, width: 0, height: 0 };

    this._contextMenuBuilder = new ContextMenuBuilder({
      onOpenUrlInNewTab: (url) => this.createTab({ url, activate: true }),
      getDefaultSearchEngineId: () => this._getSettings().searchEngine
    });
  }

  // --- layout coordination (called by AppWindow) ---

  setContentRect(rect) {
    this._contentRect = rect;
    this._applyLayout();
  }

  setOverlayOpen(open) {
    this._overlayOpen = Boolean(open);
    this._applyLayout();
  }

  // --- queries ---

  getActiveTabId() {
    return this._activeTabId;
  }

  getAllTabsJSON() {
    return this._order.map((id) => this._tabs.get(id).toJSON());
  }

  getTabJSON(id) {
    const tab = this._tabs.get(id);
    return tab ? tab.toJSON() : null;
  }

  // --- tab lifecycle ---

  createTab({ url, activate = true } = {}) {
    const id = crypto.randomUUID();
    const tab = new Tab(id);
    this._tabs.set(id, tab);
    this._order.push(id);

    if (url) {
      this._loadUrlInTab(tab, url);
    }

    this.emit('created', tab.toJSON());

    if (activate) {
      this.activateTab(id);
    } else {
      this._applyLayout();
    }
    return id;
  }

  activateTab(id) {
    if (!this._tabs.has(id)) return;
    this._activeTabId = id;
    this._applyLayout();
    this.emit('activated', id);
  }

  closeTab(id) {
    const tab = this._tabs.get(id);
    if (!tab) return;

    this._destroyTabView(tab);
    const index = this._order.indexOf(id);
    if (index !== -1) this._order.splice(index, 1);
    this._tabs.delete(id);
    this.emit('removed', id);

    if (this._activeTabId !== id) {
      this._applyLayout();
      return;
    }

    if (this._order.length === 0) {
      // A browser window with zero tabs is a dead end - open a fresh one
      // instead, same spirit as most browsers' "last tab" handling.
      this.createTab({ activate: true });
      return;
    }
    const neighborIndex = Math.min(index, this._order.length - 1);
    this.activateTab(this._order[neighborIndex]);
  }

  // --- navigation ---

  navigate(id, rawInput) {
    const tab = this._tabs.get(id);
    if (!tab) return;
    const resolved = resolveAddressBarInput(rawInput, this._getSettings().searchEngine);
    if (!resolved) return;
    this._loadUrlInTab(tab, resolved.url);
    this._applyLayout();
    this._emitUpdated(tab);
  }

  goHome(id) {
    const tab = this._tabs.get(id);
    if (!tab) return;
    const { homepage } = this._getSettings();
    if (!homepage || homepage === NEW_TAB_URL) {
      this._setTabToNewTabState(tab);
    } else {
      this._loadUrlInTab(tab, homepage);
    }
    this._applyLayout();
    this._emitUpdated(tab);
  }

  goBack(id) {
    this._tabs.get(id)?.view?.webContents.navigationHistory.goBack();
  }

  goForward(id) {
    this._tabs.get(id)?.view?.webContents.navigationHistory.goForward();
  }

  reload(id) {
    this._tabs.get(id)?.view?.webContents.reload();
  }

  stop(id) {
    this._tabs.get(id)?.view?.webContents.stop();
  }

  reloadIgnoringCache(id) {
    this._tabs.get(id)?.view?.webContents.reloadIgnoringCache();
  }

  toggleDevTools(id) {
    this._tabs.get(id)?.view?.webContents.toggleDevTools();
  }

  zoomIn(id) {
    const wc = this._tabs.get(id)?.view?.webContents;
    if (wc) wc.setZoomLevel(Math.min(wc.getZoomLevel() + 0.5, 9));
  }

  zoomOut(id) {
    const wc = this._tabs.get(id)?.view?.webContents;
    if (wc) wc.setZoomLevel(Math.max(wc.getZoomLevel() - 0.5, -8));
  }

  zoomReset(id) {
    this._tabs.get(id)?.view?.webContents.setZoomLevel(0);
  }

  /** Activates the tab after the current one in tab-strip order, wrapping around. */
  activateNextTab() {
    if (this._order.length < 2) return;
    const index = this._order.indexOf(this._activeTabId);
    this.activateTab(this._order[(index + 1) % this._order.length]);
  }

  /** Activates the tab before the current one in tab-strip order, wrapping around. */
  activatePreviousTab() {
    if (this._order.length < 2) return;
    const index = this._order.indexOf(this._activeTabId);
    this.activateTab(this._order[(index - 1 + this._order.length) % this._order.length]);
  }

  recoverCrashedTab(id) {
    const tab = this._tabs.get(id);
    if (!tab || tab.status !== 'crashed' || !tab.view) return;
    tab.status = 'content';
    tab.lastError = null;
    tab.view.webContents.reload();
    this._emitUpdated(tab);
    this._applyLayout();
  }

  /** Re-creates every content tab's view so a freshly-changed webPreference (e.g. JavaScript on/off) takes effect. */
  reloadAllTabs() {
    for (const tab of this._tabs.values()) {
      if (tab.status !== 'content') continue;
      const lastUrl = tab.view ? tab.view.webContents.getURL() || tab.url : tab.url;
      this._destroyTabView(tab);
      this._loadUrlInTab(tab, lastUrl);
      this._emitUpdated(tab);
    }
    this._applyLayout();
  }

  // --- session persistence (used by AppWindow on quit/startup) ---

  getSessionSnapshot() {
    const tabs = this._order.map((id) => {
      const tab = this._tabs.get(id);
      const url = tab.status === 'content' ? tab.view?.webContents.getURL() || tab.url : null;
      return { url };
    });
    const activeIndex = Math.max(0, this._order.indexOf(this._activeTabId));
    return { tabs, activeIndex };
  }

  restoreSessionSnapshot(snapshot) {
    const tabs = snapshot && Array.isArray(snapshot.tabs) ? snapshot.tabs : [];
    if (tabs.length === 0) {
      this.createTab({ activate: true });
      return;
    }
    const activeIndex = Number.isInteger(snapshot.activeIndex) ? snapshot.activeIndex : tabs.length - 1;
    tabs.forEach((entry, index) => {
      this.createTab({ url: entry.url || undefined, activate: index === activeIndex });
    });
  }

  destroyAll() {
    for (const tab of this._tabs.values()) {
      this._destroyTabView(tab);
    }
    this._tabs.clear();
    this._order = [];
  }

  // --- internals ---

  _applyLayout() {
    const rect = this._contentRect;
    for (const tab of this._tabs.values()) {
      if (!tab.view) continue;
      const shouldShow = !this._overlayOpen && tab.id === this._activeTabId && tab.status === 'content';
      tab.view.setVisible(shouldShow);
      if (shouldShow) {
        tab.view.setBounds(rect);
      }
    }
  }

  _emitUpdated(tab) {
    this.emit('updated', tab.toJSON());
  }

  _loadUrlInTab(tab, url) {
    if (!tab.view) {
      this._createContentView(tab);
    }
    tab.status = 'content';
    tab.lastError = null;
    tab.view.webContents.loadURL(url).catch((err) => {
      // A rejected loadURL() is expected for cancelled/aborted navigations;
      // user-facing failure state is handled by the did-fail-load listener.
      console.warn(`[TabManager] loadURL rejected for ${url}: ${err.message}`);
    });
  }

  _setTabToNewTabState(tab) {
    this._destroyTabView(tab);
    tab.status = 'newtab';
    tab.url = '';
    tab.title = 'New Tab';
    tab.favicon = null;
    tab.isLoading = false;
    tab.canGoBack = false;
    tab.canGoForward = false;
    tab.lastError = null;
  }

  _destroyTabView(tab) {
    if (!tab.view) return;
    tab.view.setVisible(false);
    this._contentView.removeChildView(tab.view);
    // WebContentsView has no destroy() method (electron/electron#42884) -
    // removing it from the view tree and dropping every JS reference to it
    // (including its listeners) is what lets the renderer process behind it
    // be garbage collected.
    tab.view.webContents.removeAllListeners();
    tab.view = null;
  }

  _createContentView(tab) {
    const settings = this._getSettings();
    const view = new WebContentsView({
      webPreferences: {
        partition: SESSION_PARTITION,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        javascript: settings.javascriptEnabled,
        plugins: true, // Chromium's built-in PDF viewer, so direct PDF links just work
        autoplayPolicy: 'user-gesture-required'
      }
    });
    tab.view = view;
    const wc = view.webContents;

    this._contextMenuBuilder.attach(wc);

    wc.on('page-title-updated', (_event, title) => {
      tab.title = title || tab.title;
      this._emitUpdated(tab);
    });

    wc.on('page-favicon-updated', (_event, favicons) => {
      tab.favicon = favicons && favicons.length > 0 ? favicons[0] : null;
      this._emitUpdated(tab);
    });

    wc.on('did-start-loading', () => {
      tab.isLoading = true;
      this._emitUpdated(tab);
    });

    wc.on('did-stop-loading', () => {
      tab.isLoading = false;
      tab.canGoBack = wc.navigationHistory.canGoBack();
      tab.canGoForward = wc.navigationHistory.canGoForward();
      this._emitUpdated(tab);
      if (isWebProtocol(tab.url)) {
        this._historyManager.recordVisit({ url: tab.url, title: tab.title, favicon: tab.favicon });
      }
    });

    wc.on('did-navigate', (_event, url) => {
      tab.url = url;
      this._emitUpdated(tab);
    });

    wc.on('did-navigate-in-page', (_event, url) => {
      tab.url = url;
      tab.canGoBack = wc.navigationHistory.canGoBack();
      tab.canGoForward = wc.navigationHistory.canGoForward();
      this._emitUpdated(tab);
    });

    wc.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (errorCode === -3 || !isMainFrame) return; // ERR_ABORTED is routine (e.g. navigated away mid-load)
      tab.isLoading = false;
      tab.url = validatedURL || tab.url;
      tab.lastError = { errorCode, errorDescription, validatedURL };
      this._emitUpdated(tab);
      // Chromium renders its own built-in offline/DNS-error page for the
      // failed navigation automatically - nothing further to do here.
    });

    wc.on('render-process-gone', (_event, details) => {
      if (details.reason === 'clean-exit') return;
      tab.status = 'crashed';
      tab.isLoading = false;
      this._emitUpdated(tab);
      this._applyLayout();
    });

    // Anything that would otherwise open a new native window (target=_blank,
    // window.open(), Ctrl/Cmd-click) is denied and redirected into a new tab
    // of our own instead, so browsing never leaves the app's own chrome.
    wc.setWindowOpenHandler((details) => {
      this.createTab({ url: details.url, activate: details.disposition !== 'background-tab' });
      return { action: 'deny' };
    });

    wc.on('will-navigate', (event, url) => {
      if (!this._isNavigableInApp(url)) {
        event.preventDefault();
        this._confirmOpenExternal(url);
      }
    });

    this._contentView.addChildView(view);
  }

  _isNavigableInApp(urlString) {
    let protocol;
    try {
      protocol = new URL(urlString).protocol;
    } catch {
      return false;
    }
    return ['http:', 'https:', 'file:', 'blob:', 'data:', 'filesystem:', 'about:'].includes(protocol);
  }

  async _confirmOpenExternal(urlString) {
    const { response } = await dialog.showMessageBox(this._win, {
      type: 'question',
      buttons: ['Open', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
      title: 'Open external application?',
      message: 'This link wants to open outside Wayfarer.',
      detail: urlString
    });
    if (response === 0) {
      shell.openExternal(urlString).catch((err) => {
        console.error('[TabManager] shell.openExternal failed:', err);
      });
    }
  }
}

module.exports = { TabManager };
