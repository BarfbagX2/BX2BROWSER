'use strict';

/**
 * Plain state holder for one browser tab. TabManager owns the actual
 * behavior (creating/destroying its WebContentsView, wiring events); this
 * class is just the data plus a `toJSON()` shaped for the chrome UI.
 *
 * `status`:
 *   'newtab'  - no content view exists yet; chrome renders the New Tab page.
 *   'content' - a real page is loaded (or loading) in `view`.
 *   'crashed' - `view` exists but its renderer process died; chrome renders
 *               a "this tab crashed" overlay with a reload action.
 */
class Tab {
  constructor(id) {
    this.id = id;
    this.view = null;
    this.status = 'newtab';
    this.url = '';
    this.title = 'New Tab';
    this.favicon = null;
    this.isLoading = false;
    this.canGoBack = false;
    this.canGoForward = false;
    this.lastError = null;
  }

  toJSON() {
    return {
      id: this.id,
      status: this.status,
      url: this.url,
      title: this.title,
      favicon: this.favicon,
      isLoading: this.isLoading,
      canGoBack: this.canGoBack,
      canGoForward: this.canGoForward,
      lastError: this.lastError
    };
  }
}

module.exports = { Tab };
