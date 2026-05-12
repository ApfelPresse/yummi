import { loadAllRecipesFromDav } from "./loader.js";
import { createDataCacheTools, loadRecipesForCurrentAppVersion } from "./cache-maintenance.js";
import { createRecipeCleanupTools } from "./cleanup-tools.js";
import {
  loadSelected,
  saveSelected,
  saveIgnored,
  loadMealPlanSelectedRecipes,
  saveMealPlanSelectedRecipes
} from "../storage/local.js";
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
import { loadCreds } from "../dav/webdav.js";

// ===== State =====
let recipes = [];
let allIngredients = [];
let allIngredientsAll = [];
let allCategories = [];

let categoryFilter = "alle";
let searchQuery = "";
let ingredientDetailsModulePromise = null;
const selectedRecipeIds = loadMealPlanSelectedRecipes();
const MEAL_PLAN_DAY_ASSIGNMENTS_KEY = "meal_plan_day_assignments_v1";
const MEAL_PLAN_TARGET_DAY_KEY = "meal_plan_target_day_v1";

const selected = loadSelected();
let ignoredSet = applyIgnoredFromLocal();

function getIngredientDetailsModule() {
  if (!ingredientDetailsModulePromise) {
    ingredientDetailsModulePromise = import("../ingredients/ingredient-details.js");
  }
  return ingredientDetailsModulePromise;
}

// ===== DOM =====
const elChips = document.getElementById("ingredientChips");
const elRecipeList = document.getElementById("recipeList");
const appHeader = document.getElementById("appHeader");
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
const btnClearDataCache = document.getElementById("btnClearDataCache");

let nutrientLoadRequestId = 0;
let recipeImageObserver = null;

function yieldToBrowser(timeout = 120) {
  return new Promise((resolve) => {
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(resolve, { timeout });
      return;
    }
    window.setTimeout(resolve, 0);
  });
}

function scheduleIdleTask(fn, delay = 0) {
  window.setTimeout(() => {
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(fn, { timeout: 1500 });
      return;
    }
    window.setTimeout(fn, 0);
  }, delay);
}

async function loadRecipeImageForElement(img) {
  const recipeId = img?.dataset?.recipeId;
  if (!recipeId || img.dataset.imageLoaded === "1") return;
  img.dataset.imageLoaded = "1";

  try {
    let url = await getRecipeImageUrlShared(recipeId);
    if (img.isConnected && url) img.src = url;

    const needsRemoteImage = !url || String(url).startsWith("data:");
    const creds = loadCreds();
    if (!needsRemoteImage || !creds?.user || !creds?.pass) return;

    const { loadAndCacheImage } = await import("./loader.js");
    const didLoad = await loadAndCacheImage(recipeId, creds);
    if (!didLoad || !img.isConnected) return;

    url = await getRecipeImageUrlShared(recipeId);
    if (url && !String(url).startsWith("data:")) img.src = url;
  } catch (err) {
    console.warn(`Bild ${recipeId} konnte nicht geladen werden:`, err.message || err);
  }
}

function getRecipeImageObserver() {
  if (!("IntersectionObserver" in window)) return null;
  if (recipeImageObserver) return recipeImageObserver;

  recipeImageObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const img = entry.target;
      recipeImageObserver.unobserve(img);
      loadRecipeImageForElement(img);
    }
  }, { rootMargin: "500px 0px", threshold: 0.01 });

  return recipeImageObserver;
}

function observeRecipeImage(img) {
  const observer = getRecipeImageObserver();
  if (!observer) {
    loadRecipeImageForElement(img);
    return;
  }
  observer.observe(img);
}

function setNutrientLoading(isLoading) {
  if (!elNutrientLoadingHint) return;
  elNutrientLoadingHint.classList.toggle("hidden", !isLoading);
}

function setupAutoHideHeader() {
  if (!appHeader) return;

  let lastScrollY = window.scrollY;
  let ticking = false;
  const minDelta = 8;
  const revealAtTop = 80;

  const update = () => {
    const currentY = window.scrollY;
    const delta = currentY - lastScrollY;

    if (currentY <= revealAtTop) {
      appHeader.classList.remove("is-hidden");
    } else if (Math.abs(delta) >= minDelta) {
      appHeader.classList.toggle("is-hidden", delta > 0);
    }

    lastScrollY = currentY;
    ticking = false;
  };

  window.addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(update);
  }, { passive: true });
}

