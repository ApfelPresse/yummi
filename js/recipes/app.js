import { loadAllRecipesFromDav } from "./loader.js";
import {
  loadSelected,
  saveSelected,
  saveIgnored,
  loadMealPlanSelectedRecipes,
  saveMealPlanSelectedRecipes
} from "../storage/local.js";
import { saveRecipeToCache, saveMetadata } from "../storage/db.js";
import { placeholderDataUri, isIgnoredIngredient } from "../utils/helpers.js";
import { setupAuthUi } from "../auth/auth-ui.js";
import { APP } from "../core/config.js";
import { APP_VERSION } from "../core/version.js";
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
import {
  openIngredientDetailsPopup,
  hasIngredientData,
  forceReloadIngredientDetails
} from "../ingredients/ingredient-details.js";
import { loadCreds, davBaseFolderUrl, put, mkcol } from "../dav/webdav.js";

// ===== State =====
let recipes = [];
let allIngredients = [];
let allIngredientsAll = [];
let allCategories = [];

let categoryFilter = "alle";
let searchQuery = "";
const selectedRecipeIds = loadMealPlanSelectedRecipes();

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
const btnToggleIngredients = document.getElementById("btnToggleIngredients");
const ingredientsBody = document.getElementById("ingredientsBody");
const elIgnoreSearch = document.getElementById("ignoreSearch");
const elNutrientChips = document.getElementById("nutrientChips");
const btnToggleNutrients = document.getElementById("btnToggleNutrients");
const btnReloadNutrients = document.getElementById("btnReloadNutrients");
const nutrientBody = document.getElementById("nutrientBody");
const elNutrientSearch = document.getElementById("nutrientSearch");
const elNutrientLoadingHint = document.getElementById("nutrientLoadingHint");
const btnCleanup = document.getElementById("btnCleanup");

let nutrientLoadRequestId = 0;
const APP_DATA_VERSION_KEY = "yummi_app_data_version";

function setNutrientLoading(isLoading) {
  if (!elNutrientLoadingHint) return;
  elNutrientLoadingHint.classList.toggle("hidden", !isLoading);
}


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
  btn.onclick = async () => {
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
    
    showLoading("Bitte warten...");
    
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
    
    hideLoading();
  };
  return btn;
}

function nutrientChipClass(isOn) {
  return [
    "px-3 py-1.5 rounded-full text-sm border transition relative",
    isOn
      ? "bg-green-600 border-green-600 text-white hover:bg-green-700"
      : "bg-white border-gray-300 text-gray-800 hover:bg-gray-50"
  ].join(" ");
}

function makeNutrientChip(item, hasData) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.dataset.key = item.key;
  btn.className = nutrientChipClass(false);
  btn.textContent = item.label;
  
  // Roter Punkt, wenn keine Daten vorhanden
  if (!hasData) {
    const dot = document.createElement("span");
    dot.className = "absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full";
    btn.appendChild(dot);
  }
  
  btn.onclick = async () => {
    const result = await openIngredientDetailsPopup(item.label, item.key);
    if (result) {
      await renderNutrientChips();
    }
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
    if (q && !ingredientMatchesQuery(ing, q)) continue;
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
    if (q && !ingredientMatchesQuery(ing, q)) continue;
    elIgnoreChips.appendChild(makeIgnoreChip(ing));
  }
}

// ===== Nährstoffdetails =====
async function renderNutrientChips() {
  if (!elNutrientChips) return;
  const currentRequestId = ++nutrientLoadRequestId;
  setNutrientLoading(true);

  const q = (elNutrientSearch?.value || "").trim().toLowerCase();
  elNutrientChips.innerHTML = "";
  
  const creds = loadCreds();

  try {
    // Im Nährstoff-Tab immer alle Zutaten anzeigen (auch ignorierte).
    for (const ing of allIngredientsAll) {
      if (q && !ingredientMatchesQuery(ing, q)) continue;
      
      // Überprüfe, ob Nährstoffdaten vorhanden sind
      const hasData = creds ? await hasIngredientData(creds, ing.key) : false;

      // Nur das neueste Render-Ergebnis in den DOM schreiben.
      if (currentRequestId !== nutrientLoadRequestId) return;
      elNutrientChips.appendChild(makeNutrientChip(ing, hasData));
    }
  } finally {
    if (currentRequestId === nutrientLoadRequestId) {
      setNutrientLoading(false);
    }
  }
}

