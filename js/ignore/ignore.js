import { APP } from "../core/config.js";
import { normName } from "../utils/helpers.js";
import { loadCreds, davBaseFolderUrl, get, put } from "../dav/webdav.js";
import { loadIgnored, saveIgnored, loadIgnoredEtag, saveIgnoredEtag } from "../storage/local.js";
import { setIgnoredIngredients } from "../core/shared.js";

function joinUrl(base, rel) {
  const b = String(base || "").replace(/\/+$/, "");
  const r = String(rel || "").replace(/^\/+/, "");
  return `${b}/${r}`;
}

function normalizeIgnoreList(list) {
  const arr = Array.isArray(list) ? list : [];
  const normalized = arr.map(normName).filter(Boolean);
  return Array.from(new Set(normalized));
}

export function getIgnoreFileUrl(creds) {
  const baseFolder = davBaseFolderUrl(creds);
  return joinUrl(baseFolder, "ignore.json");
}

export function applyIgnoredFromLocal() {
  const list = normalizeIgnoreList(loadIgnored());
  setIgnoredIngredients(list);
  return new Set(list);
}

export async function syncIgnoredFromDav(creds) {
  const url = getIgnoreFileUrl(creds);
  const res = await get(url, creds);

  if (res.status === 404) {
    saveIgnored([]);
    saveIgnoredEtag(null);
    setIgnoredIngredients([]);
    return new Set();
  }

  if (res.status !== 200) {
    throw new Error(`ignore.json laden fehlgeschlagen (HTTP ${res.status})`);
  }

  const etag = res.headers?.get("ETag") || null;
  const prevEtag = loadIgnoredEtag();

  if (etag && prevEtag && etag === prevEtag) {
    const list = normalizeIgnoreList(loadIgnored());
    setIgnoredIngredients(list);
    return new Set(list);
  }

  let parsed = [];
  try {
    const data = JSON.parse(res.text || "[]");
    parsed = normalizeIgnoreList(data);
  } catch {
    parsed = [];
  }

  saveIgnored(parsed);
  saveIgnoredEtag(etag);
  setIgnoredIngredients(parsed);
  return new Set(parsed);
}

export async function saveIgnoredToDav(creds, list) {
  const normalized = normalizeIgnoreList(list);
  const url = getIgnoreFileUrl(creds);
  const body = JSON.stringify(normalized, null, 2);

  const res = await put(url, creds, body, { "Content-Type": "application/json" });
  if (![200, 201, 204].includes(res.status)) {
    throw new Error(`ignore.json speichern fehlgeschlagen (HTTP ${res.status})`);
  }

  const etag = res.headers?.get("ETag") || null;
  saveIgnored(normalized);
  saveIgnoredEtag(etag);
  setIgnoredIngredients(normalized);
  return new Set(normalized);
}

export function getLocalIgnoredSet() {
  return new Set(normalizeIgnoreList(loadIgnored()));
}

export function getCredsOrThrow() {
  const creds = loadCreds();
  if (!creds) throw new Error("Keine Nextcloud-Credentials gefunden");
  return creds;
}
