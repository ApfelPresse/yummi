import { APP } from "../core/config.js";
import { loadCreds } from "../dav/webdav.js";

/* =========================
   Auth Overlay Steuerung
   ========================= */

function showAuth() {
  document.getElementById("authOverlay")?.classList.remove("hidden");
}
function hideAuth() {
  document.getElementById("authOverlay")?.classList.add("hidden");
}

function normalizeBaseUrl(url) {
  return String(url || "").trim().replace(/\/+$/, "");
}
function ensureFolder(folder) {
  const f = String(folder || "").trim();
  if (!f) return "";
  return f.endsWith("/") ? f : f + "/";
}

function setAuthLog(msg) {
  const el = document.getElementById("authLog");
  if (el) el.textContent = msg;
}

async function testStatus(baseUrl) {
  const r = await fetch(`${baseUrl}/status.php`, { method: "GET" });
  const txt = await r.text();
  return { status: r.status, text: txt };
}

export function setupAuthUi() {
  const btnAuth = document.getElementById("btnAuth");
  const btnSaveGo = document.getElementById("authSaveGo");
  const btnTest = document.getElementById("authTest");
  const btnClear = document.getElementById("authClear");

  // Login / Logout Button
  if (btnAuth) {
    btnAuth.addEventListener("click", () => {
      const creds = loadCreds();
      if (creds) {
        localStorage.removeItem(APP.CREDS_KEY);
        btnAuth.textContent = "Login";
        setAuthLog("Ausgeloggt.");
        showAuth();
      } else {
        showAuth();
      }
    });
  }

  // Vorbefüllen
  const existingRaw = localStorage.getItem(APP.CREDS_KEY);
  if (existingRaw) {
    try {
      const c = JSON.parse(existingRaw);
      document.getElementById("authBaseUrl").value = c.baseUrl || "";
      document.getElementById("authUser").value = c.user || "";
      document.getElementById("authPass").value = c.pass || "";
      document.getElementById("authFolder").value = c.folder || "RezeptApp/";
      document.getElementById("authRemember").checked = c.remember ?? true;
      if (btnAuth) btnAuth.textContent = "Logout";
    } catch {}
  }

  // Speichern & Laden
  if (btnSaveGo) {
    btnSaveGo.addEventListener("click", async () => {
      const baseUrl = normalizeBaseUrl(document.getElementById("authBaseUrl").value);
      const user = document.getElementById("authUser").value.trim();
      const pass = document.getElementById("authPass").value;
      const folder = ensureFolder(document.getElementById("authFolder").value || "RezeptApp/");
      const remember = document.getElementById("authRemember").checked;

      if (!baseUrl || !user || !pass || !folder) {
        setAuthLog("Bitte alle Felder ausfüllen.");
        return;
      }

      // HTTPS-Pflicht (außer localhost)
      if (!baseUrl.startsWith("https://") && !baseUrl.includes("localhost") && !baseUrl.startsWith("http://127.0.0.1")) {
        setAuthLog("⚠️ HTTPS erforderlich! Basic Auth über HTTP ist unsicher.");
        return;
      }

      const obj = { baseUrl, user, pass, folder, remember };
      if (remember) localStorage.setItem(APP.CREDS_KEY, JSON.stringify(obj));
      else localStorage.removeItem(APP.CREDS_KEY);

      if (btnAuth) btnAuth.textContent = "Logout";
      hideAuth();

      // Minimal & robust: App neu starten
      location.reload();
    });
  }

  // status.php Test
  if (btnTest) {
    btnTest.addEventListener("click", async () => {
      const baseUrl = normalizeBaseUrl(document.getElementById("authBaseUrl").value);
      if (!baseUrl) return setAuthLog("Bitte Server-URL eintragen.");
      try {
        setAuthLog("Teste Verbindung …");
        const res = await testStatus(baseUrl);
        setAuthLog(`HTTP ${res.status}\n${res.text}`);
      } catch (e) {
        setAuthLog("ERROR: " + e);
      }
    });
  }

  // Reset
  if (btnClear) {
    btnClear.addEventListener("click", () => {
      localStorage.removeItem(APP.CREDS_KEY);
      document.getElementById("authBaseUrl").value = "";
      document.getElementById("authUser").value = "";
      document.getElementById("authPass").value = "";
      document.getElementById("authFolder").value = "RezeptApp/";
      document.getElementById("authRemember").checked = true;
      if (btnAuth) btnAuth.textContent = "Login";
      setAuthLog("Zurückgesetzt.");
    });
  }

  // Automatisch Login anzeigen, wenn nötig
  if (!loadCreds()) showAuth();
}
