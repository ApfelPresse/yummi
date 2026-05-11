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

function joinUrl(base, rel) {
  const b = String(base || "").replace(/\/+$/, "");
  const r = String(rel || "").replace(/^\/+/, "");
  return r ? `${b}/${r}` : `${b}/`;
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
      folder: ensureSlashEnd(String(c.folder)),
      provider: c.provider === "dav" ? "dav" : "nextcloud"
    };
  } catch {
    return null;
  }
}

export function davBaseFolderUrl(creds) {
  if (creds.provider === "dav") {
    return joinUrl(creds.baseUrl, creds.folder);
  }

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

export async function mkcol(url, creds) {
  const r = await fetch(url, {
    method: "MKCOL",
    headers: {
      "Authorization": authHeader(creds.user, creds.pass)
    }
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

// Neue Hilfsfunktion: Stellt sicher, dass eine DAV-Collection existiert.
// Wenn die Collection fehlt, versucht sie mit MKCOL zu erstellen.
// Bei 409 (Conflict) wird rekursiv der Parent-Ordner erstellt.
export async function ensureCollection(url, creds) {
  try {
    const pf = await propfind(url, creds, "0");
    // Wenn existiert (207 Multi-Status oder 200 OK), nichts zu tun
    if (pf.status === 207 || pf.status === 200) return { ok: true, created: false };

    // Wenn 404, versuchen wir MKCOL
    if (pf.status === 404) {
      const mk = await mkcol(url, creds);
      // MKCOL: 201 Created ist Erfolg. 405 Method Not Allowed kann auftreten wenn bereits existiert.
      if (mk.status === 201 || mk.status === 405) return { ok: true, created: mk.status === 201 };

      // 409 Conflict → Parent fehlt. Erstelle Parent rekursiv.
      if (mk.status === 409) {
        try {
          const u = new URL(url);
          // Entferne eventuell trailing slash und letzten Segment
          let path = u.pathname.replace(/\/+$|^\/+/, "");
          const segments = path.split('/').filter(Boolean);
          if (segments.length <= 1) {
            // Keine Parent mehr aufzubauen
            return { ok: false, error: `MKCOL Conflict and cannot determine parent for ${url}` };
          }
          segments.pop();
          u.pathname = '/' + segments.join('/') + '/';
          const parentUrl = u.toString();

          // Rekursiv Parent erstellen
          const parentRes = await ensureCollection(parentUrl, creds);
          if (!parentRes.ok) return { ok: false, error: `Failed to create parent ${parentUrl}` };

          // Retry MKCOL für original URL
          const mk2 = await mkcol(url, creds);
          if (mk2.status === 201 || mk2.status === 405) return { ok: true, created: mk2.status === 201 };
          return { ok: false, error: `MKCOL failed after creating parent: ${mk2.status} ${mk2.statusText}` };
        } catch (err) {
          return { ok: false, error: err.message };
        }
      }

      return { ok: false, error: `MKCOL failed: ${mk.status} ${mk.statusText}` };
    }

    // Andere Fehler
    return { ok: false, error: `PROPFIND failed: ${pf.status} ${pf.statusText}` };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
