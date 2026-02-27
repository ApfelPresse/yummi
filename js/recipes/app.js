import { loadAllRecipesFromDav } from "./loader.js";
import { loadSelected, saveSelected, saveIgnored } from "../storage/local.js";
import { placeholderDataUri, isIgnoredIngredient } from "../utils/helpers.js";
import { setupAuthUi } from "../auth/auth-ui.js";
import {
  showError,
  hideError,
  showLoading,
  hideLoading,
  normalizeIngredient,
  shouldIgnoreIngredient,
  getRecipeImageUrl as getRecipeImageUrlShared,
  escapeHtml,
  setIgnoredIngredients
} from "../core/shared.js";
import {
  applyIgnoredFromLocal,
  syncIgnoredFromDav,
  saveIgnoredToDav,
  getCredsOrThrow
} from "../ignore/ignore.js";

// ===== State =====
let recipes = [];
let allIngredients = [];
let allIngredientsAll = [];
let allCategories = [];

let categoryFilter = "alle";
let searchQuery = "";

const selected = loadSelected();
let ignoredSet = applyIgnoredFromLocal();

// ===== DOM =====
const elChips = document.getElementById("ingredientChips");
const elRecipeList = document.getElementById("recipeList");
const elSelectedCount = document.getElementById("selectedCount");
const elTotalCount = document.getElementById("totalCount");
const elCategorySelect = document.getElementById("categorySelect");
const elSearchInput = document.getElementById("searchInput");
const elResultInfo = document.getElementById("resultInfo");
const elIngredientSearch = document.getElementById("ingredientSearch");
const elOnlySelectedToggle = document.getElementById("onlySelectedToggle");
const btnScrollToRecipes = document.getElementById("btnScrollToRecipes");
const elIgnoreChips = document.getElementById("ignoreChips");
const btnToggleIgnore = document.getElementById("btnToggleIgnore");
const ignoreBody = document.getElementById("ignoreBody");
const elIgnoreSearch = document.getElementById("ignoreSearch");


// ===== Chips UI =====
function chipClass(isOn) {
  return [
    "px-3 py-1.5 rounded-full text-sm border transition",
    isOn
      ? "bg-blue-600 border-blue-600 text-white hover:bg-blue-700"
      : "bg-white border-gray-300 text-gray-800 hover:bg-gray-50"
  ].join(" ");
}

function ignoreChipClass(isOn) {
  return [
    "px-3 py-1.5 rounded-full text-sm border transition",
    isOn
      ? "bg-red-600 border-red-600 text-white hover:bg-red-700"
      : "bg-white border-gray-300 text-gray-800 hover:bg-gray-50"
  ].join(" ");
}

function makeChip(item) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.dataset.key = item.key;
  btn.className = chipClass(selected.has(item.key));
  btn.textContent = item.label;
  btn.onclick = () => {
    if (selected.has(item.key)) selected.delete(item.key);
    else selected.add(item.key);
    saveSelected(selected);
    updateChips();
    renderChips();
    render();
  };
  return btn;
}

function makeIgnoreChip(item) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.dataset.key = item.key;
  btn.className = ignoreChipClass(ignoredSet.has(item.key));
  btn.textContent = item.label;
  btn.onclick = async () => {
    console.log('[DEBUG] Ignore chip clicked:', item.label, 'key:', item.key);
    if (ignoredSet.has(item.key)) {
      ignoredSet.delete(item.key);
      console.log('[DEBUG] Removed from ignoredSet:', item.key);
    } else {
      ignoredSet.add(item.key);
      console.log('[DEBUG] Added to ignoredSet:', item.key);
    }
    console.log('[DEBUG] ignoredSet size:', ignoredSet.size, 'contents:', Array.from(ignoredSet));

    if (selected.has(item.key)) {
      selected.delete(item.key);
      saveSelected(selected);
      console.log('[DEBUG] Removed from selected:', item.key);
    }

    console.log('[DEBUG] Calling persistIgnored()...');
    await persistIgnored();
    console.log('[DEBUG] Calling rebuildIngredientLists()...');
    rebuildIngredientLists();
    console.log('[DEBUG] rebuildIngredientLists() done');
  };
  return btn;
}

function initChips() {
  elTotalCount.textContent = String(allIngredients.length);
  renderChips();
  updateChips();
}

function renderChips() {
  const q = (elIngredientSearch?.value || "").trim().toLowerCase();
  const onlySelected = !!elOnlySelectedToggle?.checked;

  elChips.innerHTML = "";

  for (const ing of allIngredients) {
    if (onlySelected && !selected.has(ing.key)) continue;
    if (q && !ing.label.toLowerCase().includes(q) && !ing.key.includes(q)) continue;
    elChips.appendChild(makeChip(ing));
  }
}

