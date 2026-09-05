'use strict';

/**
 * A deliberately tiny central store: one plain object, a set of listeners,
 * and a couple of derived-data helpers. There's no dependency tracking or
 * selective re-rendering - every module that calls `subscribe()` re-runs
 * its own render on every change and figures out what actually needs to
 * update. That's a fine trade for a UI this size, and it keeps every
 * feature module's rendering logic in one easy-to-read place instead of
 * spread across fine-grained subscriptions.
 *
 * The main process is the single source of truth for anything it owns
 * (tabs, bookmarks, downloads, settings): renderer code calls an API method
 * and then waits for the corresponding push event to update this store,
 * rather than optimistically mutating state itself. `state.panel` is the
 * one exception, since which overlay panel is showing is purely a renderer
 * UI concern the main process doesn't need to track in detail (it only
 * needs the open/closed boolean, to know whether to hide tab content).
 */

const listeners = new Set();

const state = {
  tabs: [],
  activeTabId: null,
  settings: null,
  bookmarksTree: null,
  downloads: [],
  panel: { open: false, active: 'history' }
};

export function getState() {
  return state;
}

export function setState(patch) {
  Object.assign(state, patch);
  for (const listener of listeners) listener(state);
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getActiveTab() {
  return state.tabs.find((tab) => tab.id === state.activeTabId) || null;
}

/** Depth-first search of the bookmarks tree for a bookmark with this exact URL. */
export function findBookmarkByUrl(url) {
  const root = state.bookmarksTree;
  if (!root || !url) return null;
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node.type === 'bookmark' && node.url === url) return node;
    if (node.children) stack.push(...node.children);
  }
  return null;
}
