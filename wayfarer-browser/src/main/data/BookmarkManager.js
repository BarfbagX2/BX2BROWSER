'use strict';

const path = require('node:path');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { app } = require('electron');
const { JsonStore } = require('./JsonStore');

const ROOT_ID = 'root';

function defaultData() {
  return {
    rootId: ROOT_ID,
    nodes: {
      [ROOT_ID]: { id: ROOT_ID, type: 'folder', title: 'Bookmarks', parentId: null, createdAt: Date.now() }
    }
  };
}

/**
 * Owns bookmarks and bookmark folders.
 *
 * Nodes are stored flat (an id -> node map with a `parentId` pointer)
 * rather than as a nested tree on disk. That makes moving, deleting and
 * looking up a node by id a plain map operation instead of a recursive tree
 * edit, at the cost of reconstructing the nested tree on read via
 * `getTree()` - which is cheap for the number of bookmarks a person
 * realistically has.
 */
class BookmarkManager extends EventEmitter {
  constructor() {
    super();
    const filePath = path.join(app.getPath('userData'), 'bookmarks.json');
    this._store = new JsonStore(filePath, defaultData());
  }

  _data() {
    return this._store.get();
  }

  /** Returns the bookmark tree rooted at `Bookmarks`, folders and bookmarks nested as children. */
  getTree() {
    const data = this._data();
    const build = (id) => {
      const node = data.nodes[id];
      if (!node) return null;
      if (node.type === 'folder') {
        const children = Object.values(data.nodes)
          .filter((n) => n.parentId === id)
          .sort((a, b) => a.createdAt - b.createdAt)
          .map((child) => build(child.id))
          .filter(Boolean);
        return { ...node, children };
      }
      return { ...node };
    };
    return build(data.rootId);
  }

  add({ url, title, parentId }) {
    if (!url) throw new Error('Bookmark requires a url');
    const targetParent = parentId && this._data().nodes[parentId] ? parentId : ROOT_ID;
    const node = {
      id: crypto.randomUUID(),
      type: 'bookmark',
      title: title && title.trim() ? title.trim() : url,
      url,
      parentId: targetParent,
      createdAt: Date.now()
    };
    this._store.update((data) => {
      data.nodes[node.id] = node;
    });
    this.emit('changed');
    return node;
  }

  createFolder({ title, parentId }) {
    const targetParent = parentId && this._data().nodes[parentId] ? parentId : ROOT_ID;
    const node = {
      id: crypto.randomUUID(),
      type: 'folder',
      title: title && title.trim() ? title.trim() : 'New Folder',
      parentId: targetParent,
      createdAt: Date.now()
    };
    this._store.update((data) => {
      data.nodes[node.id] = node;
    });
    this.emit('changed');
    return node;
  }

  _collectDescendantIds(id, data) {
    const ids = [];
    const stack = [id];
    while (stack.length) {
      const current = stack.pop();
      for (const node of Object.values(data.nodes)) {
        if (node.parentId === current) {
          ids.push(node.id);
          stack.push(node.id);
        }
      }
    }
    return ids;
  }

  remove(id) {
    if (id === ROOT_ID) return; // the root folder itself can't be deleted
    this._store.update((data) => {
      const toDelete = [id, ...this._collectDescendantIds(id, data)];
      for (const deleteId of toDelete) {
        delete data.nodes[deleteId];
      }
    });
    this.emit('changed');
  }

  /** Renames, edits the URL of, or moves (via `parentId`) an existing node. */
  update(id, patch) {
    if (id === ROOT_ID) return this.getTree();
    this._store.update((data) => {
      const node = data.nodes[id];
      if (!node) return;
      if (patch.title !== undefined) node.title = patch.title.trim() || node.title;
      if (patch.url !== undefined && node.type === 'bookmark') node.url = patch.url;
      if (patch.parentId !== undefined && patch.parentId !== node.parentId) {
        const newParent = data.nodes[patch.parentId];
        const movingIntoOwnDescendant =
          node.type === 'folder' && this._collectDescendantIds(id, data).includes(patch.parentId);
        if (newParent && newParent.type === 'folder' && !movingIntoOwnDescendant && patch.parentId !== id) {
          node.parentId = patch.parentId;
        }
      }
    });
    this.emit('changed');
    return this._data().nodes[id];
  }

  /** Returns whether a URL is already bookmarked, and the node id if so (for a toolbar star icon). */
  isBookmarked(url) {
    const match = Object.values(this._data().nodes).find((n) => n.type === 'bookmark' && n.url === url);
    return { bookmarked: Boolean(match), id: match ? match.id : null };
  }

  flushSync() {
    this._store.flushSync();
  }
}

module.exports = { BookmarkManager, ROOT_ID };