function updateChips() {
  elSelectedCount.textContent = String(selected.size);
  for (const btn of elChips.querySelectorAll("button[data-key]")) {
    btn.className = chipClass(selected.has(btn.dataset.key));
  }
}

function renderIgnoreChips() {
  if (!elIgnoreChips) return;
  const q = (elIgnoreSearch?.value || "").trim().toLowerCase();
  elIgnoreChips.innerHTML = "";
  for (const ing of allIngredientsAll) {
    if (q && !ing.label.toLowerCase().includes(q) && !ing.key.includes(q)) continue;
    elIgnoreChips.appendChild(makeIgnoreChip(ing));
  }
}

function pruneSelected() {
  let changed = false;
  for (const key of Array.from(selected)) {
    if (ignoredSet.has(key)) {
      selected.delete(key);
      changed = true;
    }
  }
  if (changed) saveSelected(selected);
}

function rebuildIngredientLists() {
  console.log('[DEBUG] rebuildIngredientLists() START');
  buildIngredientsAndCategories();
  console.log('[DEBUG] After buildIngredientsAndCategories: allIngredients.length =', allIngredients.length, 'allIngredientsAll.length =', allIngredientsAll.length);
  pruneSelected();
  initChips();
  renderIgnoreChips();
  render();
  console.log('[DEBUG] rebuildIngredientLists() END');
}

async function persistIgnored() {
  console.log('[DEBUG] persistIgnored() START, ignoredSet:', Array.from(ignoredSet));
  try {
    const creds = getCredsOrThrow();
    console.log('[DEBUG] Got creds, calling saveIgnoredToDav...');
    ignoredSet = await saveIgnoredToDav(creds, Array.from(ignoredSet));
    console.log('[DEBUG] saveIgnoredToDav success, ignoredSet:', Array.from(ignoredSet));
  } catch (err) {
    console.error('[DEBUG] persistIgnored() FAILED:', err);
    const local = Array.from(ignoredSet);
    saveIgnored(local);
    setIgnoredIngredients(local);
    console.warn('[DEBUG] Saved to localStorage instead:', local);
    console.warn("Ignore-Liste nicht synchronisiert:", err.message || err);
    showError("Ignore-Liste lokal gespeichert, Sync fehlgeschlagen.");
  }
  console.log('[DEBUG] persistIgnored() END');
}

function initCategorySelect() {
  elCategorySelect.innerHTML = `<option value="alle">Alle Kategorien</option>`;
  for (const c of allCategories) {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    elCategorySelect.appendChild(opt);
  }
}

// ===== Matching / Sorting =====
function computeMatch(recipe) {
  const names = (recipe.ingredients || [])
    .map(i => i && i.name)
    .filter(Boolean)
    .filter(n => !shouldIgnoreIngredient(n));

  const keys = names.map(normalizeIngredient);
  const total = keys.length;
  const have = keys.filter(k => selected.has(k));
  const missing = keys.filter(k => !selected.has(k));
  const score = total === 0 ? 0 : have.length / total;
  return { have, missing, score, total };
}

function passesFilters(recipe) {
  if (categoryFilter !== "alle" && recipe.category !== categoryFilter) return false;
  if (!searchQuery) return true;

  const q = searchQuery.toLowerCase();
  return (recipe.title || "").toLowerCase().includes(q)
      || (recipe.description || "").toLowerCase().includes(q)
      || (recipe.ingredients || []).some(i => (i.name || "").toLowerCase().includes(q));
}

function render() {
  const filtered = recipes.filter(passesFilters);
  const enriched = filtered.map(r => ({ r, ...computeMatch(r) }));

  enriched.sort((a,b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.missing.length !== b.missing.length) return a.missing.length - b.missing.length;
    return (a.r.title || "").localeCompare((b.r.title || ""), "de");
  });

  elResultInfo.textContent = `${enriched.length} Rezept(e)`;

  elRecipeList.innerHTML = "";
  for (const item of enriched) elRecipeList.appendChild(renderCard(item));
}

