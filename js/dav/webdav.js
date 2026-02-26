import { APP } from "../core/config.js";

function authHeader(user, pass) {
  return "Basic " + btoa(`${user}:${pass}`);
}

function normalizeBaseUrl(url) {
  return String(url || "").replace(/\/+$/, "");
}

function ensureSlashEnd(path) {
  if (!path) return "";
  return path.endsWith("/") ? path : path + "/";
}

export function loadCreds() {
  const raw = localStorage.getItem(APP.CREDS_KEY);
  if (!raw) return null;
  try {
    const c = JSON.parse(raw);
    if (!c?.baseUrl || !c?.user || !c?.pass || !c?.folder) return null;
    return {
      baseUrl: normalizeBaseUrl(c.baseUrl),
      user: String(c.user),
      pass: String(c.pass),
      folder: ensureSlashEnd(String(c.folder))
    };
  } catch {
    return null;
  }
}

export function davBaseFolderUrl(creds) {
  // creds.folder ist z.B. "RezeptApp/"
  const user = encodeURIComponent(creds.user);
  const segments = creds.folder.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  return `${creds.baseUrl}${APP.DAV_PREFIX}/remote.php/dav/files/${user}/${segments ? segments + "/" : ""}`;
}

export async function propfind(url, creds, depth = "1") {
  const r = await fetch(url, {
    method: "PROPFIND",
    headers: {
      "Authorization": authHeader(creds.user, creds.pass),
      "Depth": depth
    }
  });
  const text = await r.text();
  return { status: r.status, statusText: r.statusText, text, headers: r.headers };
}

export async function get(url, creds) {
  const r = await fetch(url, {
    method: "GET",
    headers: { "Authorization": authHeader(creds.user, creds.pass) }
  });
  const text = await r.text();
  return { status: r.status, statusText: r.statusText, text, headers: r.headers };
}

export async function put(url, creds, body, extraHeaders = {}) {
  const r = await fetch(url, {
    method: "PUT",
    headers: {
      "Authorization": authHeader(creds.user, creds.pass),
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders
    },
    body
  });
  return { status: r.status, statusText: r.statusText, headers: r.headers, text: await r.text() };
}

export async function del(url, creds) {
  const r = await fetch(url, {
    method: "DELETE",
    headers: { "Authorization": authHeader(creds.user, creds.pass) }
  });
  return { status: r.status, statusText: r.statusText, text: await r.text(), headers: r.headers };
}

export function parseMultiStatus(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "application/xml");
  const pe = doc.getElementsByTagName("parsererror")[0];
  if (pe) return { error: "XML Parse Error", items: [] };

  const responses = [...doc.getElementsByTagNameNS("*", "response")];
  const items = responses.map((resp) => {
    const href = resp.getElementsByTagNameNS("*", "href")[0]?.textContent ?? "";
    const displayName = resp.getElementsByTagNameNS("*", "displayname")[0]?.textContent ?? "";

    const rt = resp.getElementsByTagNameNS("*", "resourcetype")[0];
    const isCollection = !!rt && rt.getElementsByTagNameNS("*", "collection").length > 0;

    const sizeEl = resp.getElementsByTagNameNS("*", "getcontentlength")[0];
    const size = sizeEl ? Number(sizeEl.textContent) : null;

    const etagEl = resp.getElementsByTagNameNS("*", "getetag")[0];
    const etag = etagEl?.textContent ?? null;

    return { href, displayName, isCollection, size, etag };
  });

  return { error: null, items };
}
