'use strict';

const path = require('node:path');
const { EventEmitter } = require('node:events');
const { app } = require('electron');
const { JsonStore } = require('./JsonStore');
const { DEFAULT_SETTINGS } = require('../constants');

/**
 * Owns the browser's user-configurable settings (homepage, search engine,
 * theme, privacy toggles, etc.) and persists them to `settings.json` inside
 * Electron's per-app userData directory.
 *
 * Emits 'changed' with the full settings object whenever something is
 * updated, so the IPC layer can push the new values to every open window.
 */
class SettingsManager extends EventEmitter {
  constructor() {
    super();
    const filePath = path.join(app.getPath('userData'), 'settings.json');
    this._store = new JsonStore(filePath, DEFAULT_SETTINGS);
    // Merge saved settings over the defaults so new settings added in a
    // future version of the app show up with sane values for users
    // upgrading from an older settings.json that predates them.
    this._store.set({ ...DEFAULT_SETTINGS, ...this._store.get() });
  }

  getAll() {
    return { ...this._store.get() };
  }

  get(key) {
    return this._store.get()[key];
  }

  /**
   * Merges a partial settings object in and persists it.
   * Returns the full, updated settings object.
   */
  set(partialSettings) {
    const next = { ...this._store.get(), ...partialSettings };
    this._store.set(next);
    this.emit('changed', this.getAll());
    return this.getAll();
  }

  flushSync() {
    this._store.flushSync();
  }
}

module.exports = { SettingsManager };