function renderCard({ r, have, missing, score, total }) {
  const div = document.createElement("div");
  div.className = "bg-white rounded-2xl shadow-sm hover:shadow-md transition overflow-hidden flex flex-col cursor-pointer";

  const percent = Math.round(score * 100);

  const recipeNames = (r.ingredients || [])
    .map(i => i && i.name)
    .filter(Boolean)
    .filter(n => !shouldIgnoreIngredient(n));

  const keyToLabel = new Map();
  for (const n of recipeNames) {
    const k = normalizeIngredient(n);
    if (!keyToLabel.has(k)) keyToLabel.set(k, n);
  }

  const missingLabels = missing.map(k => keyToLabel.get(k) || k);
  const missingPreview = missingLabels.slice(0, 3).map(escapeHtml).join(", ");
  const missingMore = missingLabels.length > 3 ? ` +${missingLabels.length - 3} mehr` : "";

  const meta = r.meta || {};
  const timeTxt = `${(meta.prepMin ?? 0) + (meta.cookMin ?? 0)} Min`;
  const servingsTxt = meta.servings ? `${meta.servings} Portionen` : "—";

  const fallback = placeholderDataUri(r.title || r.id);

  div.innerHTML = `
    <div class="relative">
      <img data-recipe-id="${escapeHtml(r.id)}" src="${fallback}" alt=""
           class="w-full h-32 object-cover recipe-image" />
      <div class="absolute top-3 left-3">
        <span class="text-xs font-medium px-2 py-1 rounded-full bg-white/90 border border-gray-200">
          ${escapeHtml(r.category || "")}
        </span>
      </div>
      <div class="absolute top-3 right-3">
        <span class="text-xs font-semibold px-2 py-1 rounded-full ${percent === 100 ? "bg-green-600 text-white" : "bg-gray-900 text-white"}">
          ${percent}% Match
        </span>
      </div>
    </div>

    <div class="p-4 flex flex-col gap-3">
      <div>
        <h2 class="text-lg font-semibold leading-snug">${escapeHtml(r.title || "")}</h2>
        <p class="text-sm text-gray-600 mt-1 line-clamp-2">${escapeHtml(r.description || "")}</p>

        <div class="mt-2 flex flex-wrap gap-2 text-xs text-gray-600">
          <span class="px-2 py-1 rounded-full bg-gray-100 border border-gray-200">⏱️ ${escapeHtml(timeTxt)}</span>
          <span class="px-2 py-1 rounded-full bg-gray-100 border border-gray-200">🍽️ ${escapeHtml(servingsTxt)}</span>
        </div>

        <p class="text-sm text-gray-600 mt-2">${have.length}/${total} Zutaten vorhanden</p>
      </div>

      <div class="text-sm">
        ${missing.length === 0
          ? `<div class="text-green-700 font-medium">✔ Es fehlt nichts</div>`
          : `<div class="text-red-700"><span class="font-medium">Fehlt:</span> ${missingPreview}${missingMore}</div>`
        }
      </div>
    </div>
  `;

  const targetUrl = `recipe.html?id=${encodeURIComponent(r.id)}`;
  div.setAttribute("role", "button");
  div.setAttribute("tabindex", "0");
  div.addEventListener("click", () => {
    window.location.href = targetUrl;
  });
  div.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      window.location.href = targetUrl;
    }
  });
  
  // Bild asynchron aus Cache laden
  getRecipeImageUrlShared(r.id).then(url => {
    const img = div.querySelector(".recipe-image");
    if (img && url) {
      img.src = url;
    }
  }).catch(() => {
    // Bei Fehler bleibt Placeholder
  });
  
  return div;
}

// ===== Controls =====
document.getElementById("btnAll").onclick = () => {
  selected.clear();
  for (const ing of allIngredients) selected.add(ing.key);
  saveSelected(selected);
  updateChips();
  renderChips();
  render();
};

document.getElementById("btnNone").onclick = () => {
  selected.clear();
  saveSelected(selected);
  updateChips();
  renderChips();
  render();
};

if (btnScrollToRecipes && elRecipeList) {
  btnScrollToRecipes.addEventListener("click", () => {
    const header = document.querySelector("header");
    const offset = header ? header.offsetHeight + 12 : 0;
    const top = elRecipeList.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: "smooth" });
  });
}

elCategorySelect.onchange = () => {
  categoryFilter = elCategorySelect.value;
  render();
};

elSearchInput.oninput = () => {
  searchQuery = elSearchInput.value.trim();
  render();
};

elIngredientSearch.oninput = () => {
  renderChips();
  updateChips();
};

elOnlySelectedToggle.onchange = () => {
  renderChips();
  updateChips();
};

if (btnToggleIgnore && ignoreBody) {
  btnToggleIgnore.addEventListener("click", () => {
    const isHidden = ignoreBody.classList.toggle("hidden");
    btnToggleIgnore.textContent = isHidden ? "Ausklappen" : "Einklappen";
  });
}

if (elIgnoreSearch) {
  elIgnoreSearch.addEventListener("input", () => {
    renderIgnoreChips();
  });
}

document.getElementById("btnNewRecipe").onclick = () => {
  window.location.href = "edit.html?new=1";
};

setupAuthUi();

