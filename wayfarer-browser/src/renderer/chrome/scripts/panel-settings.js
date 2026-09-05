'use strict';

import { getState, subscribe } from './state.js';
import { onPanelShown } from './panel-controller.js';
import { setThemeSetting } from './theme.js';

// Mirrors NEW_TAB_URL in src/main/constants.js - duplicated here for the
// same reason the preload script duplicates IPC channel names: this is
// plain renderer code with no Node access, so it cannot require() that file.
const NEW_TAB_URL_SENTINEL = 'wayfarer://new-tab';

const els = {
  homepageNewtab: document.getElementById('homepage-mode-newtab'),
  homepageCustom: document.getElementById('homepage-mode-custom'),
  homepageUrl: document.getElementById('homepage-url-input'),
  searchEngine: document.getElementById('search-engine-select'),
  startupBehavior: document.getElementById('startup-behavior-select'),
  downloadDirDisplay: document.getElementById('download-dir-display'),
  chooseDownloadDirBtn: document.getElementById('choose-download-dir-button'),
  theme: document.getElementById('theme-select'),
  javascriptToggle: document.getElementById('javascript-toggle'),
  hardwareAccelToggle: document.getElementById('hardware-accel-toggle'),
  dntToggle: document.getElementById('dnt-toggle'),
  thirdPartyCookiesToggle: document.getElementById('third-party-cookies-toggle'),
  applyBanner: document.getElementById('apply-banner'),
  applyBannerText: document.getElementById('apply-banner-text'),
  applyBannerButton: document.getElementById('apply-banner-button'),
  clearHistoryCheckbox: document.getElementById('clear-history-checkbox'),
  clearCookiesCheckbox: document.getElementById('clear-cookies-checkbox'),
  clearCacheCheckbox: document.getElementById('clear-cache-checkbox'),
  clearBrowsingDataBtn: document.getElementById('clear-browsing-data-button'),
  aboutVersion: document.getElementById('about-version')
};

// True while the person is actively typing a custom homepage URL, so an
// unrelated state change elsewhere doesn't reset the field mid-edit - same
// pattern as the address bar in toolbar.js.
let isEditingHomepageUrl = false;
let applyBannerKind = null; // 'reload-tabs' | 'restart'

function normalizeHomepageUrl(value) {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function populateForm(settings) {
  if (!settings) return;

  const isCustomHomepage = Boolean(settings.homepage) && settings.homepage !== NEW_TAB_URL_SENTINEL;
  els.homepageNewtab.checked = !isCustomHomepage;
  if (!isEditingHomepageUrl) {
    els.homepageCustom.checked = isCustomHomepage;
    els.homepageUrl.value = isCustomHomepage ? settings.homepage : '';
  }

  els.searchEngine.value = settings.searchEngine;
  els.startupBehavior.value = settings.startupBehavior;
  els.downloadDirDisplay.textContent = settings.downloadDirectory || 'Default Downloads folder';
  els.theme.value = settings.theme;
  els.javascriptToggle.checked = settings.javascriptEnabled;
  els.hardwareAccelToggle.checked = settings.hardwareAcceleration;
  els.dntToggle.checked = settings.doNotTrack;
  els.thirdPartyCookiesToggle.checked = settings.blockThirdPartyCookies;
}

function showApplyBanner(kind) {
  applyBannerKind = kind;
  els.applyBanner.hidden = false;
  if (kind === 'reload-tabs') {
    els.applyBannerText.textContent = 'Reload open tabs to apply this change.';
    els.applyBannerButton.textContent = 'Reload Tabs';
  } else {
    els.applyBannerText.textContent = 'Restart Wayfarer to apply this change.';
    els.applyBannerButton.textContent = 'Restart Now';
  }
}

function hideApplyBanner() {
  applyBannerKind = null;
  els.applyBanner.hidden = true;
}

async function refreshAbout() {
  const version = await window.browserAPI.app.getVersion();
  els.aboutVersion.textContent = `Wayfarer ${version}`;
}

export function initSettingsPanel() {
  onPanelShown('settings', () => {
    populateForm(getState().settings);
    refreshAbout();
  });

  subscribe(() => {
    const { panel, settings } = getState();
    if (panel.open && panel.active === 'settings') populateForm(settings);
  });

  els.homepageNewtab.addEventListener('change', () => {
    if (els.homepageNewtab.checked) window.browserAPI.settings.set({ homepage: NEW_TAB_URL_SENTINEL });
  });
  els.homepageUrl.addEventListener('focus', () => {
    isEditingHomepageUrl = true;
    els.homepageCustom.checked = true;
  });
  els.homepageUrl.addEventListener('blur', () => {
    isEditingHomepageUrl = false;
  });
  els.homepageUrl.addEventListener('change', () => {
    const value = els.homepageUrl.value.trim();
    if (value) {
      els.homepageCustom.checked = true;
      window.browserAPI.settings.set({ homepage: normalizeHomepageUrl(value) });
    }
  });

  els.searchEngine.addEventListener('change', () => {
    window.browserAPI.settings.set({ searchEngine: els.searchEngine.value });
  });
  els.startupBehavior.addEventListener('change', () => {
    window.browserAPI.settings.set({ startupBehavior: els.startupBehavior.value });
  });

  els.chooseDownloadDirBtn.addEventListener('click', async () => {
    const updated = await window.browserAPI.settings.chooseDownloadDir();
    if (updated) els.downloadDirDisplay.textContent = updated.downloadDirectory || 'Default Downloads folder';
  });

  els.theme.addEventListener('change', () => {
    setThemeSetting(els.theme.value);
    window.browserAPI.settings.set({ theme: els.theme.value });
  });

  els.javascriptToggle.addEventListener('change', () => {
    window.browserAPI.settings.set({ javascriptEnabled: els.javascriptToggle.checked });
    showApplyBanner('reload-tabs');
  });
  els.hardwareAccelToggle.addEventListener('change', () => {
    window.browserAPI.settings.set({ hardwareAcceleration: els.hardwareAccelToggle.checked });
    showApplyBanner('restart');
  });
  els.dntToggle.addEventListener('change', () => {
    window.browserAPI.settings.set({ doNotTrack: els.dntToggle.checked });
  });
  els.thirdPartyCookiesToggle.addEventListener('change', () => {
    window.browserAPI.settings.set({ blockThirdPartyCookies: els.thirdPartyCookiesToggle.checked });
  });

  els.applyBannerButton.addEventListener('click', () => {
    if (applyBannerKind === 'reload-tabs') window.browserAPI.tabs.reloadAll();
    else if (applyBannerKind === 'restart') window.browserAPI.app.relaunch();
    hideApplyBanner();
  });

  els.clearBrowsingDataBtn.addEventListener('click', async () => {
    const options = {
      history: els.clearHistoryCheckbox.checked,
      cookiesAndSiteData: els.clearCookiesCheckbox.checked,
      cachedFiles: els.clearCacheCheckbox.checked
    };
    if (!options.history && !options.cookiesAndSiteData && !options.cachedFiles) return;
    if (!window.confirm("Clear the selected browsing data? This can't be undone.")) return;
    els.clearBrowsingDataBtn.disabled = true;
    try {
      await window.browserAPI.settings.clearBrowsingData(options);
    } finally {
      els.clearBrowsingDataBtn.disabled = false;
    }
  });
}
