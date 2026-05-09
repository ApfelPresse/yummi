import { loadMealPlanSelectedRecipes, saveMealPlanSelectedRecipes } from "../storage/local.js";
import { getAllRecipesFromCache } from "../storage/db.js";
import { escapeHtml, getRecipeImageUrl } from "../core/shared.js";
import { aggregateRecipeNutrition } from "../recipes/nutrition-aggregator.js";

const MEAL_PLAN_DAY_ASSIGNMENTS_KEY = "meal_plan_day_assignments_v1";

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
    fat: roundValue(macros.fat)
  };
}

async function renderPlanCard(recipe) {
  const imageUrl = await getRecipeImageUrl(recipe.id);
  const aggregated = await aggregateRecipeNutrition(recipe, null);
  const nutrition = getNutritionValues(aggregated);

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
    return acc;
  }, { protein: 0, carbs: 0, fibers: 0, kcal: 0, fat: 0 });
}

function renderDayNutritionSummary(dayNutrition) {
  return `
    <div class="px-4 py-3 border-b border-black/20 bg-white/60">
      <div class="text-sm font-semibold text-gray-800 mb-1">Nährstoffsumme (Tag)</div>
      <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-gray-700">
        <p>Protein: ${roundValue(dayNutrition.protein)} g</p>
        <p>Kohlenhydrate: ${roundValue(dayNutrition.carbs)} g</p>
        <p>Ballaststoffe: ${roundValue(dayNutrition.fibers)} g</p>
        <p>Kalorien: ${roundValue(dayNutrition.kcal)} kcal</p>
        <p>Fett: ${roundValue(dayNutrition.fat)} g</p>
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
  return `
    <section class="border-t-2 border-black bg-stone-100">
      <div class="px-4 py-5 border-b-2 border-black">
        <h2 class="text-4xl font-semibold">${escapeHtml(title)}</h2>
      </div>
      ${daySummaryHtml}
      <div class="meal-dropzone" data-day-key="${escapeHtml(dayKey)}">${cardsHtml || '<div class="px-4 py-5 text-gray-600">Noch keine Rezepte geplant.</div>'}</div>
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
      root.querySelectorAll(".meal-dropzone").forEach((zone) => {
        zone.classList.remove("bg-blue-50");
      });
    });
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
      if (!recipeId || !targetDayKey || !recipesById.has(recipeId)) return;

      const validDayKeys = new Set(dayKeys);
      if (!validDayKeys.has(targetDayKey)) return;

      for (const dayKey of validDayKeys) {
        assignments[dayKey] = (assignments[dayKey] || []).filter((id) => id !== recipeId);
      }
      assignments[targetDayKey] = [...(assignments[targetDayKey] || []), recipeId];
      saveAssignments(assignments);
      renderAll();
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

  todayHeadline.textContent = "Diese Woche";

  const renderEmptyWeek = () => {
    const zero = { protein: 0, carbs: 0, fibers: 0, kcal: 0, fat: 0 };
    root.innerHTML = renderWeekNutritionSummary(zero)
      + days.map((day) => renderDaySection(day.title, day.dayKey, "", renderDayNutritionSummary(zero))).join("");
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
    const weekTotals = { protein: 0, carbs: 0, fibers: 0, kcal: 0, fat: 0 };

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
      const daySummary = renderDayNutritionSummary(dayNutritionByKey.get(day.dayKey));
      return renderDaySection(day.title, day.dayKey, cards, daySummary);
    }).join("");

    root.innerHTML = weekSummaryHtml + daySectionsHtml;

    setupDragAndDrop({ root, assignments, dayKeys, recipesById, selectedIds, renderAll });
  };

  renderAll();
}

boot().catch((err) => {
  const root = document.getElementById("planRoot");
  root.innerHTML = `<div class="px-4 py-8 text-red-700">Fehler beim Laden des Essensplans: ${escapeHtml(err?.message || "Unbekannter Fehler")}</div>`;
});
