'use strict';

const { SEARCH_ENGINES, DEFAULT_SETTINGS } = require('../constants');

// A scheme followed by "//" - the unambiguous case: http://, https://, ftp://,
// file://, ws://, wss:// and so on. Always treated as a literal URL.
const EXPLICIT_SCHEME_WITH_AUTHORITY = /^[a-z][a-z0-9+.-]*:\/\//i;

// Schemes that are legitimately opaque (no "//" authority) and that a user
// might reasonably type directly. Anything else that merely *contains* a
// colon (e.g. "example.com:8080") is handled by the host:port check below
// instead of being misread as "scheme = example.com".
const KNOWN_OPAQUE_SCHEMES = /^(mailto|tel|sms|magnet|geo|market|whatsapp|slack|zoommtg|spotify|steam):/i;

// host:port, e.g. "localhost:3000", "192.168.1.1:8080", "myserver:9000/status".
const HOST_PORT_PATTERN = /^([a-zA-Z0-9.-]+):(\d{1,5})(\/[^\s]*)?$/;

const IP_LITERAL = /^((\d{1,3}\.){3}\d{1,3}|\[[0-9a-fA-F:]+\])(:\d+)?(\/[^\s]*)?(\?[^\s]*)?$/;

const LOCALHOST = /^localhost(:\d+)?(\/[^\s]*)?(\?[^\s]*)?$/i;

// A dotted hostname with a plausible last label, e.g. "example.com",
// "sub.example.co.uk/path?x=1". Deliberately structural rather than a strict
// public-suffix check - like a real browser omnibox, it's a heuristic, not a
// guarantee.
const DOMAIN_LIKE =
  /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(:\d{1,5})?(\/[^\s]*)?(\?[^\s]*)?(#[^\s]*)?$/;

/**
 * Turns whatever a person typed into the address bar into either a URL to
 * navigate to, or a search-engine query URL - mirroring the "is this a URL,
 * a bare domain, or a search?" heuristic every modern browser omnibox uses.
 *
 * @param {string} rawInput
 * @param {string} searchEngineId one of the keys in SEARCH_ENGINES
 * @returns {{ type: 'url' | 'search', url: string, displayQuery?: string } | null}
 *   null if rawInput is empty/whitespace-only.
 */
function resolveAddressBarInput(rawInput, searchEngineId = DEFAULT_SETTINGS.searchEngine) {
  const trimmed = (rawInput || '').trim();
  if (!trimmed) return null;

  if (!/\s/.test(trimmed)) {
    const hostPortMatch = trimmed.match(HOST_PORT_PATTERN);
    if (hostPortMatch) {
      const host = hostPortMatch[1];
      const isLocalOrIp = /^localhost$/i.test(host) || /^(\d{1,3}\.){3}\d{1,3}$/.test(host) || !host.includes('.');
      return { type: 'url', url: `${isLocalOrIp ? 'http' : 'https'}://${trimmed}` };
    }
    if (EXPLICIT_SCHEME_WITH_AUTHORITY.test(trimmed) || KNOWN_OPAQUE_SCHEMES.test(trimmed)) {
      return { type: 'url', url: trimmed };
    }
    if (LOCALHOST.test(trimmed) || IP_LITERAL.test(trimmed)) {
      return { type: 'url', url: `http://${trimmed}` };
    }
    if (DOMAIN_LIKE.test(trimmed)) {
      return { type: 'url', url: `https://${trimmed}` };
    }
  }

  return { type: 'search', url: buildSearchUrl(trimmed, searchEngineId), displayQuery: trimmed };
}

function buildSearchUrl(query, searchEngineId) {
  const engine = SEARCH_ENGINES[searchEngineId] || SEARCH_ENGINES[DEFAULT_SETTINGS.searchEngine];
  return engine.searchUrl.replace('{searchTerms}', encodeURIComponent(query));
}

/** True for the two protocols a browser tab should navigate to directly. */
function isWebProtocol(urlString) {
  try {
    const { protocol } = new URL(urlString);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

module.exports = { resolveAddressBarInput, buildSearchUrl, isWebProtocol };
