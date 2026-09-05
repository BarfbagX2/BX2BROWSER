'use strict';

/**
 * "system" is resolved to a concrete "light" or "dark" here, once, before
 * `data-theme` is ever set on <html> - the stylesheets only need to define
 * those two concrete themes. When the setting is "system", an OS theme
 * change is picked up live via the media query listener below.
 */

let currentSetting = 'system';
const darkMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

function resolve(setting) {
  if (setting === 'light' || setting === 'dark') return setting;
  return darkMediaQuery.matches ? 'dark' : 'light';
}

function applyToDocument() {
  document.documentElement.dataset.theme = resolve(currentSetting);
}

export function setThemeSetting(setting) {
  currentSetting = setting || 'system';
  applyToDocument();
}

darkMediaQuery.addEventListener('change', () => {
  if (currentSetting === 'system') applyToDocument();
});
