'use strict';

import { getState, subscribe, getActiveTab, findBookmarkByUrl } from './state.js';
import { RELOAD_ICON, STOP_ICON } from './icons.js';

const backBtn = document.getElementById('back-button');
const forwardBtn = document.getElementById('forward-button');
const reloadBtn = document.getElementById('reload-button');
const homeBtn = document.getElementById('home-button');
const addressForm = document.getElementById('address-form');
const addressInput = document.getElementById('address-input');
const addressWrap = document.getElementById('address-bar-wrap');
const bookmarkStar = document.getElementById('bookmark-star');
const securityIndicator = document.getElementById('security-indicator');
const progressBar = document.getElementById('progress-bar');

// True while the person is actively typing/focused in the address bar, so
// pushed tab updates (e.g. a background did-navigate event) never clobber
// what they're mid-way through typing.
let isEditingAddress = false;

function activeTabId() {
  return getState().activeTabId;
}

function setProgress(isLoading) {
  if (isLoading) {
    progressBar.classList.add('is-visible');
    progressBar.style.width = '0%';
    void progressBar.offsetWidth; // force a reflow so the width transition below actually animates
    progressBar.style.width = '75%';
    return;
  }
  progressBar.style.width = '100%';
  window.setTimeout(() => {
    if (!getActiveTab()?.isLoading) {
      progressBar.classList.remove('is-visible');
      progressBar.style.width = '0%';
    }
  }, 250);
}

function render() {
  const tab = getActiveTab();
  if (!tab) return;

  backBtn.disabled = !tab.canGoBack;
  forwardBtn.disabled = !tab.canGoForward;

  reloadBtn.innerHTML = tab.isLoading ? STOP_ICON : RELOAD_ICON;
  reloadBtn.title = tab.isLoading ? 'Stop' : 'Reload';
  reloadBtn.setAttribute('aria-label', reloadBtn.title);

  setProgress(tab.isLoading);

  if (!isEditingAddress) {
    addressInput.value = tab.status === 'newtab' ? '' : tab.url || '';
  }

  securityIndicator.classList.toggle('is-secure', (tab.url || '').startsWith('https://'));

  const canBookmark = tab.status === 'content' && Boolean(tab.url);
  bookmarkStar.hidden = !canBookmark;
  if (canBookmark) {
    bookmarkStar.classList.toggle('is-bookmarked', Boolean(findBookmarkByUrl(tab.url)));
  }
}

export function initToolbar() {
  backBtn.addEventListener('click', () => window.browserAPI.tabs.goBack(activeTabId()));
  forwardBtn.addEventListener('click', () => window.browserAPI.tabs.goForward(activeTabId()));
  reloadBtn.addEventListener('click', () => {
    const tab = getActiveTab();
    if (tab?.isLoading) window.browserAPI.tabs.stop(activeTabId());
    else window.browserAPI.tabs.reload(activeTabId());
  });
  homeBtn.addEventListener('click', () => window.browserAPI.tabs.goHome(activeTabId()));

  addressInput.addEventListener('focus', () => {
    isEditingAddress = true;
    addressWrap.classList.add('is-focused');
    addressInput.select();
  });

  addressInput.addEventListener('blur', () => {
    isEditingAddress = false;
    addressWrap.classList.remove('is-focused');
    render(); // snap back to the tab's real URL if the person typed something and clicked away
  });

  addressInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') addressInput.blur();
  });

  addressForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = addressInput.value.trim();
    if (!value) return;
    window.browserAPI.tabs.navigate(activeTabId(), value);
    addressInput.blur();
  });

  bookmarkStar.addEventListener('click', async () => {
    const tab = getActiveTab();
    if (!tab || tab.status !== 'content' || !tab.url) return;
    const existing = findBookmarkByUrl(tab.url);
    if (existing) {
      await window.browserAPI.bookmarks.remove(existing.id);
    } else {
      await window.browserAPI.bookmarks.add({ url: tab.url, title: tab.title });
    }
    // No local state mutation here: main emits bookmarks:on-changed after
    // add/remove, which app.js turns into a bookmarksTree update that this
    // module's render() (already subscribed) will pick up automatically.
  });

  subscribe(render);
  render();
}

/** Exposed so app.js can call it when focusing the address bar via Ctrl/Cmd+L. */
export function focusAddressBar() {
  addressInput.focus();
}
