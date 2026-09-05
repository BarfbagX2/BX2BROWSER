'use strict';

import { getState, setState, subscribe, getActiveTab } from './state.js';
import { setThemeSetting } from './theme.js';
import { initTabStrip } from './tabstrip.js';
import { initToolbar, focusAddressBar } from './toolbar.js';
import { initNewTab, refreshNewTabShortcuts } from './newtab.js';
import { initPanelController, openPanel } from './panel-controller.js';
import { initHistoryPanel } from './panel-history.js';
import { initBookmarksPanel } from './panel-bookmarks.js';
import { initDownloadsPanel } from './panel-downloads.js';
import { initSettingsPanel } from './panel-settings.js';

const api = window.browserAPI;

function upsertTab(tab) {
  const tabs = getState().tabs.slice();
  const index = tabs.findIndex((t) => t.id === tab.id);
  if (index === -1) tabs.push(tab);
  else tabs[index] = tab;
  setState({ tabs });
}

function removeTabFromState(tabId) {
  setState({ tabs: getState().tabs.filter((t) => t.id !== tabId) });
}

function upsertDownload(record) {
  const downloads = getState().downloads.slice();
  const index = downloads.findIndex((d) => d.id === record.id);
  if (index === -1) downloads.unshift(record);
  else downloads[index] = record;
  setState({ downloads });
}

// -- which "no real page" overlay (New Tab / crashed) belongs to the active tab --

const newtabOverlay = document.getElementById('newtab-overlay');
const crashedOverlay = document.getElementById('crashed-overlay');

function renderActiveTabOverlay() {
  if (getState().panel.open) {
    newtabOverlay.hidden = true;
    crashedOverlay.hidden = true;
    return;
  }
  const tab = getActiveTab();
  const showNewTab = tab?.status === 'newtab';
  const showCrashed = tab?.status === 'crashed';
  newtabOverlay.hidden = !showNewTab;
  crashedOverlay.hidden = !showCrashed;
  if (showNewTab) refreshNewTabShortcuts();
}

function initCrashedOverlay() {
  document.getElementById('crashed-reload-button').addEventListener('click', () => {
    const id = getState().activeTabId;
    if (id) api.tabs.recoverCrashed(id);
  });
}

// -- "..." menu dropdown --

function initMenuDropdown() {
  const menuButton = document.getElementById('menu-button');
  const dropdown = document.getElementById('menu-dropdown');

  const close = () => {
    dropdown.hidden = true;
  };

  menuButton.addEventListener('click', (event) => {
    event.stopPropagation();
    dropdown.hidden = !dropdown.hidden;
  });

  document.addEventListener('click', (event) => {
    if (!dropdown.hidden && !dropdown.contains(event.target)) close();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !dropdown.hidden) close();
  });

  dropdown.addEventListener('click', (event) => {
    const item = event.target.closest('.dropdown-item');
    if (!item) return;
    close();
    switch (item.dataset.action) {
      case 'new-tab':
        api.tabs.create({ activate: true });
        break;
      case 'open-history':
        openPanel('history');
        break;
      case 'open-bookmarks':
        openPanel('bookmarks');
        break;
      case 'open-downloads':
        openPanel('downloads');
        break;
      case 'open-settings':
        openPanel('settings');
        break;
      case 'reload-all-tabs':
        api.tabs.reloadAll();
        break;
      default:
        break;
    }
  });
}

// -- tell main how tall the toolbar really is, so it can size tab content to fit exactly below it --

function initToolbarHeightReporting() {
  const toolbar = document.getElementById('toolbar-container');
  const report = () => api.ui.reportToolbarHeight(Math.round(toolbar.getBoundingClientRect().height));
  new ResizeObserver(report).observe(toolbar);
}

// -- the one renderer-level shortcut not already covered by the native app menu --

function initGlobalKeyboardShortcuts() {
  window.addEventListener('keydown', (event) => {
    const isMod = event.metaKey || event.ctrlKey;
    if (isMod && event.key.toLowerCase() === 'l') {
      event.preventDefault();
      focusAddressBar();
    }
  });
}

async function bootstrap() {
  initTabStrip();
  initToolbar();
  initNewTab();
  initPanelController();
  initHistoryPanel();
  initBookmarksPanel();
  initDownloadsPanel();
  initSettingsPanel();
  initMenuDropdown();
  initCrashedOverlay();
  initGlobalKeyboardShortcuts();
  initToolbarHeightReporting();

  subscribe(renderActiveTabOverlay);

  api.tabs.onCreated(upsertTab);
  api.tabs.onUpdated(upsertTab);
  api.tabs.onRemoved(removeTabFromState);
  api.tabs.onActivated((activeTabId) => setState({ activeTabId }));
  api.bookmarks.onChanged((tree) => setState({ bookmarksTree: tree }));
  api.downloads.onCreated(upsertDownload);
  api.downloads.onUpdated(upsertDownload);
  api.settings.onChanged((settings) => {
    setState({ settings });
    setThemeSetting(settings.theme);
  });
  api.ui.onOpenPanel((panelName) => openPanel(panelName));

  const [{ tabs, activeTabId }, settings, bookmarksTree, downloads] = await Promise.all([
    api.tabs.getAll(),
    api.settings.getAll(),
    api.bookmarks.getTree(),
    api.downloads.getAll()
  ]);

  setThemeSetting(settings.theme);
  setState({ tabs, activeTabId, settings, bookmarksTree, downloads });
}

bootstrap().catch((err) => {
  console.error('[wayfarer] Failed to start the browser UI:', err);
});
