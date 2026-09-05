'use strict';

import { getState, setState, subscribe } from './state.js';

const panelOverlay = document.getElementById('panel-overlay');
const navButtons = Array.from(document.querySelectorAll('.panel-nav-item[data-panel]'));
const closeButton = document.getElementById('panel-close-button');
const pages = {
  history: document.getElementById('panel-page-history'),
  bookmarks: document.getElementById('panel-page-bookmarks'),
  downloads: document.getElementById('panel-page-downloads'),
  settings: document.getElementById('panel-page-settings')
};

const showCallbacks = { history: [], bookmarks: [], downloads: [], settings: [] };
let previousOpen = false;
let previousActive = null;

/** Registers a callback to run whenever this panel page transitions from not-shown to shown (not on every re-render). */
export function onPanelShown(name, callback) {
  showCallbacks[name].push(callback);
}

export function openPanel(name = 'history') {
  setState({ panel: { open: true, active: name } });
  window.browserAPI.ui.setOverlayOpen(true);
}

export function closePanel() {
  setState({ panel: { ...getState().panel, open: false } });
  window.browserAPI.ui.setOverlayOpen(false);
}

export function switchPanel(name) {
  if (pages[name]) setState({ panel: { open: true, active: name } });
}

function render() {
  const { panel } = getState();
  panelOverlay.hidden = !panel.open;

  for (const btn of navButtons) {
    btn.classList.toggle('is-active', btn.dataset.panel === panel.active);
  }
  for (const [name, el] of Object.entries(pages)) {
    el.hidden = !(panel.open && name === panel.active);
  }

  const justShown = panel.open && (!previousOpen || panel.active !== previousActive);
  if (justShown) {
    for (const callback of showCallbacks[panel.active] || []) callback();
  }
  previousOpen = panel.open;
  previousActive = panel.active;
}

export function initPanelController() {
  for (const btn of navButtons) {
    btn.addEventListener('click', () => switchPanel(btn.dataset.panel));
  }
  closeButton.addEventListener('click', closePanel);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && getState().panel.open) closePanel();
  });

  subscribe(render);
  render();
}
