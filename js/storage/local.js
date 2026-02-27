import { APP } from "../core/config.js";
import { normName } from "../utils/helpers.js";

export function loadSelected() {
  try {
    const raw = localStorage.getItem(APP.STORAGE_KEY_SELECTED);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    const set = new Set(Array.isArray(arr) ? arr : []);
    const normalized = new Set();
    for (const v of set) normalized.add(normName(v));
    return normalized;
  } catch {
    return new Set();
  }
}

export function saveSelected(set) {
  localStorage.setItem(APP.STORAGE_KEY_SELECTED, JSON.stringify(Array.from(set)));
}

export function loadIgnored() {
  try {
    const raw = localStorage.getItem(APP.STORAGE_KEY_IGNORED);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    const set = new Set(Array.isArray(arr) ? arr : []);
    const normalized = new Set();
    for (const v of set) normalized.add(normName(v));
    return Array.from(normalized);
  } catch {
    return [];
  }
}

export function saveIgnored(list) {
  const unique = Array.from(new Set((Array.isArray(list) ? list : []).map(normName)));
  localStorage.setItem(APP.STORAGE_KEY_IGNORED, JSON.stringify(unique));
}

export function loadIgnoredEtag() {
  return localStorage.getItem(APP.STORAGE_KEY_IGNORED_ETAG) || null;
}

export function saveIgnoredEtag(etag) {
  if (etag) localStorage.setItem(APP.STORAGE_KEY_IGNORED_ETAG, etag);
  else localStorage.removeItem(APP.STORAGE_KEY_IGNORED_ETAG);
}
