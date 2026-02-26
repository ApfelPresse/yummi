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
