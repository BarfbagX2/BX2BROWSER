'use strict';

import { getState, setState, subscribe } from './state.js';
import { onPanelShown } from './panel-controller.js';
import { PAUSE_ICON, RESUME_ICON, TRASH_ICON, FOLDER_OPEN_ICON } from './icons.js';

const listEl = document.getElementById('downloads-list');

/** download id -> its row element, so live progress updates patch in place instead of rebuilding the list. */
const rowElements = new Map();

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function stateLabel(record) {
  switch (record.state) {
    case 'progressing':
      return 'Downloading';
    case 'completed':
      return 'Done';
    case 'cancelled':
      return 'Cancelled';
    case 'interrupted':
      return record.canResume ? 'Paused' : 'Failed';
    default:
      return record.state;
  }
}

function buildRow() {
  const row = document.createElement('div');
  row.className = 'entry-row';

  const icon = document.createElement('span');
  icon.className = 'entry-icon';
  icon.innerHTML = FOLDER_OPEN_ICON;

  const main = document.createElement('div');
  main.className = 'entry-main';
  const title = document.createElement('span');
  title.className = 'entry-title';
  const meta = document.createElement('span');
  meta.className = 'entry-meta';
  const track = document.createElement('div');
  track.className = 'download-progress-track';
  const fill = document.createElement('div');
  fill.className = 'download-progress-fill';
  track.appendChild(fill);
  main.append(title, meta, track);

  const stateLabelEl = document.createElement('span');
  stateLabelEl.className = 'download-state-label';

  const actions = document.createElement('span');
  actions.className = 'entry-row-actions';

  row.append(icon, main, stateLabelEl, actions);
  return row;
}

function addActionButton(container, icon, title, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'icon-button';
  btn.title = title;
  btn.setAttribute('aria-label', title);
  btn.innerHTML = icon;
  btn.addEventListener('click', (event) => {
    event.stopPropagation();
    onClick();
  });
  container.appendChild(btn);
}

function updateRow(row, record) {
  row.querySelector('.entry-title').textContent = record.filename;

  const receivedStr = formatBytes(record.receivedBytes);
  const totalStr = record.totalBytes > 0 ? formatBytes(record.totalBytes) : null;
  row.querySelector('.entry-meta').textContent =
    record.state === 'completed' ? totalStr || receivedStr : totalStr ? `${receivedStr} of ${totalStr}` : receivedStr;

  const track = row.querySelector('.download-progress-track');
  const fill = row.querySelector('.download-progress-fill');
  const showProgress = record.state === 'progressing';
  track.hidden = !showProgress;
  if (showProgress) {
    if (record.totalBytes > 0) {
      fill.classList.remove('is-indeterminate');
      fill.style.width = `${Math.min(100, (record.receivedBytes / record.totalBytes) * 100)}%`;
    } else {
      fill.classList.add('is-indeterminate');
    }
  }

  const label = row.querySelector('.download-state-label');
  label.textContent = stateLabel(record);
  label.className = `download-state-label is-${record.state}`;
  // Once we have real numbers the progress bar already communicates this; the label is most useful for paused/failed/done.
  label.hidden = record.state === 'progressing' && record.totalBytes > 0;

  const actions = row.querySelector('.entry-row-actions');
  actions.innerHTML = '';
  if (record.state === 'progressing') {
    addActionButton(actions, PAUSE_ICON, 'Pause', () => window.browserAPI.downloads.pause(record.id));
    addActionButton(actions, TRASH_ICON, 'Cancel', () => window.browserAPI.downloads.cancel(record.id));
  } else if (record.state === 'interrupted' && record.canResume) {
    addActionButton(actions, RESUME_ICON, 'Resume', () => window.browserAPI.downloads.resume(record.id));
    addActionButton(actions, TRASH_ICON, 'Remove', () => window.browserAPI.downloads.cancel(record.id));
  } else if (record.state === 'completed') {
    addActionButton(actions, FOLDER_OPEN_ICON, 'Show in folder', () => window.browserAPI.downloads.showInFolder(record.id));
  }

  row.onclick = () => {
    if (record.state === 'completed') window.browserAPI.downloads.openFile(record.id);
  };
}

function render() {
  const downloads = getState().downloads;

  if (downloads.length === 0) {
    listEl.innerHTML = '';
    rowElements.clear();
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No downloads yet.';
    listEl.appendChild(empty);
    return;
  }
  if (listEl.querySelector('.empty-state')) listEl.innerHTML = '';

  const nextIds = new Set(downloads.map((d) => d.id));
  for (const [id, row] of rowElements) {
    if (!nextIds.has(id)) {
      row.remove();
      rowElements.delete(id);
    }
  }

  downloads.forEach((record, index) => {
    let row = rowElements.get(record.id);
    if (!row) {
      row = buildRow();
      rowElements.set(record.id, row);
    }
    updateRow(row, record);
    if (listEl.children[index] !== row) {
      listEl.insertBefore(row, listEl.children[index] || null);
    }
  });
}

async function refresh() {
  const downloads = await window.browserAPI.downloads.getAll();
  setState({ downloads }); // triggers this module's own subscribe(render) below
}

export function initDownloadsPanel() {
  document.getElementById('downloads-open-folder-button').addEventListener('click', () => {
    window.browserAPI.downloads.openDownloadsFolder();
  });
  document.getElementById('downloads-clear-completed-button').addEventListener('click', async () => {
    await window.browserAPI.downloads.clearCompleted();
    refresh();
  });

  onPanelShown('downloads', refresh);
  subscribe(render);
}
