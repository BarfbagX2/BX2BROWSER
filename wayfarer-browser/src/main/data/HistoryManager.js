'use strict';

const path = require('node:path');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { app } = require('electron');
const { JsonStore } = require('./JsonStore');

// Keep at most this many entries on disk so a long-lived install doesn't
// grow its history file without bound. Oldest entries are trimmed first.
const MAX_ENTRIES = 25000;

/**
 * Owns browsing history: every completed navigation to an http(s) page is
 * recorded here with a title, favicon and timestamp. Backed by a single
 * JSON file so it stays simple and dependency-free; that's plenty fast for
 * tens of thousands of entries, which comfortably covers normal usage.
 */
class HistoryManager extends EventEmitter {
  constructor() {
    super();
    const filePath = path.join(app.getPath('userData'), 'history.json');
    this._store = new JsonStore(filePath, { entries: [] });
  }

  /**
   * Records a single page visit. Internal/blank navigations should not be
   * passed here - only call this for real, successfully-loaded http(s) pages.
   */
  recordVisit({ url, title, favicon }) {
    if (!url) return;
    const entry = {
      id: crypto.randomUUID(),
      url,
      title: title && title.trim() ? title.trim() : url,
      favicon: favicon || null,
      visitedAt: Date.now()
    };
    this._store.update((data) => {
      data.entries.push(entry);
      if (data.entries.length > MAX_ENTRIES) {
        data.entries.splice(0, data.entries.length - MAX_ENTRIES);
      }
    });
    this.emit('changed');
    return entry;
  }

  /**
   * Returns history entries, most recent first.
   * @param {object} [query]
   * @param {string} [query.searchText] Case-insensitive match against title or URL.
   * @param {number} [query.limit]
   * @param {number} [query.offset]
   */
  getAll(query = {}) {
    let entries = this._store.get().entries.slice().sort((a, b) => b.visitedAt - a.visitedAt);

    if (query.searchText && query.searchText.trim()) {
      const needle = query.searchText.trim().toLowerCase();
      entries = entries.filter(
        (e) => e.title.toLowerCase().includes(needle) || e.url.toLowerCase().includes(needle)
      );
    }

    const total = entries.length;
    const offset = query.offset || 0;
    const limit = query.limit || total;
    return { entries: entries.slice(offset, offset + limit), total };
  }

  /** Returns the most-visited distinct URLs, for the New Tab page's shortcut grid. */
  getTopVisited(limit = 8) {
    const byUrl = new Map();
    for (const entry of this._store.get().entries) {
      const existing = byUrl.get(entry.url);
      if (existing) {
        existing.visitCount += 1;
        if (entry.visitedAt > existing.lastVisitedAt) {
          existing.lastVisitedAt = entry.visitedAt;
          existing.title = entry.title;
          existing.favicon = entry.favicon;
        }
      } else {
        byUrl.set(entry.url, {
          url: entry.url,
          title: entry.title,
          favicon: entry.favicon,
          visitCount: 1,
          lastVisitedAt: entry.visitedAt
        });
      }
    }
    return Array.from(byUrl.values())
      .sort((a, b) => b.visitCount - a.visitCount || b.lastVisitedAt - a.lastVisitedAt)
      .slice(0, limit);
  }

  deleteEntry(id) {
    this._store.update((data) => {
      data.entries = data.entries.filter((e) => e.id !== id);
    });
    this.emit('changed');
  }

  /**
   * Deletes every entry with `visitedAt` between `startTs` and `endTs`
   * (inclusive). Pass `0, Date.now()` (or omit both) to clear everything.
   */
  clearRange(startTs = 0, endTs = Date.now()) {
    this._store.update((data) => {
      data.entries = data.entries.filter((e) => e.visitedAt < startTs || e.visitedAt > endTs);
    });
    this.emit('changed');
  }

  flushSync() {
    this._store.flushSync();
  }
}

module.exports = { HistoryManager };
