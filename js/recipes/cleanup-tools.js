import { APP } from "../core/config.js";
import { escapeHtml, hideError, hideLoading, normalizeIngredient, showError, showLoading } from "../core/shared.js";
import { davBaseFolderUrl, loadCreds, mkcol, put } from "../dav/webdav.js";
import { saveMetadata, saveRecipeToCache } from "../storage/db.js";

export function createRecipeCleanupTools(options) {
  // ===== Cleanup Popup =====
  const {
    getRecipes,
    updateRecipe,
    selected,
    saveSelected,
    getIgnoredSet,
    persistIgnored,
    refreshAfterCleanup
  } = options;
  
  let cleanupOverlay = null;
  
  function joinUrl(base, rel) {
    const b = base.replace(/\/+$/, "");
    const r = rel.replace(/^\/+/, "");
    return `${b}/${r}`;
  }
  
  function escapeAttr(value) {
    return escapeHtml(value).replaceAll('"', "&quot;");
  }
  
  function waitForPaint() {
    return new Promise((resolve) => {
      window.requestAnimationFrame(() => window.setTimeout(resolve, 0));
    });
  }
  
  function normalizeCleanupUnit(unit) {
    return String(unit || "").trim().toLocaleLowerCase("de");
  }
  
  function getIngredientUsage() {
    const usage = new Map();
  
    for (const recipe of getRecipes()) {
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
  
  function getUnitUsage() {
    const usage = new Map();
  
    for (const recipe of getRecipes()) {
      for (const ingredient of (recipe.ingredients || [])) {
        const unit = String(ingredient?.unit || "").trim();
        const key = normalizeCleanupUnit(unit);
        if (!unit || !key) continue;
  
        const entry = usage.get(key) || {
          key,
          label: unit,
          count: 0,
          recipeIds: new Set(),
          variants: new Set()
        };
  
        entry.count += 1;
        entry.recipeIds.add(recipe.id);
        entry.variants.add(unit);
        if (unit.length < entry.label.length) entry.label = unit;
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
          recipeCount: item.recipeIds.size
        };
      })
      .sort(compareUnitCleanupItems);
  }
  
  function compareUnitCleanupItems(a, b) {
    if (a.hasInconsistentVariants !== b.hasInconsistentVariants) {
      return a.hasInconsistentVariants ? -1 : 1;
    }
    if (b.variants.length !== a.variants.length) return b.variants.length - a.variants.length;
    return a.label.localeCompare(b.label, "de");
  }
  
  function findIngredientRenameMatches(fromName) {
    const fromKey = normalizeIngredient(fromName);
    if (!fromKey) return [];
  
    const matches = [];
    for (const recipe of getRecipes()) {
      const ingredients = recipe.ingredients || [];
      const hits = ingredients.filter(ingredient => normalizeIngredient(ingredient?.name) === fromKey);
      if (hits.length > 0) {
        matches.push({ recipe, count: hits.length });
      }
    }
    return matches;
  }
  
  function countIngredientRenameChanges(matches, fromName, toName) {
    const fromKey = normalizeIngredient(fromName);
    return matches.reduce((sum, { recipe }) => {
      return sum + (recipe.ingredients || []).filter((ingredient) => {
        return normalizeIngredient(ingredient?.name) === fromKey
          && String(ingredient?.name || "").trim() !== toName;
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
    const changeCount = countIngredientRenameChanges(matches, fromName, toName);
  
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
  
  function ingredientMatchesQuery(item, q) {
    const needle = String(q || "").trim().toLocaleLowerCase("de");
    if (!needle) return true;
    return item.label.toLocaleLowerCase("de").includes(needle)
      || item.key.includes(needle)
      || item.variants.some(variant => variant.toLocaleLowerCase("de").includes(needle));
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
  
  function findUnitRenameMatches(fromUnit) {
    const fromKey = normalizeCleanupUnit(fromUnit);
    if (!fromKey) return [];
  
    const matches = [];
    for (const recipe of getRecipes()) {
      const ingredients = recipe.ingredients || [];
      const hits = ingredients.filter(ingredient => normalizeCleanupUnit(ingredient?.unit) === fromKey);
      if (hits.length > 0) {
        matches.push({ recipe, count: hits.length });
      }
    }
    return matches;
  }
  
  function countUnitRenameChanges(matches, fromUnit, toUnit) {
    const fromKey = normalizeCleanupUnit(fromUnit);
    return matches.reduce((sum, { recipe }) => {
      return sum + (recipe.ingredients || []).filter((ingredient) => {
        return normalizeCleanupUnit(ingredient?.unit) === fromKey
          && String(ingredient?.unit || "").trim() !== toUnit;
      }).length;
    }, 0);
  }
  
  function updateCleanupUnitPreview(overlay) {
    const fromInput = overlay.querySelector("#cleanup-unit-from");
    const toInput = overlay.querySelector("#cleanup-unit-to");
    const preview = overlay.querySelector("#cleanup-unit-preview");
    const applyBtn = overlay.querySelector("#cleanup-unit-apply");
    if (!fromInput || !toInput || !preview || !applyBtn) return;
  
    const fromUnit = fromInput.value.trim();
    const toUnit = toInput.value.trim();
    const matches = findUnitRenameMatches(fromUnit);
    const occurrenceCount = matches.reduce((sum, item) => sum + item.count, 0);
    const changeCount = countUnitRenameChanges(matches, fromUnit, toUnit);
  
    applyBtn.disabled = !fromUnit || !toUnit || matches.length === 0 || changeCount === 0;
    applyBtn.classList.toggle("opacity-50", applyBtn.disabled);
    applyBtn.classList.toggle("cursor-not-allowed", applyBtn.disabled);
  
    if (!fromUnit) {
      preview.textContent = "Wähle oder tippe eine Einheit, um die betroffenen Rezepte zu sehen.";
      return;
    }
  
    if (matches.length === 0) {
      preview.textContent = `Keine Vorkommen für "${fromUnit}" gefunden.`;
      return;
    }
  
    const recipeTitles = matches
      .slice(0, 4)
      .map(item => item.recipe.title || item.recipe.id)
      .join(", ");
    const more = matches.length > 4 ? ` +${matches.length - 4} weitere` : "";
    preview.textContent = `${occurrenceCount} Vorkommen in ${matches.length} Rezept(en), ${changeCount} Änderung(en): ${recipeTitles}${more}`;
  }
  
  function renderCleanupUnitResults(overlay) {
    const search = overlay.querySelector("#cleanup-unit-search");
    const list = overlay.querySelector("#cleanup-unit-results");
    if (!search || !list) return;
  
    const q = search.value.trim().toLowerCase();
    const items = getUnitUsage()
      .filter(item => item.hasInconsistentVariants || !q || item.label.toLowerCase().includes(q) || item.key.includes(q) || item.variants.some(variant => variant.toLowerCase().includes(q)))
      .slice(0, 30);
  
    list.innerHTML = items.length === 0
      ? `<div class="px-3 py-2 text-sm text-gray-500">Keine Einheiten gefunden.</div>`
      : items.map(item => `
          <button type="button" data-cleanup-pick-unit-key="${escapeAttr(item.key)}"
            class="w-full text-left px-3 py-2 rounded-lg hover:bg-blue-50 text-sm flex items-center justify-between gap-3">
            <span class="min-w-0">
              <span class="block truncate">
                ${escapeHtml(item.label)}
                ${item.hasInconsistentVariants ? `<span class="ml-1 text-xs font-medium text-amber-700">Varianten</span>` : ""}
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
    showLoading(`Zutaten: "${fromName}" → "${toName}" (0/${matches.length})`);
    await waitForPaint();
  
    try {
      let done = 0;
  
      for (const { recipe } of matches) {
        const recipeTitle = recipe.title || recipe.id;
        showLoading(`Zutaten: "${fromName}" → "${toName}" (${done + 1}/${matches.length}) ${recipeTitle}`);
        await waitForPaint();
  
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
  
        updateRecipe(updatedRecipe);
  
        done += 1;
      }
  
      if (selected.has(fromKey)) {
        selected.delete(fromKey);
        selected.add(normalizeIngredient(toName));
        saveSelected(selected);
      }
  
      const currentIgnoredSet = getIgnoredSet();
      if (currentIgnoredSet.has(fromKey)) {
        currentIgnoredSet.delete(fromKey);
        currentIgnoredSet.add(normalizeIngredient(toName));
        await persistIgnored();
      }
  
      await refreshAfterCleanup("ingredient");
  
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
  
  async function applyUnitRename(overlay) {
    const fromUnit = overlay.querySelector("#cleanup-unit-from")?.value.trim() || "";
    const toUnit = overlay.querySelector("#cleanup-unit-to")?.value.trim() || "";
    const matches = findUnitRenameMatches(fromUnit);
  
    if (!fromUnit || !toUnit || matches.length === 0) return;
  
    const occurrenceCount = matches.reduce((sum, item) => sum + item.count, 0);
    const ok = confirm(`${occurrenceCount} Vorkommen in ${matches.length} Rezept(en) von "${fromUnit}" zu "${toUnit}" umbenennen?`);
    if (!ok) return;
  
    const creds = loadCreds();
    if (!creds) {
      showError("Keine Nextcloud-Anmeldung gefunden. Cleanup kann nicht speichern.");
      return;
    }
  
    const fromKey = normalizeCleanupUnit(fromUnit);
    const baseFolder = davBaseFolderUrl(creds);
    const recipesFolder = joinUrl(baseFolder, APP.RECIPES_SUBFOLDER);
  
    hideError();
    showLoading(`Einheiten: "${fromUnit}" → "${toUnit}" (0/${matches.length})`);
    await waitForPaint();
  
    try {
      let done = 0;
  
      for (const { recipe } of matches) {
        const recipeTitle = recipe.title || recipe.id;
        showLoading(`Einheiten: "${fromUnit}" → "${toUnit}" (${done + 1}/${matches.length}) ${recipeTitle}`);
        await waitForPaint();
  
        const updatedRecipe = JSON.parse(JSON.stringify(recipe));
        for (const ingredient of (updatedRecipe.ingredients || [])) {
          if (normalizeCleanupUnit(ingredient?.unit) === fromKey) {
            ingredient.unit = toUnit;
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
  
        updateRecipe(updatedRecipe);
  
        done += 1;
      }
  
      await refreshAfterCleanup("unit");
  
      overlay.querySelector("#cleanup-unit-from").value = toUnit;
      overlay.querySelector("#cleanup-unit-to").value = "";
      renderCleanupUnitResults(overlay);
      updateCleanupUnitPreview(overlay);
    } catch (err) {
      console.error("Einheiten-Cleanup fehlgeschlagen:", err);
      showError(`Einheiten-Cleanup fehlgeschlagen: ${err.message}`);
    } finally {
      hideLoading();
    }
  }
  
  function getOrCreateCleanupOverlay() {
    if (cleanupOverlay) return cleanupOverlay;
  
    cleanupOverlay = document.createElement("div");
    cleanupOverlay.id = "cleanupOverlay";
    cleanupOverlay.className = "hidden fixed inset-x-0 top-0 z-40";
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
  
            <div class="border border-gray-200 rounded-xl overflow-hidden">
              <button id="cleanup-toggle-units" type="button"
                class="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-800 bg-gray-50 hover:bg-gray-100">
                <span>Mengenangaben umbenennen</span>
                <span id="cleanup-units-icon">▾</span>
              </button>
  
              <div id="cleanup-units-body" class="hidden p-4 space-y-3">
                <input id="cleanup-unit-search" type="search" placeholder="Einheit suchen..."
                  class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" />
  
                <div id="cleanup-unit-results" class="max-h-52 overflow-y-auto rounded-xl border border-gray-200 p-1"></div>
  
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label class="block">
                    <span class="text-xs text-gray-500">Umbenennen von</span>
                    <input id="cleanup-unit-from" type="text"
                      class="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" />
                  </label>
                  <label class="block">
                    <span class="text-xs text-gray-500">Umbenennen nach</span>
                    <input id="cleanup-unit-to" type="text"
                      class="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" />
                  </label>
                </div>
  
                <div id="cleanup-unit-preview" class="rounded-xl bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-700">
                  Wähle oder tippe eine Einheit, um die betroffenen Rezepte zu sehen.
                </div>
  
                <button id="cleanup-unit-apply" type="button" disabled
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
    renderCleanupUnitResults(overlay);
    updateCleanupUnitPreview(overlay);
  
    overlay.querySelector("#cleanup-backdrop")?.addEventListener("click", closeCleanupPopup);
    overlay.querySelector("#cleanup-close")?.addEventListener("click", closeCleanupPopup);
    overlay.querySelector("#cleanup-toggle-rename")?.addEventListener("click", () => {
      const body = overlay.querySelector("#cleanup-rename-body");
      const icon = overlay.querySelector("#cleanup-rename-icon");
      const isHidden = body.classList.toggle("hidden");
      if (icon) icon.textContent = isHidden ? "▾" : "▴";
    });
    overlay.querySelector("#cleanup-toggle-units")?.addEventListener("click", () => {
      const body = overlay.querySelector("#cleanup-units-body");
      const icon = overlay.querySelector("#cleanup-units-icon");
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
    overlay.querySelector("#cleanup-unit-search")?.addEventListener("input", () => {
      renderCleanupUnitResults(overlay);
    });
    overlay.querySelector("#cleanup-unit-from")?.addEventListener("input", () => {
      updateCleanupUnitPreview(overlay);
    });
    overlay.querySelector("#cleanup-unit-to")?.addEventListener("input", () => {
      updateCleanupUnitPreview(overlay);
    });
    overlay.querySelector("#cleanup-unit-results")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-cleanup-pick-unit-key]");
      if (!btn) return;
      const picked = getUnitUsage().find(item => item.key === btn.dataset.cleanupPickUnitKey);
      overlay.querySelector("#cleanup-unit-from").value = picked?.label || "";
      overlay.querySelector("#cleanup-unit-to").value = picked?.label || "";
      updateCleanupUnitPreview(overlay);
    });
    overlay.querySelector("#cleanup-unit-apply")?.addEventListener("click", () => {
      applyUnitRename(overlay);
    });
  }

  return { openCleanupPopup };
}
