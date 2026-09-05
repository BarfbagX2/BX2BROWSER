'use strict';

const { Menu, MenuItem, clipboard, shell } = require('electron');
const { buildSearchUrl } = require('./NavigationController');

/**
 * Builds and shows the right-click context menu for a tab's web content.
 *
 * This lives entirely in the main process and needs no preload script or
 * privileged IPC channel: Electron already delivers everything a context
 * menu needs (link/image/selection info) via the `context-menu` event on
 * the tab's own `webContents`, and the resulting actions
 * (back/forward/reload/copy/paste/save) are just ordinary `webContents` and
 * `clipboard` calls. Only "open in a new tab" needs to reach back out to the
 * browser, since an individual tab has no concept of other tabs.
 */
class ContextMenuBuilder {
  /**
   * @param {object} deps
   * @param {(url: string) => void} deps.onOpenUrlInNewTab
   * @param {() => string} deps.getDefaultSearchEngineId
   */
  constructor({ onOpenUrlInNewTab, getDefaultSearchEngineId }) {
    this._onOpenUrlInNewTab = onOpenUrlInNewTab;
    this._getDefaultSearchEngineId = getDefaultSearchEngineId;
  }

  /** Call once per tab webContents, right after it's created. */
  attach(webContents) {
    webContents.on('context-menu', (_event, params) => {
      this._show(webContents, params);
    });
  }

  _show(webContents, params) {
    const menu = new Menu();
    const add = (opts) => menu.append(new MenuItem(opts));

    if (params.linkURL) {
      add({ label: 'Open Link in New Tab', click: () => this._onOpenUrlInNewTab(params.linkURL) });
      add({ label: 'Copy Link Address', click: () => clipboard.writeText(params.linkURL) });
      add({ type: 'separator' });
    }

    if (params.hasImageContents && params.srcURL) {
      add({ label: 'Open Image in New Tab', click: () => this._onOpenUrlInNewTab(params.srcURL) });
      add({
        label: 'Save Image As\u2026',
        click: () => webContents.downloadURL(params.srcURL)
      });
      add({ label: 'Copy Image', click: () => webContents.copyImageAt(params.x, params.y) });
      add({ type: 'separator' });
    }

    if (params.isEditable) {
      add({ label: 'Cut', role: 'cut', enabled: params.editFlags.canCut });
      add({ label: 'Copy', role: 'copy', enabled: params.editFlags.canCopy });
      add({ label: 'Paste', role: 'paste', enabled: params.editFlags.canPaste });
      add({ label: 'Select All', role: 'selectAll' });
      add({ type: 'separator' });
    } else if (params.selectionText && params.selectionText.trim()) {
      const selection = params.selectionText.trim();
      const shortLabel = selection.length > 32 ? `${selection.slice(0, 32)}\u2026` : selection;
      add({ label: 'Copy', role: 'copy' });
      add({
        label: `Search for "${shortLabel}"`,
        click: () => this._onOpenUrlInNewTab(buildSearchUrl(selection, this._getDefaultSearchEngineId()))
      });
      add({ type: 'separator' });
    }

    if (!params.linkURL && !params.hasImageContents && !params.isEditable) {
      const { navigationHistory } = webContents;
      add({ label: 'Back', enabled: navigationHistory.canGoBack(), click: () => navigationHistory.goBack() });
      add({
        label: 'Forward',
        enabled: navigationHistory.canGoForward(),
        click: () => navigationHistory.goForward()
      });
      add({ label: 'Reload', click: () => webContents.reload() });
      add({ type: 'separator' });
      add({
        label: 'Save Page As\u2026',
        click: async () => {
          const { dialog } = require('electron');
          const win = require('electron').BrowserWindow.fromWebContents(webContents);
          const { canceled, filePath } = await dialog.showSaveDialog(win, {
            defaultPath: (params.pageTitle || 'page').replace(/[\\/:*?"<>|]/g, '_'),
            filters: [{ name: 'Web Page, HTML Only', extensions: ['html'] }]
          });
          if (!canceled && filePath) {
            webContents.savePage(filePath, 'HTMLOnly').catch((err) => {
              console.error('[ContextMenuBuilder] savePage failed:', err);
            });
          }
        }
      });
      add({ type: 'separator' });
    }

    add({
      label: 'Inspect Element',
      click: () => webContents.inspectElement(Math.round(params.x), Math.round(params.y))
    });

    menu.popup();
  }
}

module.exports = { ContextMenuBuilder, shell };
