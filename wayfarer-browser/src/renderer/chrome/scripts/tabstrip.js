'use strict';

import { getState, subscribe } from './state.js';
import { DEFAULT_FAVICON_ICON, CLOSE_ICON } from './icons.js';

const listEl = document.getElementById('tabstrip-list');

/** tabId -> its <div class="tab"> element, so re-renders update in place instead of rebuilding the whole strip. */
const tabElements = new Map();

function buildTabElement(tabId) {
  const el = document.createElement('div');
  el.className = 'tab';
  el.dataset.tabId = tabId;
  el.setAttribute('role', 'tab');
  el.tabIndex = -1;

  const favicon = document.createElement('span');
  favicon.className = 'tab-favicon';

  const title = document.createElement('span');
  title.className = 'tab-title';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'tab-close';
  closeBtn.setAttribute('aria-label', 'Close tab');
  closeBtn.innerHTML = CLOSE_ICON;

  el.append(favicon, title, closeBtn);

  el.addEventListener('click', (event) => {
    if (closeBtn.contains(event.target)) return;
    window.browserAPI.tabs.activate(tabId);
  });

  // Middle-click closes the tab, same as every desktop browser.
  el.addEventListener('auxclick', (event) => {
    if (event.button === 1) {
      event.preventDefault();
      window.browserAPI.tabs.close(tabId);
    }
  });

  closeBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    window.browserAPI.tabs.close(tabId);
  });

  return el;
}

function updateTabElement(el, tab, isActive) {
  el.classList.toggle('is-active', isActive);
  el.setAttribute('aria-selected', String(isActive));

  const displayTitle = tab.title || 'New Tab';
  const titleEl = el.querySelector('.tab-title');
  if (titleEl.textContent !== displayTitle) titleEl.textContent = displayTitle;
  if (el.title !== displayTitle) el.title = displayTitle;

  const faviconEl = el.querySelector('.tab-favicon');
  if (tab.isLoading) {
    if (!faviconEl.querySelector('.tab-loading-spinner')) {
      faviconEl.innerHTML = '<span class="tab-loading-spinner"></span>';
    }
    return;
  }
  if (tab.favicon) {
    const img = faviconEl.querySelector('img');
    if (!img || img.dataset.src !== tab.favicon) {
      faviconEl.innerHTML = '';
      const newImg = document.createElement('img');
      newImg.alt = '';
      newImg.dataset.src = tab.favicon;
      newImg.src = tab.favicon;
      newImg.onerror = () => {
        faviconEl.innerHTML = DEFAULT_FAVICON_ICON;
      };
      faviconEl.appendChild(newImg);
    }
    return;
  }
  if (!faviconEl.querySelector('svg')) {
    faviconEl.innerHTML = DEFAULT_FAVICON_ICON;
  }
}

function render() {
  const { tabs, activeTabId } = getState();
  const nextIds = new Set(tabs.map((t) => t.id));

  for (const [id, el] of tabElements) {
    if (!nextIds.has(id)) {
      el.remove();
      tabElements.delete(id);
    }
  }

  tabs.forEach((tab, index) => {
    let el = tabElements.get(tab.id);
    if (!el) {
      el = buildTabElement(tab.id);
      tabElements.set(tab.id, el);
    }
    updateTabElement(el, tab, tab.id === activeTabId);
    if (listEl.children[index] !== el) {
      listEl.insertBefore(el, listEl.children[index] || null);
    }
  });

  if (activeTabId && tabElements.has(activeTabId)) {
    tabElements.get(activeTabId).scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}

export function initTabStrip() {
  document.getElementById('new-tab-button').addEventListener('click', () => {
    window.browserAPI.tabs.create({ activate: true });
  });

  subscribe(render);
  render();
}