// ===== Boot =====
(async function boot() {
  try {
    showLoading("Lade Rezepte...");
    
    // Progress-Updates während des Ladens
    window.addEventListener("recipeLoadProgress", (e) => {
      const { loaded, total, mode } = e.detail;
      if (mode === "initial") {
        showLoading(`Lade Rezepte: ${loaded}/${total}...`);
      }
    });
    
    // Background-Sync Updates
    window.addEventListener("recipesUpdated", async (e) => {
      const { count } = e.detail;
      console.log(`🔄 ${count} Rezepte aktualisiert, lade neu...`);
      
      // Rezepte neu laden & UI updaten
      const { loadAllRecipesFromDav } = await import("./loader.js");
      recipes = await loadAllRecipesFromDav();
      
      // UI komplett neu rendern
      buildIngredientsAndCategories();
      initCategorySelect();
      pruneSelected();
      initChips();
      renderIgnoreChips();
      render();
    });
    
    // NEU: lädt aus Cache (instant) oder von Nextcloud (initial)
    recipes = await loadAllRecipesFromDav();

    try {
      const creds = getCredsOrThrow();
      ignoredSet = await syncIgnoredFromDav(creds);
    } catch (err) {
      console.warn("Ignore-Liste Sync fehlgeschlagen:", err.message || err);
    }
    
    showLoading(`${recipes.length} Rezepte geladen, verarbeite Zutaten...`);

    buildIngredientsAndCategories();
    initCategorySelect();
    pruneSelected();
    initChips();
    renderIgnoreChips();
    render();
    
    // Bilder asynchron nachladen (wenn nicht in Cache)
    showLoading("Bilder werden im Hintergrund geladen...");
    (async () => {
      try {
        const { loadCreds } = await import("../dav/webdav.js");
        const { loadAndCacheImage } = await import("./loader.js");
        const creds = loadCreds();
        
        if (creds?.user && creds?.pass) {
          console.log("🖼️ Starte Background-Bild-Cache...");
          for (const recipe of recipes) {
            // Asynchron, nicht blockierend
            loadAndCacheImage(recipe.id, creds).catch(err => {
              console.warn(`⚠️ Bild ${recipe.id} konnte nicht geladen werden:`, err.message);
            });
          }
        }
      } catch (err) {
        console.warn("Fehler beim Background-Bild-Caching:", err);
      }
    })();
    
    hideLoading();
  } catch (e) {
    hideLoading();
    showError(
      `Konnte Rezepte nicht laden. ` +
      `Prüfe: Login-Daten korrekt? Server erreichbar? Ordner mit Rezepten vorhanden?`
    );
    console.error("Fehler beim Laden:", e);
  }
})();

function buildIngredientsAndCategories() {
  console.log('[DEBUG] buildIngredientsAndCategories() START, ignoredSet size:', ignoredSet.size);
  // Zutaten global
  const map = new Map(); // key -> label
  for (const r of recipes) {
    for (const i of (r.ingredients || [])) {
      if (!i || !i.name) continue;
      if (isIgnoredIngredient(i.name)) continue;

      const key = normalizeIngredient(i.name);
      if (!key) continue;

      if (!map.has(key)) map.set(key, String(i.name).trim());
    }
  }

  allIngredientsAll = Array.from(map.entries())
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "de"));
  console.log('[DEBUG] allIngredientsAll built, length:', allIngredientsAll.length);

  // Pantry-Liste: ohne dynamisch ignorierte Zutaten
  allIngredients = allIngredientsAll.filter((ing) => !ignoredSet.has(ing.key));
  console.log('[DEBUG] allIngredients filtered, length:', allIngredients.length, 'filtered out:', allIngredientsAll.length - allIngredients.length);

  allCategories = Array.from(new Set(
    recipes.map(r => r.category).filter(Boolean)
  )).sort((a,b)=>a.localeCompare(b,'de'));
}

// Debug-Funktionen für Browser-Konsole (nur mit ?debug=1)
if (new URLSearchParams(window.location.search).get("debug") === "1") {
  window.debugRecipeApp = {
    async clearCache() {
      const { clearCache } = await import("../storage/db.js");
      await clearCache();
      console.log("✅ Cache gelöscht. Seite neu laden für Fresh-Load.");
    },
    async showCacheInfo() {
      const { getAllRecipesFromCache, getAllMetadata, getAllImagesFromCache } = await import("../storage/db.js");
      const recipes = await getAllRecipesFromCache();
      const metadata = await getAllMetadata();
      console.log(`📦 ${recipes.length} Rezepte im Cache`);
      console.log(`🏷️ ${metadata.size} Metadaten-Einträge`);
      
      // Bilder im Cache prüfen
      try {
        const images = await getAllImagesFromCache?.();
        console.log(`🖼️ ${images?.length || 0} Bilder im Cache`);
      } catch {
        console.log("🖼️ Keine Bilder im Cache");
      }
      
      return { recipes: recipes.length, metadata: metadata.size };
    }
  };
  console.log("🐛 Debug-Modus aktiv. Verfügbar: window.debugRecipeApp");
}
