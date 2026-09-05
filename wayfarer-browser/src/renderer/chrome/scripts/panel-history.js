'use strict';

import { getState } from './state.js';
import { onPanelShown, closePanel } from './panel-controller.js';
import { DEFAULT_FAVICON_ICON, TRASH_ICON } from './icons.js';

const listEl = document.getElementById('history-list');
const searchInput = document.getElementById('history-search-input');
const clearAllBtn = document.getElementById('history-clear-all-button');

let searchDebounceTimer = null;

function dayLabel(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays > 1 && diffDays < 7) return date.toLocaleDateString(undefined, { weekday: 'long' });
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

function timeLabel(timestamp) {
  return new Date(timestamp).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function buildEntryRow(entry) {
  const row = document.createElement('div');
  row.className = 'entry-row';

  const icon = document.createElement('span');
  icon.className = 'entry-icon';
  if (entry.favicon) {
    const img = document.createElement('img');
    img.src = entry.favicon;
    img.alt = '';
    img.onerror = () => {
      icon.innerHTML = DEFAULT_FAVICON_ICON;
    };
    icon.appendChild(img);
  } else {
    icon.innerHTML = DEFAULT_FAVICON_ICON;
  }

  const main = document.createElement('div');
  main.className = 'entry-main';
  const title = document.createElement('span');
  title.className = 'entry-title';
  title.textContent = entry.title;
  const meta = document.createElement('span');
  meta.className = 'entry-meta';
  meta.textContent = entry.url;
  main.append(title, meta);

  const time = document.createElement('span');
  time.className = 'entry-row-time';
  time.textContent = timeLabel(entry.visitedAt);

  const actions = document.createElement('span');
  actions.className = 'entry-row-actions';
  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'icon-button';
  deleteBtn.title = 'Remove from history';
  deleteBtn.setAttribute('aria-label', 'Remove from history');
  deleteBtn.innerHTML = TRASH_ICON;
  deleteBtn.addEventListener('click', async (event) => {
    event.stopPropagation();
    await window.browserAPI.history.deleteEntry(entry.id);
    refresh();
  });
  actions.appendChild(deleteBtn);

  row.append(icon, main, time, actions);
  row.addEventListener('click', () => {
    window.browserAPI.tabs.navigate(getState().activeTabId, entry.url);
    closePanel();
  });
  return row;
}

async function refresh() {
  const searchText = searchInput.value.trim();
  const { entries } = await window.browserAPI.history.getAll({ searchText });
  listEl.innerHTML = '';

  if (entries.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = searchText ? 'No matching history.' : 'No browsing history yet.';
    listEl.appendChild(empty);
    return;
  }

  let currentLabel = null;
  for (const entry of entries) {
    const label = dayLabel(entry.visitedAt);
    if (label !== currentLabel) {
      currentLabel = label;
      const heading = document.createElement('div');
      heading.className = 'day-heading';
      heading.textContent = label;
      listEl.appendChild(heading);
    }
    listEl.appendChild(buildEntryRow(entry));
  }
}

export function initHistoryPanel() {
  searchInput.addEventListener('input', () => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(refresh, 200);
  });

  clearAllBtn.addEventListener('click', async () => {
    if (!window.confirm("Clear all browsing history? This can't be undone.")) return;
    await window.browserAPI.history.clearRange();
    refresh();
  });

  onPanelShown('history', refresh);
}