async function reloadNutrientDetailsCache() {
  const creds = loadCreds();
  if (!creds) {
    showError("Keine Nextcloud-Anmeldung gefunden. Reload nicht möglich.");
    return;
  }

  hideError();
  showLoading("Nährstoffdetails werden neu geladen...");

  try {
    let done = 0;
    const total = allIngredientsAll.length;

    for (const ing of allIngredientsAll) {
      // Invalidiert Cache und lädt den Datensatz frisch vom Server.
      await forceReloadIngredientDetails(creds, ing.key);
      done += 1;
      if (done % 10 === 0 || done === total) {
        showLoading(`Nährstoffdetails Reload: ${done}/${total}`);
      }
    }

    await renderNutrientChips();
  } catch (err) {
    console.error("Nährstoffdetails Reload fehlgeschlagen:", err);
    showError("Reload der Nährstoffdetails fehlgeschlagen.");
  } finally {
    hideLoading();
  }
}

function updateNutrientChips() {
  if (!elNutrientChips) return;
  for (const btn of elNutrientChips.querySelectorAll("button[data-key]")) {
    btn.className = nutrientChipClass(false);
  }
}

function ingredientMatchesQuery(ingredient, q) {
  if (!q) return true;
  if (ingredient.label.toLowerCase().includes(q) || ingredient.key.includes(q)) return true;
  return (ingredient.variants || []).some((variant) => variant.toLowerCase().includes(q));
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
      <button type="button" class="absolute bottom-3 right-3 w-8 h-8 rounded-full bg-white/90 border border-gray-300 text-gray-800 hover:bg-white flex items-center justify-center js-select-recipe" aria-label="Rezept auswählen">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M12 5v14m-7-7h14" /></svg>
      </button>
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

      <div class="hidden js-plan-hint text-xs font-medium px-2 py-1 rounded-lg bg-blue-50 text-blue-800 border border-blue-200 w-fit">
        Rezept zum Essensplan hinzugefügt
      </div>
    </div>
  `;

  const targetUrl = `recipe.html?id=${encodeURIComponent(r.id)}`;
  const selectButton = div.querySelector(".js-select-recipe");
  const planHint = div.querySelector(".js-plan-hint");
  const setSelectedState = (isSelected) => {
    if (isSelected) {
      selectedRecipeIds.add(r.id);
      saveMealPlanSelectedRecipes(selectedRecipeIds);
      div.classList.add("ring-2", "ring-blue-500", "ring-offset-2");
      planHint.classList.remove("hidden");
      selectButton.setAttribute("aria-label", "Rezeptauswahl aufheben");
      return;
    }

    selectedRecipeIds.delete(r.id);
    saveMealPlanSelectedRecipes(selectedRecipeIds);
    div.classList.remove("ring-2", "ring-blue-500", "ring-offset-2");
    planHint.classList.add("hidden");
    selectButton.setAttribute("aria-label", "Rezept auswählen");
  };
  const toggleSelectedState = () => setSelectedState(!selectedRecipeIds.has(r.id));

  setSelectedState(selectedRecipeIds.has(r.id));

  div.setAttribute("role", "button");
  div.setAttribute("tabindex", "0");
  let longPressTriggered = false;
  let longPressTimer = null;

  div.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch") return;
    longPressTriggered = false;
    longPressTimer = window.setTimeout(() => {
      longPressTriggered = true;
      toggleSelectedState();
    }, 450);
  });

  const clearLongPress = () => {
    if (!longPressTimer) return;
    window.clearTimeout(longPressTimer);
    longPressTimer = null;
  };

  div.addEventListener("pointerup", clearLongPress);
  div.addEventListener("pointercancel", clearLongPress);
  div.addEventListener("pointerleave", clearLongPress);

  div.addEventListener("click", () => {
    if (longPressTriggered) {
      longPressTriggered = false;
      return;
    }
    window.location.href = targetUrl;
  });
  div.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    toggleSelectedState();
  });
  div.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      window.location.href = targetUrl;
    }
  });

  if (selectButton) {
    selectButton.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleSelectedState();
    });
  }
  
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

// ===== Cleanup Popup =====
let cleanupOverlay = null;

function joinUrl(base, rel) {
  const b = base.replace(/\/+$/, "");
  const r = rel.replace(/^\/+/, "");
  return `${b}/${r}`;
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll('"', "&quot;");
}

function getIngredientUsage() {
  const usage = new Map();

  for (const recipe of recipes) {
    for (const ingredient of (recipe.ingredients || [])) {
      const name = String(ingredient?.name || "").trim();
      const key = normalizeIngredient(name);
      if (!name || !key) continue;

      const entry = usage.get(key) || {
        key,
        label: name,
        count: 0,
        recipeIds: new Set(),
        variants: new Set()
      };

      entry.count += 1;
      entry.recipeIds.add(recipe.id);
      entry.variants.add(name);
      if (name.length < entry.label.length) entry.label = name;
      usage.set(key, entry);
    }
  }

  return Array.from(usage.values())
    .map(item => {
      const variants = Array.from(item.variants).sort((a, b) => a.localeCompare(b, "de"));
      return {
        ...item,
        variants,
        hasInconsistentVariants: variants.length > 1,
        hasAllCapsVariant: variants.some(isAllCapsIngredient),
        recipeCount: item.recipeIds.size
      };
    })
    .sort(compareIngredientCleanupItems);
}

function isAllCapsIngredient(name) {
  const letters = String(name || "").match(/\p{L}/gu) || [];
  if (letters.length < 2) return false;
  return letters.some(letter => letter !== letter.toLocaleLowerCase("de"))
    && letters.every(letter => letter === letter.toLocaleUpperCase("de"));
}

function compareIngredientCleanupItems(a, b) {
  const priorityA = (a.hasInconsistentVariants ? 2 : 0) + (a.hasAllCapsVariant ? 1 : 0);
  const priorityB = (b.hasInconsistentVariants ? 2 : 0) + (b.hasAllCapsVariant ? 1 : 0);
  if (priorityA !== priorityB) return priorityB - priorityA;
  if (b.variants.length !== a.variants.length) return b.variants.length - a.variants.length;
  return a.label.localeCompare(b.label, "de");
}

function findIngredientRenameMatches(fromName) {
  const fromKey = normalizeIngredient(fromName);
  if (!fromKey) return [];

  const matches = [];
  for (const recipe of recipes) {
    const ingredients = recipe.ingredients || [];
    const hits = ingredients.filter(ingredient => normalizeIngredient(ingredient?.name) === fromKey);
    if (hits.length > 0) {
      matches.push({ recipe, count: hits.length });
    }
  }
  return matches;
}

function countIngredientRenameChanges(matches, toName) {
  return matches.reduce((sum, { recipe }) => {
    return sum + (recipe.ingredients || []).filter((ingredient) => {
      return String(ingredient?.name || "").trim() !== toName;
    }).length;
  }, 0);
}

function updateCleanupRenamePreview(overlay) {
  const fromInput = overlay.querySelector("#cleanup-rename-from");
  const toInput = overlay.querySelector("#cleanup-rename-to");
  const preview = overlay.querySelector("#cleanup-rename-preview");
  const applyBtn = overlay.querySelector("#cleanup-rename-apply");
  if (!fromInput || !toInput || !preview || !applyBtn) return;

  const fromName = fromInput.value.trim();
  const toName = toInput.value.trim();
  const matches = findIngredientRenameMatches(fromName);
  const occurrenceCount = matches.reduce((sum, item) => sum + item.count, 0);
  const changeCount = countIngredientRenameChanges(matches, toName);

  applyBtn.disabled = !fromName || !toName || matches.length === 0 || changeCount === 0;
  applyBtn.classList.toggle("opacity-50", applyBtn.disabled);
  applyBtn.classList.toggle("cursor-not-allowed", applyBtn.disabled);

  if (!fromName) {
    preview.textContent = "Wähle oder tippe eine Zutat, um die betroffenen Rezepte zu sehen.";
    return;
  }

  if (matches.length === 0) {
    preview.textContent = `Keine Vorkommen für "${fromName}" gefunden.`;
    return;
  }

  const recipeTitles = matches
    .slice(0, 4)
    .map(item => item.recipe.title || item.recipe.id)
    .join(", ");
  const more = matches.length > 4 ? ` +${matches.length - 4} weitere` : "";
  preview.textContent = `${occurrenceCount} Vorkommen in ${matches.length} Rezept(en), ${changeCount} Änderung(en): ${recipeTitles}${more}`;
}

function renderCleanupIngredientResults(overlay) {
  const search = overlay.querySelector("#cleanup-ingredient-search");
  const list = overlay.querySelector("#cleanup-ingredient-results");
  if (!search || !list) return;

  const q = search.value.trim().toLowerCase();
  const items = getIngredientUsage()
    .filter(item => item.hasInconsistentVariants || item.hasAllCapsVariant || !q || ingredientMatchesQuery(item, q))
    .slice(0, 30);

  list.innerHTML = items.length === 0
    ? `<div class="px-3 py-2 text-sm text-gray-500">Keine Zutaten gefunden.</div>`
    : items.map(item => `
        <button type="button" data-cleanup-pick-key="${escapeAttr(item.key)}"
          class="w-full text-left px-3 py-2 rounded-lg hover:bg-blue-50 text-sm flex items-center justify-between gap-3">
          <span class="min-w-0">
            <span class="block truncate">
              ${escapeHtml(item.label)}
              ${item.hasInconsistentVariants ? `<span class="ml-1 text-xs font-medium text-amber-700">Varianten</span>` : ""}
              ${item.hasAllCapsVariant ? `<span class="ml-1 text-xs font-medium text-red-700">GROSS</span>` : ""}
            </span>
            ${item.variants.length > 1 ? `<span class="block truncate text-xs text-gray-500">${escapeHtml(item.variants.join(", "))}</span>` : ""}
          </span>
          <span class="text-xs text-gray-500 shrink-0">${item.count}x / ${item.recipeCount} Rez.</span>
        </button>
      `).join("");
}

async function applyIngredientRename(overlay) {
  const fromName = overlay.querySelector("#cleanup-rename-from")?.value.trim() || "";
  const toName = overlay.querySelector("#cleanup-rename-to")?.value.trim() || "";
  const matches = findIngredientRenameMatches(fromName);

  if (!fromName || !toName || matches.length === 0) return;

  const occurrenceCount = matches.reduce((sum, item) => sum + item.count, 0);
  const ok = confirm(`${occurrenceCount} Vorkommen in ${matches.length} Rezept(en) von "${fromName}" zu "${toName}" umbenennen?`);
  if (!ok) return;

  const creds = loadCreds();
  if (!creds) {
    showError("Keine Nextcloud-Anmeldung gefunden. Cleanup kann nicht speichern.");
    return;
  }

  const fromKey = normalizeIngredient(fromName);
  const baseFolder = davBaseFolderUrl(creds);
  const recipesFolder = joinUrl(baseFolder, APP.RECIPES_SUBFOLDER);

  hideError();
  showLoading("Zutaten werden umbenannt...");

  try {
    let done = 0;

    for (const { recipe } of matches) {
      const updatedRecipe = JSON.parse(JSON.stringify(recipe));
      for (const ingredient of (updatedRecipe.ingredients || [])) {
        if (normalizeIngredient(ingredient?.name) === fromKey) {
          ingredient.name = toName;
        }
      }

      const url = joinUrl(recipesFolder, `${encodeURIComponent(updatedRecipe.id)}.json`);
      const response = await put(
        url,
        creds,
        JSON.stringify(updatedRecipe, null, 2),
        { "Content-Type": "application/json; charset=utf-8" }
      );

      let saveResponse = response;
      if (saveResponse.status === 409) {
        const mkcolResponse = await mkcol(recipesFolder, creds);
        if (![201, 405].includes(mkcolResponse.status)) {
          throw new Error(`Ordner ${APP.RECIPES_SUBFOLDER} konnte nicht angelegt werden (HTTP ${mkcolResponse.status})`);
        }

        saveResponse = await put(
          url,
          creds,
          JSON.stringify(updatedRecipe, null, 2),
          { "Content-Type": "application/json; charset=utf-8" }
        );
      }

      if (saveResponse.status < 200 || saveResponse.status >= 300) {
        throw new Error(`Speichern von ${updatedRecipe.id}.json fehlgeschlagen (HTTP ${saveResponse.status})`);
      }

      await saveRecipeToCache(updatedRecipe);
      await saveMetadata(`${updatedRecipe.id}.json`, {
        etag: saveResponse.headers?.get("ETag") || null,
        lastModified: new Date().toISOString()
      });

      const idx = recipes.findIndex(item => item.id === updatedRecipe.id);
      if (idx !== -1) recipes[idx] = updatedRecipe;

      done += 1;
      showLoading(`Zutaten werden umbenannt: ${done}/${matches.length}`);
    }

    if (selected.has(fromKey)) {
      selected.delete(fromKey);
      selected.add(normalizeIngredient(toName));
      saveSelected(selected);
    }

    if (ignoredSet.has(fromKey)) {
      ignoredSet.delete(fromKey);
      ignoredSet.add(normalizeIngredient(toName));
      await persistIgnored();
    }

    buildIngredientsAndCategories();
    pruneSelected();
    initChips();
    renderIgnoreChips();
    renderNutrientChips().catch(err => {
      console.warn("Nährstoffdetails nach Cleanup konnten nicht geladen werden:", err);
    });
    render();

    overlay.querySelector("#cleanup-rename-from").value = toName;
    overlay.querySelector("#cleanup-rename-to").value = "";
    renderCleanupIngredientResults(overlay);
    updateCleanupRenamePreview(overlay);
  } catch (err) {
    console.error("Cleanup fehlgeschlagen:", err);
    showError(`Cleanup fehlgeschlagen: ${err.message}`);
  } finally {
    hideLoading();
  }
}

function getOrCreateCleanupOverlay() {
  if (cleanupOverlay) return cleanupOverlay;

  cleanupOverlay = document.createElement("div");
  cleanupOverlay.id = "cleanupOverlay";
  cleanupOverlay.className = "hidden fixed inset-x-0 top-0 z-50";
  cleanupOverlay.style.height = "100dvh";
  document.body.appendChild(cleanupOverlay);
  return cleanupOverlay;
}

function closeCleanupPopup() {
  getOrCreateCleanupOverlay().classList.add("hidden");
}

function openCleanupPopup() {
  const overlay = getOrCreateCleanupOverlay();

  overlay.innerHTML = `
    <div class="absolute inset-0 bg-black/40" id="cleanup-backdrop"></div>
    <div class="relative h-full flex items-end sm:items-center justify-center px-0 pt-0 sm:p-4 pointer-events-none"
      style="padding-bottom: max(1rem, env(safe-area-inset-bottom, 0px) + 1rem);">
      <div class="w-full sm:max-w-xl bg-white rounded-2xl shadow-xl flex flex-col overflow-hidden pointer-events-auto"
        style="max-height: calc(100dvh - max(2rem, env(safe-area-inset-bottom, 0px) + 2rem));">
        <div class="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
          <div>
            <h2 class="text-lg font-semibold">Cleanup</h2>
            <p class="text-xs text-gray-500 mt-0.5">Werkzeuge zum Aufräumen deiner Rezeptdaten</p>
          </div>
          <button id="cleanup-close" type="button"
            class="p-1 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-800 shrink-0">✕</button>
        </div>

        <div class="overflow-y-auto flex-1 px-5 py-4 space-y-3">
          <div class="border border-gray-200 rounded-xl overflow-hidden">
            <button id="cleanup-toggle-rename" type="button"
              class="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-800 bg-gray-50 hover:bg-gray-100">
              <span>Zutaten umbenennen</span>
              <span id="cleanup-rename-icon">▾</span>
            </button>

            <div id="cleanup-rename-body" class="hidden p-4 space-y-3">
              <input id="cleanup-ingredient-search" type="search" placeholder="Zutat suchen..."
                class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" />

              <div id="cleanup-ingredient-results" class="max-h-52 overflow-y-auto rounded-xl border border-gray-200 p-1"></div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label class="block">
                  <span class="text-xs text-gray-500">Umbenennen von</span>
                  <input id="cleanup-rename-from" type="text"
                    class="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" />
                </label>
                <label class="block">
                  <span class="text-xs text-gray-500">Umbenennen nach</span>
                  <input id="cleanup-rename-to" type="text"
                    class="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" />
                </label>
              </div>

              <div id="cleanup-rename-preview" class="rounded-xl bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-700">
                Wähle oder tippe eine Zutat, um die betroffenen Rezepte zu sehen.
              </div>

              <button id="cleanup-rename-apply" type="button" disabled
                class="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 opacity-50 cursor-not-allowed">
                In allen Rezepten umbenennen
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>`;

  overlay.classList.remove("hidden");
  renderCleanupIngredientResults(overlay);
  updateCleanupRenamePreview(overlay);

  overlay.querySelector("#cleanup-backdrop")?.addEventListener("click", closeCleanupPopup);
  overlay.querySelector("#cleanup-close")?.addEventListener("click", closeCleanupPopup);
  overlay.querySelector("#cleanup-toggle-rename")?.addEventListener("click", () => {
    const body = overlay.querySelector("#cleanup-rename-body");
    const icon = overlay.querySelector("#cleanup-rename-icon");
    const isHidden = body.classList.toggle("hidden");
    if (icon) icon.textContent = isHidden ? "▾" : "▴";
  });
  overlay.querySelector("#cleanup-ingredient-search")?.addEventListener("input", () => {
    renderCleanupIngredientResults(overlay);
  });
  overlay.querySelector("#cleanup-rename-from")?.addEventListener("input", () => {
    updateCleanupRenamePreview(overlay);
  });
  overlay.querySelector("#cleanup-rename-to")?.addEventListener("input", () => {
    updateCleanupRenamePreview(overlay);
  });
  overlay.querySelector("#cleanup-ingredient-results")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-cleanup-pick-key]");
    if (!btn) return;
    const picked = getIngredientUsage().find(item => item.key === btn.dataset.cleanupPickKey);
    overlay.querySelector("#cleanup-rename-from").value = picked?.label || "";
    overlay.querySelector("#cleanup-rename-to").value = picked?.label || "";
    updateCleanupRenamePreview(overlay);
  });
  overlay.querySelector("#cleanup-rename-apply")?.addEventListener("click", () => {
    applyIngredientRename(overlay);
  });
}

async function loadRecipesForCurrentAppVersion() {
  const storedVersion = localStorage.getItem(APP_DATA_VERSION_KEY);

  if (storedVersion === APP_VERSION) {
    return await loadAllRecipesFromDav();
  }

  console.log(`[VERSION] App-Version geändert: ${storedVersion || "keine"} -> ${APP_VERSION}`);
  showLoading("Neue App-Version erkannt, lade Rezepte frisch...");

  try {
    const { forceReloadAllRecipesFromDav } = await import("./loader.js");
    const freshRecipes = await forceReloadAllRecipesFromDav();
    localStorage.setItem(APP_DATA_VERSION_KEY, APP_VERSION);
    return freshRecipes;
  } catch (err) {
    console.warn("Versions-Refresh fehlgeschlagen, nutze bestehenden Offline-Cache:", err);
    const fallbackRecipes = await loadAllRecipesFromDav();
    if (fallbackRecipes.length > 0) {
      return fallbackRecipes;
    }
    throw err;
  }
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

if (btnCleanup) {
  btnCleanup.addEventListener("click", openCleanupPopup);
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

const setToggleIcon = (button, isHidden) => {
  button.setAttribute("aria-label", isHidden ? "Ausklappen" : "Einklappen");
  button.innerHTML = isHidden
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="m6 9 6 6 6-6" /></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="m18 15-6-6-6 6" /></svg>`;
};

