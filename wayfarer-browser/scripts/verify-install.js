'use strict';

/**
 * Best-effort post-install sanity check.
 *
 * Electron's install downloads a large prebuilt binary as a side effect of
 * `npm install`. That step is the most common source of install failures
 * (network restrictions, corporate proxies, etc.), so this script prints a
 * quick confirmation that it actually worked. It intentionally never throws
 * and never exits non-zero: a broken *sanity check* should not be able to
 * fail someone's `npm install`.
 */
try {
  const electronPath = require('electron');
  const { execFileSync } = require('node:child_process');

  if (typeof electronPath !== 'string') {
    console.log('[wayfarer] Electron installed (running inside an Electron process).');
    process.exit(0);
  }

  const version = execFileSync(electronPath, ['--version'], {
    encoding: 'utf8',
    timeout: 15000
  }).trim();

  console.log(`[wayfarer] Electron binary OK: ${version}`);
} catch (err) {
  console.warn('[wayfarer] Could not verify the Electron binary automatically.');
  console.warn('[wayfarer] This is informational only \u2014 run "npm start" to check for real.');
  console.warn(`[wayfarer] (${err && err.message ? err.message : err})`);
}

process.exit(0);
