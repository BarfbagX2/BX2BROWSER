'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { app, shell } = require('electron');
const { JsonStore } = require('../data/JsonStore');

/**
 * Hooked once against the browser's shared session (not per-tab, since
 * every ordinary tab shares the same persistent partition), this tracks
 * every download from start to finish: progress, pause/resume/cancel where
 * Chromium's DownloadItem supports it, and a small persisted history so
 * completed downloads still show up after a restart.
 *
 * Note on restarts: an in-progress download's underlying `DownloadItem`
 * only exists for the lifetime of the app process that started it, so a
 * download that's still running when the app quits shows up as
 * "interrupted" on next launch rather than being resumable - the same
 * limitation most lightweight browsers built this way have.
 */
class DownloadManager extends EventEmitter {
  /**
   * @param {import('electron').Session} session
   * @param {() => object} getSettings
   */
  constructor(session, getSettings) {
    super();
    this._getSettings = getSettings;
    const filePath = path.join(app.getPath('userData'), 'downloads.json');
    this._store = new JsonStore(filePath, { records: [] });
    /** @type {Map<string, import('electron').DownloadItem>} */
    this._liveItems = new Map();

    // Any download in progress when the app last quit can never finish -
    // mark it interrupted rather than leaving a stale "progressing" record.
    this._store.update((data) => {
      for (const record of data.records) {
        if (record.state === 'progressing') {
          record.state = 'interrupted';
          record.canResume = false;
        }
      }
    });

    session.on('will-download', (_event, item) => this._handleWillDownload(item));
  }

  _handleWillDownload(item) {
    const id = crypto.randomUUID();
    const targetDir = this._getSettings().downloadDirectory || app.getPath('downloads');
    const savePath = this._uniqueSavePath(targetDir, item.getFilename());
    item.setSavePath(savePath);

    const record = {
      id,
      filename: path.basename(savePath),
      url: item.getURL(),
      savePath,
      totalBytes: item.getTotalBytes(),
      receivedBytes: 0,
      state: 'progressing',
      canResume: false,
      startedAt: Date.now(),
      completedAt: null
    };

    this._liveItems.set(id, item);
    this._upsertRecord(record);
    this.emit('created', { ...record });

    item.on('updated', (_event, state) => {
      record.receivedBytes = item.getReceivedBytes();
      record.totalBytes = item.getTotalBytes();
      record.state = state; // 'progressing' | 'interrupted'
      record.canResume = state === 'interrupted' && item.canResume();
      this._upsertRecord(record);
      this.emit('updated', { ...record });
    });

    item.once('done', (_event, state) => {
      record.state = state; // 'completed' | 'cancelled' | 'interrupted'
      record.receivedBytes = item.getReceivedBytes();
      record.completedAt = Date.now();
      record.canResume = false;
      this._liveItems.delete(id);
      this._upsertRecord(record);
      this.emit('updated', { ...record });
    });
  }

  _uniqueSavePath(dir, filename) {
    fs.mkdirSync(dir, { recursive: true });
    const safeName = filename && filename.trim() ? filename : 'download';
    const ext = path.extname(safeName);
    const base = path.basename(safeName, ext);
    let candidate = path.join(dir, safeName);
    let counter = 1;
    while (fs.existsSync(candidate)) {
      candidate = path.join(dir, `${base} (${counter})${ext}`);
      counter += 1;
    }
    return candidate;
  }

  _upsertRecord(record) {
    this._store.update((data) => {
      const index = data.records.findIndex((r) => r.id === record.id);
      if (index === -1) data.records.push({ ...record });
      else data.records[index] = { ...record };
    });
  }

  getAll() {
    return this._store.get().records.slice().sort((a, b) => b.startedAt - a.startedAt);
  }

  pause(id) {
    const item = this._liveItems.get(id);
    if (item && !item.isPaused()) item.pause();
  }

  resume(id) {
    const item = this._liveItems.get(id);
    if (item && item.canResume()) item.resume();
  }

  cancel(id) {
    const item = this._liveItems.get(id);
    if (item) item.cancel();
  }

  openFile(id) {
    const record = this._findRecord(id);
    if (record) shell.openPath(record.savePath);
  }

  showInFolder(id) {
    const record = this._findRecord(id);
    if (record) shell.showItemInFolder(record.savePath);
  }

  openDownloadsFolder() {
    shell.openPath(this._getSettings().downloadDirectory || app.getPath('downloads'));
  }

  clearCompleted() {
    this._store.update((data) => {
      data.records = data.records.filter((r) => r.state === 'progressing' || r.state === 'interrupted');
    });
    this.emit('cleared');
  }

  _findRecord(id) {
    return this._store.get().records.find((r) => r.id === id);
  }

  flushSync() {
    this._store.flushSync();
  }
}

module.exports = { DownloadManager };