if (btnToggleIgnore && ignoreBody) {

  btnToggleIgnore.addEventListener("click", () => {
    const isHidden = ignoreBody.classList.toggle("hidden");
    setToggleIcon(btnToggleIgnore, isHidden);
  });

  setToggleIcon(btnToggleIgnore, ignoreBody.classList.contains("hidden"));
}

if (btnToggleIngredients && ingredientsBody) {
  btnToggleIngredients.addEventListener("click", () => {
    const isHidden = ingredientsBody.classList.toggle("hidden");
    setToggleIcon(btnToggleIngredients, isHidden);
  });

  setToggleIcon(btnToggleIngredients, ingredientsBody.classList.contains("hidden"));
}

if (elIgnoreSearch) {
  elIgnoreSearch.addEventListener("input", () => {
    renderIgnoreChips();
  });
}

if (btnToggleNutrients && nutrientBody) {
  btnToggleNutrients.addEventListener("click", () => {
    const isHidden = nutrientBody.classList.toggle("hidden");
    setToggleIcon(btnToggleNutrients, isHidden);
  });

  setToggleIcon(btnToggleNutrients, nutrientBody.classList.contains("hidden"));
}

if (btnReloadNutrients) {
  btnReloadNutrients.addEventListener("click", async () => {
    await reloadNutrientDetailsCache();
  });
}

