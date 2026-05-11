import { APP } from "../core/config.js";
import { davBaseFolderUrl, loadCreds, propfind } from "../dav/webdav.js";

/* =========================
   Auth Overlay Steuerung
   ========================= */

let selectedProvider = "nextcloud";

function showAuth() {
  document.getElementById("authOverlay")?.classList.remove("hidden");
}

function hideAuth() {
  document.getElementById("authOverlay")?.classList.add("hidden");
}

function showLogout() {
  document.getElementById("logoutOverlay")?.classList.remove("hidden");
}

function hideLogout() {
  document.getElementById("logoutOverlay")?.classList.add("hidden");
}

function normalizeBaseUrl(url) {
  return String(url || "").trim().replace(/\/+$/, "");
}

function ensureFolder(folder) {
  const f = String(folder || "").trim();
  if (!f) return "";
  return f.endsWith("/") ? f : f + "/";
}

function getEl(id) {
  return document.getElementById(id);
}

function setAuthLog(msg) {
  const el = getEl("authLog");
  if (el) el.textContent = msg;
}

function setLogoutLog(msg) {
  const el = getEl("logoutLog");
  if (el) el.textContent = msg;
}

function encodeSharePayload(payload) {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function decodeSharePayload(value) {
  try {
    const normalized = String(value || "").replaceAll("-", "+").replaceAll("_", "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (!data?.baseUrl || !data?.user || !data?.pass || !data?.folder) return null;
    return {
      provider: data.provider === "dav" ? "dav" : "nextcloud",
      baseUrl: normalizeBaseUrl(data.baseUrl),
      user: String(data.user),
      pass: String(data.pass),
      folder: ensureFolder(data.folder),
      remember: data.remember ?? true
    };
  } catch {
    return null;
  }
}

function readFormCredentials() {
  return {
    provider: selectedProvider,
    baseUrl: normalizeBaseUrl(getEl("authBaseUrl")?.value),
    user: getEl("authUser")?.value.trim() || "",
    pass: getEl("authPass")?.value || "",
    folder: ensureFolder(getEl("authFolder")?.value || "RezeptApp/"),
    remember: getEl("authRemember")?.checked ?? true
  };
}

function fillAuthForm(creds) {
  if (!creds) return;
  setProvider(creds.provider === "dav" ? "dav" : "nextcloud");
  getEl("authBaseUrl").value = creds.baseUrl || "";
  getEl("authUser").value = creds.user || "";
  getEl("authPass").value = creds.pass || "";
  getEl("authFolder").value = creds.folder || "RezeptApp/";
  getEl("authRemember").checked = creds.remember ?? true;
}

function normalizeComparableCreds(creds) {
  if (!creds) return null;
  return {
    provider: creds.provider === "dav" ? "dav" : "nextcloud",
    baseUrl: normalizeBaseUrl(creds.baseUrl),
    user: String(creds.user || ""),
    pass: String(creds.pass || ""),
    folder: ensureFolder(creds.folder || "")
  };
}

function areSameCredentials(a, b) {
  const left = normalizeComparableCreds(a);
  const right = normalizeComparableCreds(b);
  return !!left && !!right && JSON.stringify(left) === JSON.stringify(right);
}

function cleanSharedCredentialsFromUrl() {
  const cleanUrl = new URL(window.location.href);
  cleanUrl.searchParams.delete("creds");
  window.history.replaceState({}, "", cleanUrl.toString());
  return cleanUrl.toString();
}

function setProvider(provider) {
  selectedProvider = provider === "dav" ? "dav" : "nextcloud";

  const nextcloudBtn = getEl("authProviderNextcloud");
  const davBtn = getEl("authProviderDav");
  const baseLabel = getEl("authBaseUrlLabel");
  const baseHint = getEl("authBaseUrlHint");
  const testBtn = getEl("authTest");

  const active = "rounded-lg border border-blue-600 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-800";
  const inactive = "rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700";

  if (nextcloudBtn) nextcloudBtn.className = selectedProvider === "nextcloud" ? active : inactive;
  if (davBtn) davBtn.className = selectedProvider === "dav" ? active : inactive;

  if (baseLabel) {
    baseLabel.textContent = selectedProvider === "dav" ? "DAV-Basis-URL" : "Server-URL (Nextcloud oder Proxy)";
  }
  if (baseHint) {
    baseHint.textContent = selectedProvider === "dav"
      ? "Direkter WebDAV-Ordner, z.B. https://user.your-storagebox.de"
      : "Nextcloud-Basis, z.B. https://cloud.example.de";
  }
  if (testBtn) {
    testBtn.textContent = selectedProvider === "dav" ? "Test (PROPFIND)" : "Test (status.php)";
  }
}

async function testConnection(creds) {
  if (creds.provider === "dav") {
    const url = davBaseFolderUrl(creds);
    const res = await propfind(url, creds, "0");
    return { status: res.status, text: res.status === 207 ? `PROPFIND OK\n${url}` : res.text };
  }

  const r = await fetch(`${creds.baseUrl}/status.php`, { method: "GET" });
  const txt = await r.text();
  return { status: r.status, text: txt };
}

function buildShareUrl(creds) {
  const url = new URL(window.location.href);
  url.searchParams.set("creds", encodeSharePayload({
    provider: creds.provider,
    baseUrl: creds.baseUrl,
    user: creds.user,
    pass: creds.pass,
    folder: creds.folder,
    remember: creds.remember
  }));
  return url.toString();
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const input = document.createElement("textarea");
  input.value = text;
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  input.remove();
}

function updateLogoutDetails(creds) {
  const details = getEl("logoutDetails");
  if (!details) return;
  details.textContent = [
    `Typ: ${creds.provider === "dav" ? "WebDAV" : "Nextcloud"}`,
    `URL: ${creds.baseUrl}`,
    `User: ${creds.user}`,
    `Ordner: ${creds.folder}`
  ].join("\n");
}

export function setupAuthUi() {
  const btnAuth = getEl("btnAuth");
  const btnSaveGo = getEl("authSaveGo");
  const btnTest = getEl("authTest");
  const btnClear = getEl("authClear");
  const btnProviderNextcloud = getEl("authProviderNextcloud");
  const btnProviderDav = getEl("authProviderDav");
  const btnShare = getEl("authShareCredentials");
  const btnConfirmLogout = getEl("authConfirmLogout");
  const btnCancelLogout = getEl("authCancelLogout");

  setProvider("nextcloud");

  btnProviderNextcloud?.addEventListener("click", () => setProvider("nextcloud"));
  btnProviderDav?.addEventListener("click", () => setProvider("dav"));

  const sharedCreds = decodeSharePayload(new URLSearchParams(window.location.search).get("creds"));
  if (sharedCreds) {
    const existingCreds = loadCreds();
    const cleanUrl = cleanSharedCredentialsFromUrl();

    if (existingCreds && areSameCredentials(existingCreds, sharedCreds)) {
      if (btnAuth) btnAuth.textContent = "Logout";
    } else {
      const shouldUseSharedCreds = !existingCreds || window.confirm("Du bist bereits mit anderen Zugangsdaten eingeloggt. Mit den Zugangsdaten aus dem Link überschreiben?");
      if (shouldUseSharedCreds) {
        localStorage.setItem(APP.CREDS_KEY, JSON.stringify({ ...sharedCreds, remember: true }));
        window.location.replace(cleanUrl);
        return;
      }
    }
  }

  if (btnAuth) {
    btnAuth.addEventListener("click", () => {
      const creds = loadCreds();
      if (creds) {
        updateLogoutDetails(creds);
        setLogoutLog("");
        showLogout();
      } else {
        showAuth();
      }
    });
  }

  const existingRaw = localStorage.getItem(APP.CREDS_KEY);
  if (!sharedCreds && existingRaw) {
    try {
      fillAuthForm(JSON.parse(existingRaw));
      if (btnAuth) btnAuth.textContent = "Logout";
    } catch {}
  }

  if (btnSaveGo) {
    btnSaveGo.addEventListener("click", async () => {
      const obj = readFormCredentials();

      if (!obj.baseUrl || !obj.user || !obj.pass || !obj.folder) {
        setAuthLog("Bitte alle Felder ausfüllen.");
        return;
      }

      if (!obj.baseUrl.startsWith("https://") && !obj.baseUrl.includes("localhost") && !obj.baseUrl.startsWith("http://127.0.0.1")) {
        setAuthLog("HTTPS empfohlen/erforderlich. Basic Auth über HTTP ist unsicher.");
        return;
      }

      if (obj.remember) localStorage.setItem(APP.CREDS_KEY, JSON.stringify(obj));
      else localStorage.removeItem(APP.CREDS_KEY);

      if (btnAuth) btnAuth.textContent = "Logout";
      hideAuth();
      location.reload();
    });
  }

  if (btnTest) {
    btnTest.addEventListener("click", async () => {
      const obj = readFormCredentials();
      if (!obj.baseUrl) return setAuthLog("Bitte URL eintragen.");
      if (obj.provider === "dav" && (!obj.user || !obj.pass || !obj.folder)) {
        return setAuthLog("Bitte URL, Benutzername, Passwort und Ordner eintragen.");
      }
      try {
        setAuthLog("Teste Verbindung ...");
        const res = await testConnection(obj);
        setAuthLog(`HTTP ${res.status}\n${res.text}`);
      } catch (e) {
        setAuthLog("ERROR: " + e);
      }
    });
  }

  if (btnClear) {
    btnClear.addEventListener("click", () => {
      localStorage.removeItem(APP.CREDS_KEY);
      setProvider("nextcloud");
      getEl("authBaseUrl").value = "";
      getEl("authUser").value = "";
      getEl("authPass").value = "";
      getEl("authFolder").value = "RezeptApp/";
      getEl("authRemember").checked = true;
      if (btnAuth) btnAuth.textContent = "Login";
      setAuthLog("Zurückgesetzt.");
    });
  }

  btnCancelLogout?.addEventListener("click", hideLogout);

  btnConfirmLogout?.addEventListener("click", () => {
    localStorage.removeItem(APP.CREDS_KEY);
    if (btnAuth) btnAuth.textContent = "Login";
    hideLogout();
    showAuth();
    setAuthLog("Ausgeloggt.");
  });

  btnShare?.addEventListener("click", async () => {
    const creds = loadCreds();
    if (!creds) return setLogoutLog("Keine gespeicherten Zugangsdaten gefunden.");
    try {
      const shareUrl = buildShareUrl({ ...creds, remember: true });
      await copyText(shareUrl);
      setLogoutLog("Credentials-Link wurde in die Zwischenablage kopiert.");
    } catch (err) {
      setLogoutLog(`Link konnte nicht kopiert werden: ${err.message || err}`);
    }
  });

  if (!loadCreds()) showAuth();
}
