import { loadMealPlanSelectedRecipes, saveMealPlanSelectedRecipes } from "../storage/local.js";
import { getAllRecipesFromCache } from "../storage/db.js";
import { escapeHtml, getRecipeImageUrl } from "../core/shared.js";
import { aggregateRecipeNutrition } from "../recipes/nutrition-aggregator.js";
import { MINERAL_LABELS } from "../ingredients/ingredient-details.js";

const MEAL_PLAN_DAY_ASSIGNMENTS_KEY = "meal_plan_day_assignments_v1";
const DGE_REFERENCES_URL = "./data/dge-referenzwerte.json";
const MEAL_PLAN_REFERENCE_SELECTIONS_KEY = "meal_plan_reference_selections_v1";
const MEAL_PLAN_WEIGHT_KG_KEY = "meal_plan_weight_kg_v1";
const MEAL_PLAN_SELECTED_PAL_KEY = "meal_plan_selected_pal_v1";
const MEAL_PLAN_DAY_COLLAPSE_KEY = "meal_plan_day_collapse_v1";

function formatDateLabel(date, prefix) {
  const weekday = new Intl.DateTimeFormat("de-DE", { weekday: "long" }).format(date);
  const day = new Intl.DateTimeFormat("de-DE", { day: "numeric" }).format(date);
  const month = new Intl.DateTimeFormat("de-DE", { month: "long" }).format(date);
  const weekdayCap = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  return `${prefix} - ${weekdayCap} ${day}.${month}`;
}

function formatWeekdayDateLabel(date) {
  const weekday = new Intl.DateTimeFormat("de-DE", { weekday: "long" }).format(date);
  const day = new Intl.DateTimeFormat("de-DE", { day: "numeric" }).format(date);
  const month = new Intl.DateTimeFormat("de-DE", { month: "long" }).format(date);
  const weekdayCap = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  return `${weekdayCap} ${day}.${month}`;
}

function roundValue(value) {
  if (!value || value <= 0) return "0";
  return value >= 100 ? value.toFixed(0) : value.toFixed(1);
}

function getNutritionValues(aggregated) {
  const macros = aggregated?.macros || {};
  const carbTotal = typeof macros.carbs === "number"
    ? macros.carbs
    : Object.values(aggregated?.carbs || {}).reduce((sum, val) => sum + (Number(val) || 0), 0);
  const fiberTotal = typeof macros.fiber === "number"
    ? macros.fiber
    : Object.values(aggregated?.fibers || {}).reduce((sum, val) => sum + (Number(val) || 0), 0);

  return {
    protein: roundValue(macros.protein),
    carbs: roundValue(carbTotal),
    fibers: roundValue(fiberTotal),
    kcal: roundValue(macros.kcal),
    fat: roundValue(macros.fat),
    iron: Number(aggregated?.minerals?.fe || 0)
  };
}

const MINERAL_NAME_TO_KEY = Object.fromEntries(
  Object.entries(MINERAL_LABELS).map(([key, value]) => [String(value?.[0] || "").toLowerCase(), key])
);

function getExtraNutrients(aggregated) {
  return {
    calcium: Number(aggregated?.minerals?.ca || 0),
    magnesium: Number(aggregated?.minerals?.mg || 0),
    kalium: Number(aggregated?.minerals?.k || 0),
    natrium: Number(aggregated?.minerals?.na || 0),
    phosphor: Number(aggregated?.minerals?.p || 0),
    zink: Number(aggregated?.minerals?.zn || 0),
    kupfer: Number(aggregated?.minerals?.cu || 0),
    mangan: Number(aggregated?.minerals?.mn || 0),
    chlorid: Number(aggregated?.minerals?.cld || 0),
    jod: Number(aggregated?.minerals?.id || 0),
    fluorid: Number(aggregated?.minerals?.fd || 0),
    chrom: Number(aggregated?.minerals?.cr || 0),
    molybdän: Number(aggregated?.minerals?.mo || 0),
    selen: Number(aggregated?.minerals?.se || 0)
  };
}

