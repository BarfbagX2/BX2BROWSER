'use strict';

import { getState, subscribe } from './state.js';
import { closePanel } from './panel-controller.js';
import { DEFAULT_FAVICON_ICON, FOLDER_ICON, CHEVRON_DOWN_ICON, TRASH_ICON } from './icons.js';

const treeEl = document.getElementById('bookmarks-tree');
const INDENT_PX = 20;

function makeDeleteButton(onClick, label) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'icon-button';
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.innerHTML = TRASH_ICON;
  btn.addEventListener('click', (event) => {
    event.stopPropagation();
    onClick();
  });
  return btn;
}

function buildBookmarkRow(node, depth) {
  const row = document.createElement('div');
  row.className = 'bookmark-row';
  row.style.paddingLeft = `${depth * INDENT_PX + 28}px`;

  const icon = document.createElement('span');
  icon.className = 'entry-icon';
  icon.innerHTML = DEFAULT_FAVICON_ICON;

  const main = document.createElement('div');
  main.className = 'entry-main';
  main.style.flex = '1 1 auto';
  const title = document.createElement('span');
  title.className = 'entry-title';
  title.textContent = node.title;
  const meta = document.createElement('span');
  meta.className = 'entry-meta';
  meta.textContent = node.url;
  main.append(title, meta);

  const actions = document.createElement('span');
  actions.className = 'entry-row-actions';
  actions.appendChild(makeDeleteButton(() => window.browserAPI.bookmarks.remove(node.id), 'Delete bookmark'));

  row.append(icon, main, actions);
  row.addEventListener('click', (event) => {
    if (event.target.closest('.entry-row-actions')) return;
    window.browserAPI.tabs.navigate(getState().activeTabId, node.url);
    closePanel();
  });
  return row;
}

function buildFolderNode(node, depth) {
  const wrapper = document.createElement('div');
  wrapper.className = 'bookmark-node';

  const row = document.createElement('div');
  row.className = 'bookmark-row';
  row.style.paddingLeft = `${depth * INDENT_PX + 8}px`;

  const chevron = document.createElement('span');
  chevron.className = 'entry-icon';
  chevron.innerHTML = CHEVRON_DOWN_ICON;

  const icon = document.createElement('span');
  icon.className = 'entry-icon';
  icon.innerHTML = FOLDER_ICON;

  const title = document.createElement('span');
  title.className = 'entry-title';
  title.style.flex = '1 1 auto';
  title.textContent = node.title;

  const actions = document.createElement('span');
  actions.className = 'entry-row-actions';
  if (node.id !== 'root') {
    actions.appendChild(
      makeDeleteButton(() => {
        if (window.confirm(`Delete the folder "${node.title}" and everything in it?`)) {
          window.browserAPI.bookmarks.remove(node.id);
        }
      }, 'Delete folder')
    );
  }

  row.append(chevron, icon, title, actions);
  wrapper.appendChild(row);

  const childrenEl = document.createElement('div');
  childrenEl.className = 'bookmark-children';
  for (const child of node.children) {
    childrenEl.appendChild(child.type === 'folder' ? buildFolderNode(child, depth + 1) : buildBookmarkRow(child, depth + 1));
  }
  wrapper.appendChild(childrenEl);

  return wrapper;
}

function renderTree() {
  const tree = getState().bookmarksTree;
  treeEl.innerHTML = '';

  if (!tree || !tree.children || tree.children.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No bookmarks yet. Click the star in the address bar to add one.';
    treeEl.appendChild(empty);
    return;
  }

  for (const child of tree.children) {
    treeEl.appendChild(child.type === 'folder' ? buildFolderNode(child, 0) : buildBookmarkRow(child, 0));
  }
}

export function initBookmarksPanel() {
  document.getElementById('bookmarks-new-folder-button').addEventListener('click', async () => {
    const title = window.prompt('Folder name');
    if (title && title.trim()) {
      await window.browserAPI.bookmarks.createFolder({ title: title.trim() });
    }
  });

  // The bookmarks tree already lives in central state (app.js keeps it
  // current via the bookmarks:on-changed push event), so this only needs
  // to re-render when it's the page actually on screen - no IPC fetch here.
  subscribe(() => {
    const { panel } = getState();
    if (panel.open && panel.active === 'bookmarks') renderTree();
  });
}