function loadMealPlanDayAssignments() {
  try {
    const raw = localStorage.getItem(MEAL_PLAN_DAY_ASSIGNMENTS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveMealPlanDayAssignments(assignments) {
  localStorage.setItem(MEAL_PLAN_DAY_ASSIGNMENTS_KEY, JSON.stringify(assignments || {}));
}

function assignRecipeToTargetDay(recipeId) {
  const targetDay = localStorage.getItem(MEAL_PLAN_TARGET_DAY_KEY);
  if (!targetDay) return;
  const assignments = loadMealPlanDayAssignments();

  for (const dayKey of Object.keys(assignments)) {
    const list = Array.isArray(assignments[dayKey]) ? assignments[dayKey] : [];
    assignments[dayKey] = list.filter((id) => id !== recipeId);
  }

  const current = Array.isArray(assignments[targetDay]) ? assignments[targetDay] : [];
  assignments[targetDay] = [...current, recipeId];
  saveMealPlanDayAssignments(assignments);
}


// ===== Chips UI =====
function chipClass(isOn) {
  return [
    "px-3 py-1.5 rounded-full text-sm border transition",
    isOn
      ? "bg-brand-primary border-brand-primary text-white hover:bg-brand-primary-hover"
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
    const { openIngredientDetailsPopup } = await getIngredientDetailsModule();
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
    const { hasIngredientData } = await getIngredientDetailsModule();
    let rendered = 0;
    let fragment = document.createDocumentFragment();

    // Im Nährstoff-Tab immer alle Zutaten anzeigen (auch ignorierte).
    for (const ing of allIngredientsAll) {
      if (q && !ingredientMatchesQuery(ing, q)) continue;
      
      // Überprüfe, ob Nährstoffdaten vorhanden sind
      const hasData = creds ? await hasIngredientData(creds, ing.key) : false;

      // Nur das neueste Render-Ergebnis in den DOM schreiben.
      if (currentRequestId !== nutrientLoadRequestId) return;
      fragment.appendChild(makeNutrientChip(ing, hasData));
      rendered += 1;

      if (rendered % 20 === 0) {
        elNutrientChips.appendChild(fragment);
        fragment = document.createDocumentFragment();
        await yieldToBrowser();
        if (currentRequestId !== nutrientLoadRequestId) return;
      }
    }

    if (fragment.childNodes.length > 0) {
      elNutrientChips.appendChild(fragment);
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
    const { forceReloadIngredientDetails } = await getIngredientDetailsModule();
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

  recipeImageObserver?.disconnect();
  elRecipeList.innerHTML = "";
  const fragment = document.createDocumentFragment();
  for (const item of enriched) fragment.appendChild(renderCard(item));
  elRecipeList.appendChild(fragment);
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
        <span class="text-xs font-semibold px-2 py-1 rounded-full ${percent === 100 ? "bg-green-600 text-white" : "bg-brand-ink text-white"}">
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
          : `<div class="text-semantic-danger"><span class="font-medium">Fehlt:</span> ${missingPreview}${missingMore}</div>`
        }
      </div>

      <div class="hidden js-plan-hint text-xs font-semibold px-2 py-1 rounded-lg bg-brand-accent-soft text-brand-accent-strong border border-brand-accent w-fit">
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
      assignRecipeToTargetDay(r.id);
      div.classList.add("ring-2", "ring-status-info", "ring-offset-2");
      planHint.classList.remove("hidden");
      selectButton.setAttribute("aria-label", "Rezeptauswahl aufheben");
      return;
    }

    selectedRecipeIds.delete(r.id);
    saveMealPlanSelectedRecipes(selectedRecipeIds);
    div.classList.remove("ring-2", "ring-status-info", "ring-offset-2");
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

  const img = div.querySelector(".recipe-image");
  if (img) observeRecipeImage(img);
  
  return div;
}

const cleanupTools = createRecipeCleanupTools({
  getRecipes: () => recipes,
  updateRecipe: (updatedRecipe) => {
    const idx = recipes.findIndex(item => item.id === updatedRecipe.id);
    if (idx !== -1) recipes[idx] = updatedRecipe;
  },
  selected,
  saveSelected,
  getIgnoredSet: () => ignoredSet,
  persistIgnored,
  refreshAfterCleanup: async (mode) => {
    buildIngredientsAndCategories();
    pruneSelected();
    initChips();
    renderIgnoreChips();
    renderNutrientChips().catch(err => {
      const label = mode === "unit" ? "Einheiten-Cleanup" : "Cleanup";
      console.warn(`Nährstoffdetails nach ${label} konnten nicht geladen werden:`, err);
    });
    render();
  }
});

const dataCacheTools = createDataCacheTools({
  setRecipes: (nextRecipes) => {
    recipes = Array.isArray(nextRecipes) ? nextRecipes : [];
  },
  refreshAfterReload: async () => {
    buildIngredientsAndCategories();
    await renderNutrientChips();
    updateChips();
    renderChips();
    renderIgnoreChips();
    initCategorySelect();
    render();
  }
});

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
  btnCleanup.addEventListener("click", cleanupTools.openCleanupPopup);
}

if (btnClearDataCache) {
  btnClearDataCache.addEventListener("click", dataCacheTools.clearDataCacheFromUi);
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

setupAutoHideHeader();
setupAuthUi();

// ===== Boot =====
(async function boot() {
  let initialLoadingTimer = null;
  let initialLoadingVisible = false;

  function showInitialLoading(message = "Lade Rezepte...") {
    initialLoadingVisible = true;
    showLoading(message);
  }

  function hideInitialLoading() {
    if (initialLoadingTimer) {
      window.clearTimeout(initialLoadingTimer);
      initialLoadingTimer = null;
    }
    if (initialLoadingVisible) {
      hideLoading();
      initialLoadingVisible = false;
    }
  }

  // Wenn jemand extern signalisiert, dass ein frischer Reload gestartet wird,
  // zeigen wir das Initial-Loading sofort (z. B. nach Credentials-Änderung oder Cache-Löschung)
  window.addEventListener('startRecipeReload', () => {
    if (initialLoadingTimer) {
      window.clearTimeout(initialLoadingTimer);
      initialLoadingTimer = null;
    }
    showInitialLoading("Lade Rezepte...");
  });

  try {
    // Wenn wir von einem Shared-Creds-Redirect kommen, zeigt sofort das Loading
    const shouldStartReload = localStorage.getItem('yummi_start_recipe_reload') === '1';
    if (shouldStartReload) {
      try { localStorage.removeItem('yummi_start_recipe_reload'); } catch (e) {}
      // Cancel Timer und sofort anzeigen
      if (initialLoadingTimer) { window.clearTimeout(initialLoadingTimer); initialLoadingTimer = null; }
      showInitialLoading("Lade Rezepte...");
    } else {
      initialLoadingTimer = window.setTimeout(() => {
        showInitialLoading("Lade Rezepte...");
      }, 350);
    }


    // Progress-Updates während des Ladens
    window.addEventListener("recipeLoadProgress", (e) => {
      const { loaded, total, mode } = e.detail;
      if (mode === "initial") {
        showInitialLoading(`Lade Rezepte: ${loaded}/${total}...`);
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
    
    // App-Dateien aktualisiert der Service Worker, Rezeptdaten bleiben cache-first.
    recipes = await loadRecipesForCurrentAppVersion();

    buildIngredientsAndCategories();
    initCategorySelect();
    pruneSelected();
    initChips();
    renderIgnoreChips();
    render();
    hideInitialLoading();

    // Remote-Ignore-Liste nach dem ersten Render synchronisieren.
    (async () => {
      try {
        const creds = getCredsOrThrow();
        ignoredSet = await syncIgnoredFromDav(creds);
        buildIngredientsAndCategories();
        pruneSelected();
        initChips();
        renderIgnoreChips();
        render();
      } catch (err) {
        console.warn("Ignore-Liste Sync fehlgeschlagen:", err.message || err);
      }
    })();

    // Nährstoffdetails im Hintergrund vorladen, aber erst wenn der erste Screen ruhig ist.
    scheduleIdleTask(() => {
      renderNutrientChips().catch(err => {
        console.warn("Background-Nährstoffdetails konnten nicht geladen werden:", err);
      });
    }, 900);
  } catch (e) {
    hideInitialLoading();
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
