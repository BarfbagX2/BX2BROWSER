'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * A small, dependency-free JSON document store.
 *
 * Every browser data manager (history, bookmarks, settings) keeps its state
 * as a plain JS value in memory and uses one of these to persist it to a
 * single JSON file under Electron's per-app `userData` directory - which is
 * already isolated from any other application's profile (Chrome, Edge, or
 * otherwise), since each Electron app gets its own `userData` path.
 *
 * Writes are atomic (write to a temp file, then rename over the real file)
 * so a crash or power loss mid-write can never leave a half-written, corrupt
 * JSON file behind. Writes are also debounced so rapid-fire changes (e.g.
 * every history visit) collapse into a single disk write.
 */
class JsonStore {
  /**
   * @param {string} filePath Absolute path to the JSON file on disk.
   * @param {*} defaultValue Value to use if the file does not exist or is corrupt.
   * @param {object} [options]
   * @param {number} [options.debounceMs] Delay before writes hit disk. Default 250ms.
   */
  constructor(filePath, defaultValue, options = {}) {
    this.filePath = filePath;
    this.defaultValue = defaultValue;
    this.debounceMs = options.debounceMs ?? 250;
    this._writeTimer = null;
    this._pendingValue = undefined;
    this._data = this._readFromDisk();
  }

  _readFromDisk() {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      return JSON.parse(raw);
    } catch (err) {
      if (err && err.code !== 'ENOENT') {
        console.warn(`[JsonStore] Failed to read ${this.filePath}, falling back to default:`, err.message);
      }
      return this._clone(this.defaultValue);
    }
  }

  _clone(value) {
    return value === undefined ? value : JSON.parse(JSON.stringify(value));
  }

  _writeToDiskSync(value) {
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });
    const tmpPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(value, null, 2), 'utf8');
    fs.renameSync(tmpPath, this.filePath);
  }

  /** Returns the current in-memory value (not a copy - callers must not mutate it directly). */
  get() {
    return this._data;
  }

  /** Replaces the whole stored value and schedules a debounced write. */
  set(value) {
    this._data = value;
    this._scheduleWrite();
  }

  /** Convenience helper: apply a mutator function to the current value, then persist it. */
  update(mutatorFn) {
    mutatorFn(this._data);
    this._scheduleWrite();
  }

  _scheduleWrite() {
    this._pendingValue = this._data;
    if (this._writeTimer) {
      clearTimeout(this._writeTimer);
    }
    this._writeTimer = setTimeout(() => {
      this._writeTimer = null;
      const toWrite = this._pendingValue;
      this._pendingValue = undefined;
      try {
        this._writeToDiskSync(toWrite);
      } catch (err) {
        console.error(`[JsonStore] Failed to write ${this.filePath}:`, err);
      }
    }, this.debounceMs);
  }

  /** Forces any pending debounced write to happen immediately. Call this before quitting. */
  flushSync() {
    if (this._writeTimer) {
      clearTimeout(this._writeTimer);
      this._writeTimer = null;
    }
    if (this._pendingValue !== undefined) {
      const toWrite = this._pendingValue;
      this._pendingValue = undefined;
      try {
        this._writeToDiskSync(toWrite);
      } catch (err) {
        console.error(`[JsonStore] Failed to flush ${this.filePath}:`, err);
      }
    }
  }
}

module.exports = { JsonStore };
