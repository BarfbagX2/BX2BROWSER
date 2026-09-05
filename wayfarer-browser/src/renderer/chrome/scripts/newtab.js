'use strict';

import { getState } from './state.js';
import { DEFAULT_FAVICON_ICON } from './icons.js';

const searchForm = document.getElementById('newtab-search-form');
const searchInput = document.getElementById('newtab-search-input');
const shortcutsEl = document.getElementById('newtab-shortcuts');

function buildShortcutTile(site) {
  const tile = document.createElement('button');
  tile.type = 'button';
  tile.className = 'shortcut-tile';

  const iconWrap = document.createElement('span');
  iconWrap.className = 'shortcut-tile-icon';
  if (site.favicon) {
    const img = document.createElement('img');
    img.src = site.favicon;
    img.alt = '';
    img.onerror = () => {
      iconWrap.innerHTML = DEFAULT_FAVICON_ICON;
    };
    iconWrap.appendChild(img);
  } else {
    iconWrap.innerHTML = DEFAULT_FAVICON_ICON;
  }

  const label = document.createElement('span');
  label.className = 'shortcut-tile-label';
  label.textContent = site.title || site.url;

  tile.append(iconWrap, label);
  tile.title = site.url;
  tile.addEventListener('click', () => {
    window.browserAPI.tabs.navigate(getState().activeTabId, site.url);
  });
  return tile;
}

/** Called every time the New Tab page becomes visible, so the shortcuts stay fresh as history grows. */
export async function refreshNewTabShortcuts() {
  const sites = await window.browserAPI.history.getTopVisited(8);
  shortcutsEl.innerHTML = '';
  for (const site of sites) {
    shortcutsEl.appendChild(buildShortcutTile(site));
  }
}

export function initNewTab() {
  searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = searchInput.value.trim();
    if (!value) return;
    window.browserAPI.tabs.navigate(getState().activeTabId, value);
    searchInput.value = '';
  });
}