async function renderPlanCard(recipe) {
  const imageUrl = await getRecipeImageUrl(recipe.id);
  const aggregated = await aggregateRecipeNutrition(recipe, null);
  const nutrition = getNutritionValues(aggregated);
  nutrition.extra = getExtraNutrients(aggregated);

  return {
    nutrition,
    html: `
    <article class="px-4 py-4 border-b border-black/20 meal-plan-card" draggable="true" data-recipe-id="${escapeHtml(recipe.id)}">
      <div class="grid grid-cols-[minmax(0,1fr)_1.15fr] gap-4 items-start">
        <a href="recipe.html?id=${encodeURIComponent(recipe.id)}" class="block bg-white rounded-2xl shadow-sm hover:shadow-md transition overflow-hidden border border-gray-200">
          <div class="relative">
            <img src="${imageUrl}" alt="${escapeHtml(recipe.title || recipe.id)}" class="w-full h-40 object-cover" />
            <span class="absolute top-2 left-2 px-2 py-1 rounded-full text-xs font-medium bg-white/90 text-gray-700">${escapeHtml(recipe.category || "Rezept")}</span>
          </div>
          <div class="p-4">
            <h3 class="text-lg font-semibold leading-snug line-clamp-2">${escapeHtml(recipe.title || "Ohne Titel")}</h3>
          </div>
        </a>

        <div class="pt-1">
          <p class="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Nährwerte</p>
          <div class="space-y-1.5 text-sm text-gray-700 leading-snug">
            <p><span class="font-medium text-gray-900">Protein:</span> ${nutrition.protein} g</p>
            <p><span class="font-medium text-gray-900">Kohlenhydrate:</span> ${nutrition.carbs} g</p>
            <p><span class="font-medium text-gray-900">Ballaststoffe:</span> ${nutrition.fibers} g</p>
            <p><span class="font-medium text-gray-900">Kalorien:</span> ${nutrition.kcal} kcal</p>
            <p><span class="font-medium text-gray-900">Fett:</span> ${nutrition.fat} g</p>
          </div>
          <button type="button" class="mt-3 text-xs font-medium text-red-700 hover:text-red-800 js-remove-from-plan" data-recipe-id="${escapeHtml(recipe.id)}">
            Aus Essensplan entfernen
          </button>
        </div>
      </div>
    </article>
  `
  };
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function sumDayNutrition(recipeIds, nutritionByRecipeId) {
  return recipeIds.reduce((acc, recipeId) => {
    const n = nutritionByRecipeId.get(recipeId);
    if (!n) return acc;
    acc.protein += toNumber(n.protein);
    acc.carbs += toNumber(n.carbs);
    acc.fibers += toNumber(n.fibers);
    acc.kcal += toNumber(n.kcal);
    acc.fat += toNumber(n.fat);
    acc.iron += toNumber(n.iron);
    if (n.extra && typeof n.extra === "object") {
      for (const [key, value] of Object.entries(n.extra)) {
        acc.extra[key] = (acc.extra[key] || 0) + toNumber(value);
      }
    }
    return acc;
  }, { protein: 0, carbs: 0, fibers: 0, kcal: 0, fat: 0, iron: 0, extra: {} });
}

function renderDayNutritionSummary(dayNutrition) {
  return renderDayNutritionSummaryWithReferences(dayNutrition, []);
}

function renderDayNutritionSummaryWithReferences(dayNutrition, selectedReferences, energyContext) {
  return `
    <div class="px-4 py-3 border-b border-black/20 bg-white/60">
      <div class="text-sm font-semibold text-gray-800 mb-1">Nährstoffsumme (Tag)</div>
      ${renderGoalComparison(dayNutrition, selectedReferences, energyContext)}
    </div>
  `;
}

function parseReferenceValueRange(referenceValue) {
  const text = String(referenceValue || "");
  const matches = Array.from(text.matchAll(/\d+(?:[.,]\d+)?/g))
    .map((m) => Number(m[0].replace(",", ".")))
    .filter((n) => Number.isFinite(n));
  if (!matches.length) return null;
  return Math.max(...matches);
}

function resolveDailyTargetsFromReferences(selectedReferences) {
  const targets = {
    protein: null,
    carbs: null,
    fat: null,
    fibers: null,
    kcal: null,
    iron: null
  };
  const pickHigher = (current, nextValue, entryUnit = "") => {
    const next = Number(nextValue);
    if (!Number.isFinite(next)) return current;
    if (!current || !Number.isFinite(current.value)) {
      return { value: next, unit: entryUnit };
    }
    if (next > current.value) {
      return { value: next, unit: entryUnit };
    }
    return current;
  };

  for (const entry of (selectedReferences || [])) {
    const nutrient = String(entry.nutrient || "").toLowerCase();
    const directValue = Number(entry.targetValue);
    const fallbackValue = parseReferenceValueRange(entry.referenceValue);
    const value = Number.isFinite(directValue) ? directValue : fallbackValue;
    if (!Number.isFinite(value)) continue;

    const entryUnit = String(entry.unit || "").trim();

    if (nutrient.includes("protein")) targets.protein = pickHigher(targets.protein, value, entryUnit);
    else if (nutrient.includes("kohlenhydrat")) targets.carbs = pickHigher(targets.carbs, value, entryUnit);
    else if (nutrient.includes("gesamtfett") || nutrient === "fett") targets.fat = pickHigher(targets.fat, value, entryUnit);
    else if (nutrient.includes("ballaststoff")) targets.fibers = pickHigher(targets.fibers, value, entryUnit);
    else if (nutrient.includes("energie")) targets.kcal = pickHigher(targets.kcal, value, entryUnit);
    else if (nutrient.includes("eisen")) targets.iron = pickHigher(targets.iron, value, entryUnit || "mg/Tag");
  }

  return targets;
}

function renderTargetBar(actual, target, showHundredLabel = false) {
  if (!Number.isFinite(target) || target <= 0) {
    return '<div class="h-2 rounded-full bg-gray-200"></div>';
  }

  const ratio = actual / target;
  const SOLL_MARK_PERCENT = 75;
  const OVERFLOW_RANGE_PERCENT = 25;
  const MAX_OVERFLOW_RATIO = 1; // entspricht 200% IST/SOLL als rechtes Ende

  const clampedRatio = Math.max(0, ratio);
  const mappedPercent = clampedRatio <= 1
    ? clampedRatio * SOLL_MARK_PERCENT
    : (() => {
        const overflowRatio = Math.min(clampedRatio - 1, MAX_OVERFLOW_RATIO);
        const logNorm = Math.log1p(overflowRatio) / Math.log1p(MAX_OVERFLOW_RATIO);
        return SOLL_MARK_PERCENT + (logNorm * OVERFLOW_RANGE_PERCENT);
      })();

  const basePercent = Math.min(mappedPercent, SOLL_MARK_PERCENT);
  const overflowPercent = Math.max(0, mappedPercent - SOLL_MARK_PERCENT);

  return `
    <div class="relative h-5">
      ${showHundredLabel ? `<div class="absolute -top-4 -translate-x-1/2 text-xs text-gray-700" style="left:${SOLL_MARK_PERCENT}%">100%</div>` : ""}
      <div class="absolute top-1/2 -translate-y-1/2 h-2 w-px bg-gray-900 z-10" style="left:${SOLL_MARK_PERCENT}%"></div>
      <div class="absolute top-1/2 left-0 right-0 -translate-y-1/2 h-2 rounded-full bg-gray-200 overflow-hidden">
        <div class="absolute inset-y-0 left-0 bg-emerald-500 rounded-full" style="width:${basePercent}%;"></div>
        ${overflowPercent > 0 ? `<div class="absolute inset-y-0 bg-amber-500" style="left:${SOLL_MARK_PERCENT}%; width:${overflowPercent}%;"></div>` : ""}
      </div>
    </div>
  `;
}

function renderDiffState(actual, target, unit) {
  if (!Number.isFinite(target) || target <= 0) {
    return '<span class="text-xs text-gray-500">Kein Sollwert</span>';
  }
  const delta = actual - target;
  const pct = (actual / target) * 100;
  const deltaAbs = `${roundValue(Math.abs(delta))} ${unit}`;

  if (Math.abs(delta) <= target * 0.1) {
    return `<span class="text-xs font-medium text-emerald-700">Im Ziel (${roundValue(pct)}%)</span>`;
  }
  if (delta < 0) {
    return `<span class="text-xs font-medium text-red-700">-${deltaAbs} (${roundValue(pct)}%)</span>`;
  }
  return `<span class="text-xs font-medium text-amber-700">+${deltaAbs} (${roundValue(pct)}%)</span>`;
}

function renderGoalComparison(dayNutrition, selectedReferences, energyContext) {
  const targets = resolveDailyTargetsFromReferences(selectedReferences);
  const energyKcal = Number(energyContext?.kcal);
  const hasEnergyKcal = Number.isFinite(energyKcal) && energyKcal > 0;

  const carbTarget = targets.carbs;
  const carbUsesPercentEnergy = !!(carbTarget && /%\s*der\s*energie/i.test(carbTarget.unit || ""));
  const carbTargetInGrams = carbUsesPercentEnergy && hasEnergyKcal
    ? ((carbTarget.value / 100) * energyKcal) / 4
    : carbTarget?.value;

  const rows = [
    {
      label: "Protein",
      unit: "g",
      actual: Number(dayNutrition.protein),
      target: targets.protein?.value,
      displayActual: `${roundValue(dayNutrition.protein)} g`,
      displayTarget: Number.isFinite(targets.protein?.value) ? `${roundValue(targets.protein.value)} ${targets.protein.unit || "g"}` : "-"
    },
    {
      label: "Kohlenhydrate",
      unit: "g",
      actual: Number(dayNutrition.carbs),
      target: carbTargetInGrams,
      displayActual: `${roundValue(dayNutrition.carbs)} g`,
      displayTarget: Number.isFinite(carbTargetInGrams) ? `${roundValue(carbTargetInGrams)} g` : "-",
      referenceNote: carbUsesPercentEnergy
        ? (hasEnergyKcal
          ? `Referenz ${roundValue(carbTarget?.value)} % der Energie, berechnet mit ${roundValue(energyKcal)} kcal (${energyContext?.label || "PAL"})`
          : "PAL/Energieziel wählen, um Kohlenhydrate-SOLL in g zu berechnen")
        : ""
    },
    {
      label: "Fett",
      unit: "g",
      actual: Number(dayNutrition.fat),
      target: targets.fat?.value,
      displayActual: `${roundValue(dayNutrition.fat)} g`,
      displayTarget: Number.isFinite(targets.fat?.value) ? `${roundValue(targets.fat.value)} ${targets.fat.unit || "g"}` : "-"
    },
    {
      label: "Ballaststoffe",
      unit: "g",
      actual: Number(dayNutrition.fibers),
      target: targets.fibers?.value,
      displayActual: `${roundValue(dayNutrition.fibers)} g`,
      displayTarget: Number.isFinite(targets.fibers?.value) ? `${roundValue(targets.fibers.value)} ${targets.fibers.unit || "g"}` : "-"
    },
    {
      label: "Kalorien",
      unit: "kcal",
      actual: Number(dayNutrition.kcal),
      target: targets.kcal?.value,
      displayActual: `${roundValue(dayNutrition.kcal)} kcal`,
      displayTarget: Number.isFinite(targets.kcal?.value) ? `${roundValue(targets.kcal.value)} ${targets.kcal.unit || "kcal/Tag"}` : "-"
    },
    {
      label: "Eisen",
      unit: "mg",
      actual: Number(dayNutrition.iron),
      target: targets.iron?.value,
      displayActual: `${roundValue(dayNutrition.iron)} mg`,
      displayTarget: Number.isFinite(targets.iron?.value) ? `${roundValue(targets.iron.value)} ${targets.iron.unit || "mg/Tag"}` : "-"
    }
  ];

  const fixedLabels = new Set(rows.map((row) => row.label.toLowerCase()));
  for (const entry of (selectedReferences || [])) {
    const label = String(entry.nutrient || "").trim();
    if (!label) continue;
    if (fixedLabels.has(label.toLowerCase())) continue;

    const targetValue = Number(entry.targetValue);
    const fallbackValue = parseReferenceValueRange(entry.referenceValue);
    const target = Number.isFinite(targetValue) ? targetValue : fallbackValue;
    const unit = String(entry.unit || "").replace("/Tag", "").trim() || "";
    const mappedKey = MINERAL_NAME_TO_KEY[label.toLowerCase()];
    let actual = null;
    if (mappedKey && dayNutrition.extra) {
      const prettyName = String(MINERAL_LABELS[mappedKey]?.[0] || "").toLowerCase();
      actual = Number(dayNutrition.extra[prettyName]);
      if (!Number.isFinite(actual)) actual = null;
    }

    rows.push({
      label,
      unit,
      actual: Number.isFinite(actual) ? actual : 0,
      target,
      displayActual: Number.isFinite(actual) ? `${roundValue(actual)} ${unit}`.trim() : "IST nicht verfügbar",
      displayTarget: Number.isFinite(target) ? `${roundValue(target)} ${entry.unit || unit}`.trim() : (entry.referenceValue || "-"),
      unavailableActual: !Number.isFinite(actual)
    });
  }

  if (!rows.some((row) => Number.isFinite(row.target) || row.referenceNote)) return "";

  return `
    <div class="mt-3 pt-3 border-t border-black/10">
      <div class="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Soll vs. Ist</div>
      <div class="relative space-y-2">
        ${rows.filter((row) => Number.isFinite(row.target) || row.referenceNote).map((row, idx) => {
          const targetTxt = row.displayTarget;
          const actualTxt = row.displayActual;
          return `
            <div>
              <div class="flex items-center justify-between gap-2 mb-1">
                <p class="text-xs text-gray-700"><span class="font-medium text-gray-900">${row.label}:</span> ${actualTxt} / ${targetTxt}</p>
                ${row.unavailableActual ? '<span class="text-xs text-gray-500">Kein IST</span>' : renderDiffState(row.actual, row.target, row.unit)}
              </div>
              ${row.referenceNote ? `<p class="text-[11px] text-gray-500 mb-1">${row.referenceNote}</p>` : ""}
              ${row.unavailableActual ? "" : renderTargetBar(row.actual, row.target, idx === 0)}
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function renderWeekNutritionSummary(weekNutrition) {
  return `
    <section class="px-4 py-4 border-b-2 border-black bg-stone-100">
      <div class="bg-white/60 border border-black/20 rounded-xl p-3">
        <p class="text-sm font-semibold text-gray-800 mb-2">Nährstoffsumme (Woche)</p>
        <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-gray-700">
          <p>Protein: ${roundValue(weekNutrition.protein)} g</p>
          <p>Kohlenhydrate: ${roundValue(weekNutrition.carbs)} g</p>
          <p>Ballaststoffe: ${roundValue(weekNutrition.fibers)} g</p>
          <p>Kalorien: ${roundValue(weekNutrition.kcal)} kcal</p>
          <p>Fett: ${roundValue(weekNutrition.fat)} g</p>
        </div>
      </div>
    </section>
  `;
}

function renderDaySection(title, dayKey, cardsHtml, daySummaryHtml) {
  const collapseState = loadDayCollapseState();
  const isCollapsed = !!collapseState[dayKey];
  return `
    <section class="border-t-2 border-black bg-stone-100">
      <button type="button" class="w-full px-4 py-5 border-b-2 border-black flex items-center justify-between text-left js-day-toggle" data-day-key="${escapeHtml(dayKey)}" aria-expanded="${isCollapsed ? "false" : "true"}">
        <h2 class="text-4xl font-semibold">${escapeHtml(title)}</h2>
        <span class="text-lg text-gray-700">${isCollapsed ? "▾" : "▴"}</span>
      </button>
      <div class="${isCollapsed ? "hidden" : ""}" data-day-body="${escapeHtml(dayKey)}">
        ${daySummaryHtml}
        <div class="meal-dropzone" data-day-key="${escapeHtml(dayKey)}">${cardsHtml || '<div class="px-4 py-5 text-gray-600">Noch keine Rezepte geplant.</div>'}</div>
      </div>
    </section>
  `;
}

function formatDayKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function loadAssignments() {
  try {
    const raw = localStorage.getItem(MEAL_PLAN_DAY_ASSIGNMENTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

function saveAssignments(assignments) {
  localStorage.setItem(MEAL_PLAN_DAY_ASSIGNMENTS_KEY, JSON.stringify(assignments));
}

function loadDayCollapseState() {
  try {
    const raw = localStorage.getItem(MEAL_PLAN_DAY_COLLAPSE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveDayCollapseState(state) {
  localStorage.setItem(MEAL_PLAN_DAY_COLLAPSE_KEY, JSON.stringify(state || {}));
}

function loadReferenceSelections() {
  try {
    const raw = localStorage.getItem(MEAL_PLAN_REFERENCE_SELECTIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveReferenceSelections(selectionKeys) {
  localStorage.setItem(MEAL_PLAN_REFERENCE_SELECTIONS_KEY, JSON.stringify(Array.from(new Set(selectionKeys || []))));
}

function loadBodyWeightKg() {
  const raw = localStorage.getItem(MEAL_PLAN_WEIGHT_KG_KEY);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 70;
  return Math.max(0, Math.min(200, Math.round(parsed)));
}

function saveBodyWeightKg(value) {
  localStorage.setItem(MEAL_PLAN_WEIGHT_KG_KEY, String(value));
}

function loadSelectedPalLabel() {
  return localStorage.getItem(MEAL_PLAN_SELECTED_PAL_KEY) || "";
}

function saveSelectedPalLabel(value) {
  if (!value) {
    localStorage.removeItem(MEAL_PLAN_SELECTED_PAL_KEY);
    return;
  }
  localStorage.setItem(MEAL_PLAN_SELECTED_PAL_KEY, value);
}

function parseNumericReferenceValue(referenceValue) {
  const match = String(referenceValue || "").match(/\d+(?:[.,]\d+)?/);
  if (!match) return null;
  const num = Number(match[0].replace(",", "."));
  return Number.isFinite(num) ? num : null;
}

function fillSelect(selectEl, options, placeholder) {
  if (!selectEl) return;
  const opts = options.map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`).join("");
  selectEl.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>${opts}`;
}

function setupReferenceDropdowns(entries, onSelectionChange = () => {}) {
  const populationGroupSelect = document.getElementById("populationGroupSelect");
  const sexSelect = document.getElementById("sexSelect");
  const palEnergySelect = document.getElementById("palEnergySelect");
  const nutrientMultiSelect = document.getElementById("referenceNutrientMultiSelect");
  if (!populationGroupSelect || !sexSelect || !palEnergySelect || !nutrientMultiSelect) {
    return {
      getSelectedReferences: () => [],
      getSelectedEnergyContext: () => null
    };
  }

  nutrientMultiSelect.innerHTML = `
    <button id="referenceDropdownButton" type="button" class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-left flex items-center justify-between">
      <span id="referenceDropdownLabel">Referenzwerte auswählen</span>
      <span class="text-gray-500">▾</span>
    </button>
    <div id="referenceDropdownPanel" class="hidden absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-gray-300 bg-white shadow-lg"></div>
  `;

  const dropdownButton = document.getElementById("referenceDropdownButton");
  const dropdownLabel = document.getElementById("referenceDropdownLabel");
  const dropdownPanel = document.getElementById("referenceDropdownPanel");

  const selectedKeys = new Set(loadReferenceSelections());
  let selectedReferenceEntries = [];
  let currentWeightKg = loadBodyWeightKg();
  let selectedEnergyEntry = null;

  const bodyWeightRange = document.getElementById("bodyWeightRange");
  const bodyWeightValue = document.getElementById("bodyWeightValue");

  const updateWeightUi = () => {
    if (bodyWeightRange) bodyWeightRange.value = String(currentWeightKg);
    if (bodyWeightValue) bodyWeightValue.textContent = `${currentWeightKg} kg`;
  };

  updateWeightUi();

  if (bodyWeightRange) {
    bodyWeightRange.addEventListener("input", () => {
      currentWeightKg = Math.max(0, Math.min(200, Number(bodyWeightRange.value) || 0));
      updateWeightUi();
      saveBodyWeightKg(currentWeightKg);
      onSelectionChange();
    });
  }

  const makeEntryKey = (entry) => `${entry.populationGroup}__${entry.sex}__${entry.nutrient}__${entry.referenceValue}__${entry.unit}`;

  const populationGroups = Array.from(new Set(entries.map((entry) => entry.populationGroup).filter(Boolean))).sort((a, b) => a.localeCompare(b, "de"));
  const sexes = Array.from(new Set(entries.map((entry) => entry.sex).filter(Boolean))).sort((a, b) => a.localeCompare(b, "de"));
  fillSelect(populationGroupSelect, populationGroups, "Bevölkerungsgruppe wählen");
  fillSelect(sexSelect, sexes, "Geschlecht wählen");

  if (populationGroups.length === 1) populationGroupSelect.value = populationGroups[0];
  if (sexes.length === 1) sexSelect.value = sexes[0];

  const updateDropdownLabel = () => {
    if (!dropdownLabel) return;
    if (!selectedReferenceEntries.length) {
      dropdownLabel.textContent = "Referenzwerte auswählen";
      return;
    }
    dropdownLabel.textContent = `${selectedReferenceEntries.length} Referenzwert(e) ausgewählt`;
  };

  const refreshNutrients = () => {
    const pg = populationGroupSelect.value;
    const sex = sexSelect.value;
    const filtered = entries.filter((entry) => (!pg || entry.populationGroup === pg) && (!sex || entry.sex === sex));

    const filteredKeys = new Set(filtered.map(makeEntryKey));
    for (const key of Array.from(selectedKeys)) {
      if (!filteredKeys.has(key)) selectedKeys.delete(key);
    }

    if (dropdownPanel) {
      dropdownPanel.innerHTML = filtered.map((entry) => {
        const entryKey = makeEntryKey(entry);
        const checked = selectedKeys.has(entryKey) ? "checked" : "";
        const line = entry.label || `${entry.nutrient} - ${entry.referenceValue}${entry.unit ? ` ${entry.unit}` : ""}`;
        return `<label class="flex items-start gap-2 px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-b-0"><input type="checkbox" class="mt-0.5 js-reference-checkbox" data-reference-key="${escapeHtml(entryKey)}" ${checked} /><span class="text-sm text-gray-800">${escapeHtml(line)}</span></label>`;
      }).join("") || '<div class="px-3 py-2 text-sm text-gray-500">Keine Referenzwerte gefunden</div>';
    }

    selectedReferenceEntries = filtered.filter((entry) => selectedKeys.has(makeEntryKey(entry)));

    const energyEntries = filtered.filter((entry) => String(entry.nutrient || "").toLowerCase().includes("energie bei pal"));
    const energyOptions = energyEntries.map((entry) => entry.label || `${entry.nutrient} - ${entry.referenceValue}${entry.unit ? ` ${entry.unit}` : ""}`);
    fillSelect(palEnergySelect, energyOptions, "Energieziel (PAL) wählen");

    const storedPal = loadSelectedPalLabel();
    if (storedPal && energyOptions.includes(storedPal)) {
      palEnergySelect.value = storedPal;
    } else if (energyOptions.length === 1) {
      palEnergySelect.value = energyOptions[0];
      saveSelectedPalLabel(energyOptions[0]);
    }

    selectedEnergyEntry = energyEntries.find((entry) => {
      const label = entry.label || `${entry.nutrient} - ${entry.referenceValue}${entry.unit ? ` ${entry.unit}` : ""}`;
      return label === palEnergySelect.value;
    }) || null;

    saveReferenceSelections(Array.from(selectedKeys));
    updateDropdownLabel();
    onSelectionChange();
  };

  palEnergySelect.addEventListener("change", () => {
    saveSelectedPalLabel(palEnergySelect.value);
    const pg = populationGroupSelect.value;
    const sex = sexSelect.value;
    const filtered = entries.filter((entry) => (!pg || entry.populationGroup === pg) && (!sex || entry.sex === sex));
    const energyEntries = filtered.filter((entry) => String(entry.nutrient || "").toLowerCase().includes("energie bei pal"));
    selectedEnergyEntry = energyEntries.find((entry) => {
      const label = entry.label || `${entry.nutrient} - ${entry.referenceValue}${entry.unit ? ` ${entry.unit}` : ""}`;
      return label === palEnergySelect.value;
    }) || null;
    onSelectionChange();
  });

  if (dropdownButton && dropdownPanel) {
    dropdownButton.addEventListener("click", () => {
      dropdownPanel.classList.toggle("hidden");
    });

    dropdownPanel.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (!target.classList.contains("js-reference-checkbox")) return;
      const key = target.dataset.referenceKey;
      if (!key) return;
      if (target.checked) selectedKeys.add(key);
      else selectedKeys.delete(key);
      refreshNutrients();
    });

    document.addEventListener("click", (event) => {
      if (!nutrientMultiSelect.contains(event.target)) {
        dropdownPanel.classList.add("hidden");
      }
    });
  }

  populationGroupSelect.addEventListener("change", refreshNutrients);
  sexSelect.addEventListener("change", refreshNutrients);
  refreshNutrients();

  return {
    getSelectedReferences: () => selectedReferenceEntries.map((entry) => {
      const isPerKg = /\bkg\b/i.test(entry.unit || "");
      if (!isPerKg) {
        const plainValue = parseReferenceValueRange(entry.referenceValue);
        return {
          ...entry,
          targetValue: Number.isFinite(plainValue) ? plainValue : null
        };
      }

      const baseValue = parseNumericReferenceValue(entry.referenceValue);
      if (baseValue === null) {
        return {
          ...entry,
          targetValue: null
        };
      }

      const calculated = baseValue * currentWeightKg;
      return {
        ...entry,
        referenceValue: `${entry.referenceValue} (bei ${currentWeightKg} kg: ${roundValue(calculated)})`,
        unit: entry.unit.replace(/\/?kg\s*KG\/?/i, "").trim() || entry.unit,
        targetValue: calculated
      };
    }),
    getSelectedEnergyContext: () => {
      if (!selectedEnergyEntry) return null;
      const kcal = parseReferenceValueRange(selectedEnergyEntry.referenceValue);
      return {
        kcal: Number.isFinite(kcal) ? kcal : null,
        label: selectedEnergyEntry.nutrient || "PAL"
      };
    }
  };
}

function buildPlanState(selectedRecipes, dayKeys) {
  const selectedSet = new Set(selectedRecipes.map((recipe) => recipe.id));
  const assignments = loadAssignments();
  const dayAssignments = dayKeys.map((dayKey) => (
    Array.isArray(assignments[dayKey]) ? assignments[dayKey].filter((id) => selectedSet.has(id)) : []
  ));

  const used = new Set(dayAssignments.flat());
  const remaining = selectedRecipes.map((recipe) => recipe.id).filter((id) => !used.has(id));

  for (const id of remaining) {
    let targetIndex = 0;
    for (let i = 1; i < dayAssignments.length; i += 1) {
      if (dayAssignments[i].length < dayAssignments[targetIndex].length) targetIndex = i;
    }
    dayAssignments[targetIndex].push(id);
  }

  dayKeys.forEach((dayKey, idx) => {
    assignments[dayKey] = dayAssignments[idx];
  });
  saveAssignments(assignments);

  return { assignments };
}

function setupDragAndDrop({ root, assignments, dayKeys, recipesById, selectedIds, renderAll }) {
  let draggedRecipeId = null;
  let activeTouchCard = null;
  let touchDragStarted = false;
  let touchStartX = 0;
  let touchStartY = 0;

  const clearZoneHighlights = () => {
    root.querySelectorAll(".meal-dropzone").forEach((zone) => {
      zone.classList.remove("bg-blue-50");
    });
  };

  const moveRecipeToDay = (recipeId, targetDayKey) => {
    if (!recipeId || !targetDayKey || !recipesById.has(recipeId)) return;
    const validDayKeys = new Set(dayKeys);
    if (!validDayKeys.has(targetDayKey)) return;

    for (const dayKey of validDayKeys) {
      assignments[dayKey] = (assignments[dayKey] || []).filter((id) => id !== recipeId);
    }
    assignments[targetDayKey] = [...(assignments[targetDayKey] || []), recipeId];
    saveAssignments(assignments);
    renderAll();
  };

  root.querySelectorAll(".meal-plan-card").forEach((card) => {
    card.addEventListener("dragstart", (e) => {
      draggedRecipeId = card.dataset.recipeId;
      card.classList.add("opacity-50");
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", draggedRecipeId || "");
      }
    });

    card.addEventListener("dragend", () => {
      card.classList.remove("opacity-50");
      draggedRecipeId = null;
      clearZoneHighlights();
    });

    card.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      activeTouchCard = card;
      touchDragStarted = false;
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
    }, { passive: true });

    card.addEventListener("touchmove", (e) => {
      if (!activeTouchCard || activeTouchCard !== card || e.touches.length !== 1) return;
      const touch = e.touches[0];
      const dx = Math.abs(touch.clientX - touchStartX);
      const dy = Math.abs(touch.clientY - touchStartY);

      if (!touchDragStarted && (dx > 8 || dy > 8)) {
        touchDragStarted = true;
        draggedRecipeId = card.dataset.recipeId || null;
        card.classList.add("opacity-50");
        document.body.classList.add("overflow-hidden");
      }

      if (!touchDragStarted) return;
      e.preventDefault();

      clearZoneHighlights();
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      const zone = el?.closest?.(".meal-dropzone");
      if (zone) zone.classList.add("bg-blue-50");
    }, { passive: false });

    card.addEventListener("touchend", (e) => {
      if (!activeTouchCard || activeTouchCard !== card) return;

      if (touchDragStarted) {
        const touch = e.changedTouches?.[0];
        const el = touch ? document.elementFromPoint(touch.clientX, touch.clientY) : null;
        const zone = el?.closest?.(".meal-dropzone");
        const targetDayKey = zone?.dataset?.dayKey;
        moveRecipeToDay(draggedRecipeId, targetDayKey);
      }

      card.classList.remove("opacity-50");
      clearZoneHighlights();
      document.body.classList.remove("overflow-hidden");
      draggedRecipeId = null;
      activeTouchCard = null;
      touchDragStarted = false;
    }, { passive: true });

    card.addEventListener("touchcancel", () => {
      card.classList.remove("opacity-50");
      clearZoneHighlights();
      document.body.classList.remove("overflow-hidden");
      draggedRecipeId = null;
      activeTouchCard = null;
      touchDragStarted = false;
    }, { passive: true });
  });

  root.querySelectorAll(".meal-dropzone").forEach((zone) => {
    zone.addEventListener("dragover", (e) => {
      e.preventDefault();
      zone.classList.add("bg-blue-50");
    });

    zone.addEventListener("dragleave", () => {
      zone.classList.remove("bg-blue-50");
    });

    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      zone.classList.remove("bg-blue-50");
      const recipeId = draggedRecipeId || e.dataTransfer?.getData("text/plain");
      const targetDayKey = zone.dataset.dayKey;
      moveRecipeToDay(recipeId, targetDayKey);
    });
  });

  root.querySelectorAll(".js-remove-from-plan").forEach((button) => {
    button.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const recipeId = button.dataset.recipeId;
      if (!recipeId || !recipesById.has(recipeId)) return;

      selectedIds.delete(recipeId);
      saveMealPlanSelectedRecipes(selectedIds);

      for (const dayKey of dayKeys) {
        assignments[dayKey] = (assignments[dayKey] || []).filter((id) => id !== recipeId);
      }
      saveAssignments(assignments);
      renderAll();
    });
  });
}

function setupDayToggles(root) {
  root.querySelectorAll(".js-day-toggle").forEach((button) => {
    button.addEventListener("click", () => {
      const dayKey = button.dataset.dayKey;
      if (!dayKey) return;
      const body = root.querySelector(`[data-day-body="${dayKey}"]`);
      if (!body) return;

      const collapseState = loadDayCollapseState();
      const collapsed = !body.classList.contains("hidden");
      body.classList.toggle("hidden", collapsed);
      collapseState[dayKey] = collapsed;
      saveDayCollapseState(collapseState);

      button.setAttribute("aria-expanded", collapsed ? "false" : "true");
      const chevron = button.querySelector("span");
      if (chevron) chevron.textContent = collapsed ? "▾" : "▴";
    });
  });
}

async function boot() {
  const selectedIds = loadMealPlanSelectedRecipes();
  const root = document.getElementById("planRoot");
  const emptyState = document.getElementById("emptyState");
  const todayHeadline = document.getElementById("todayHeadline");
  const today = new Date();
  const days = [];
  for (let i = 0; i < 7; i += 1) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    days.push({
      date,
      dayKey: formatDayKey(date),
      title: i === 0
        ? formatDateLabel(date, "Heute")
        : i === 1
          ? formatDateLabel(date, "Morgen")
          : formatWeekdayDateLabel(date)
    });
  }
  const dayKeys = days.map((day) => day.dayKey);
  let getSelectedReferences = () => [];
  let getSelectedEnergyContext = () => null;
  let rerenderPlan = () => {};

  try {
    const response = await fetch(DGE_REFERENCES_URL);
    if (response.ok) {
      const payload = await response.json();
      const refUi = setupReferenceDropdowns(Array.isArray(payload.entries) ? payload.entries : [], () => rerenderPlan());
      getSelectedReferences = refUi.getSelectedReferences;
      getSelectedEnergyContext = refUi.getSelectedEnergyContext;
    }
  } catch {
    // Optionales Feature; bei Fehler bleibt die Seite nutzbar.
  }

  todayHeadline.textContent = "Diese Woche";

  const renderEmptyWeek = () => {
    const zero = { protein: 0, carbs: 0, fibers: 0, kcal: 0, fat: 0, iron: 0 };
    root.innerHTML = renderWeekNutritionSummary(zero)
      + days.map((day) => renderDaySection(day.title, day.dayKey, "", renderDayNutritionSummaryWithReferences(zero, getSelectedReferences(), getSelectedEnergyContext()))).join("");
    setupDayToggles(root);
  };

  if (!selectedIds.size) {
    emptyState.classList.remove("hidden");
    renderEmptyWeek();
    return;
  }

  const recipes = await getAllRecipesFromCache();
  const selectedRecipes = recipes.filter((recipe) => selectedIds.has(recipe.id));

  if (!selectedRecipes.length) {
    emptyState.classList.remove("hidden");
    renderEmptyWeek();
    return;
  }

  const recipesById = new Map(selectedRecipes.map((recipe) => [recipe.id, recipe]));
  const cardsAndNutrition = await Promise.all(selectedRecipes.map(async (recipe) => [recipe.id, await renderPlanCard(recipe)]));
  const cardHtmlById = new Map(cardsAndNutrition.map(([id, payload]) => [id, payload.html]));
  const nutritionByRecipeId = new Map(cardsAndNutrition.map(([id, payload]) => [id, payload.nutrition]));
  const { assignments } = buildPlanState(selectedRecipes, dayKeys);

  const renderAll = () => {
    emptyState.classList.toggle("hidden", selectedIds.size > 0);

    const dayNutritionByKey = new Map();
    const weekTotals = { protein: 0, carbs: 0, fibers: 0, kcal: 0, fat: 0, iron: 0 };

    for (const day of days) {
      const dayRecipeIds = assignments[day.dayKey] || [];
      const dayNutrition = sumDayNutrition(dayRecipeIds, nutritionByRecipeId);
      dayNutritionByKey.set(day.dayKey, dayNutrition);
      weekTotals.protein += dayNutrition.protein;
      weekTotals.carbs += dayNutrition.carbs;
      weekTotals.fibers += dayNutrition.fibers;
      weekTotals.kcal += dayNutrition.kcal;
      weekTotals.fat += dayNutrition.fat;
    }

    const weekSummaryHtml = renderWeekNutritionSummary(weekTotals);
    const daySectionsHtml = days.map((day) => {
      const dayRecipeIds = assignments[day.dayKey] || [];
      const cards = dayRecipeIds.map((id) => cardHtmlById.get(id)).filter(Boolean).join("");
      const daySummary = renderDayNutritionSummaryWithReferences(dayNutritionByKey.get(day.dayKey), getSelectedReferences(), getSelectedEnergyContext());
      return renderDaySection(day.title, day.dayKey, cards, daySummary);
    }).join("");

    root.innerHTML = weekSummaryHtml + daySectionsHtml;

    setupDayToggles(root);
    setupDragAndDrop({ root, assignments, dayKeys, recipesById, selectedIds, renderAll });
  };

  rerenderPlan = renderAll;

  renderAll();
}

boot().catch((err) => {
  const root = document.getElementById("planRoot");
  root.innerHTML = `<div class="px-4 py-8 text-red-700">Fehler beim Laden des Essensplans: ${escapeHtml(err?.message || "Unbekannter Fehler")}</div>`;
});
