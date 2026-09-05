'use strict';

/*
 * Every export here is a fixed, hand-authored string constant - never
 * built from tab titles, URLs, or any other page-supplied data. That's
 * what makes it safe for callers to assign these to `.innerHTML` directly
 * instead of building DOM nodes by hand for every icon.
 */

export const DEFAULT_FAVICON_ICON = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5v17"/></svg>';

export const CLOSE_ICON = '<svg viewBox="0 0 24 24"><path d="M5 5l14 14M19 5L5 19"/></svg>';

export const RELOAD_ICON =
  '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 0 1 14.5-4.5M20 12a8 8 0 0 1-14.5 4.5"/><path d="M18 4v4h-4M6 20v-4h4"/></svg>';

export const STOP_ICON = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';

export const FOLDER_ICON =
  '<svg viewBox="0 0 24 24"><path d="M4 7.5a1.5 1.5 0 0 1 1.5-1.5h4l2 2h7A1.5 1.5 0 0 1 20 9.5v7A1.5 1.5 0 0 1 18.5 18h-13A1.5 1.5 0 0 1 4 16.5v-9z"/></svg>';

export const CHEVRON_RIGHT_ICON = '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>';

export const CHEVRON_DOWN_ICON = '<svg viewBox="0 0 24 24"><path d="M5 9l7 7 7-7"/></svg>';

export const TRASH_ICON =
  '<svg viewBox="0 0 24 24"><path d="M5 7h14M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-.8 12a1.5 1.5 0 0 1-1.5 1.4H8.3a1.5 1.5 0 0 1-1.5-1.4L6 7"/></svg>';

export const PAUSE_ICON = '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>';

export const RESUME_ICON = '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z"/></svg>';

export const FOLDER_OPEN_ICON =
  '<svg viewBox="0 0 24 24"><path d="M4 8h5l2 2h7l-1.5 8h-11z"/><path d="M4 8V6.5A1.5 1.5 0 0 1 5.5 5h3.5l2 2"/></svg>';