if (elNutrientSearch) {
  elNutrientSearch.addEventListener("input", () => {
    renderNutrientChips();
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
      const { count, recipes: syncedRecipes } = e.detail;
      console.log(`🔄 ${count} Rezepte aktualisiert, lade neu...`);
      
      // Der Sync liefert den kompletten aktualisierten Cache direkt mit.
      recipes = Array.isArray(syncedRecipes) ? syncedRecipes : await loadAllRecipesFromDav();
      
      // UI komplett neu rendern
      buildIngredientsAndCategories();
      initCategorySelect();
      pruneSelected();
      initChips();
      renderIgnoreChips();
      render();

      // Nährstoffdetails immer im Hintergrund vorladen (unabhängig vom Accordion-Zustand)
      renderNutrientChips().catch(err => {
        console.warn("Background-Nährstoffdetails konnten nicht geladen werden:", err);
      });
    });
    
    // Lädt bei gleicher App-Version cache-first, bei neuer Version einmal frisch.
    recipes = await loadRecipesForCurrentAppVersion();

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

    // Nährstoffdetails immer im Hintergrund vorladen (unabhängig vom Accordion-Zustand)
    renderNutrientChips().catch(err => {
      console.warn("Background-Nährstoffdetails konnten nicht geladen werden:", err);
    });
    
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
  const map = new Map(); // key -> { label, variants }
  for (const r of recipes) {
    for (const i of (r.ingredients || [])) {
      if (!i || !i.name) continue;
      if (isIgnoredIngredient(i.name)) continue;

      const key = normalizeIngredient(i.name);
      if (!key) continue;

      const name = String(i.name).trim();
      const entry = map.get(key) || { label: name, variants: new Set() };
      entry.variants.add(name);
      if (!map.has(key)) map.set(key, entry);
    }
  }

  allIngredientsAll = Array.from(map.entries())
    .map(([key, entry]) => ({ key, label: entry.label, variants: Array.from(entry.variants) }))
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
