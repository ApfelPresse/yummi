/**
 * Nutrition Aggregator Module
 *
 * Aggregiert Nährstoffinformationen von Rezeptzutaten:
 * - Lädt detaillierte Nährstoffe für jede Zutat aus dem Cache
 * - Skaliert Werte basierend auf Zutatenmenge
 * - Merged/summiert alle Nährstoffe
 * - Formatiert für UI-Anzeige
 * - Trackt Beiträge jeder Zutat für Detailansicht
 */

import { loadIngredientDetails } from "../ingredients/ingredient-details-store.js";
import { normalizeIngredient } from "../core/shared.js";
import {
	CARB_LABELS,
	FAT_SOLUBLE_VITAMIN_LABELS,
	FIBER_LABELS,
	MACRO_LABELS,
	MINERAL_LABELS,
	WATER_SOLUBLE_VITAMIN_LABELS
} from "../ingredients/nutrient-labels.js";

// ─── Unit Conversions (zu Gramm/Milliliter) ───────────────────────────────
const UNIT_TO_GRAMS = {
	"g": 1,
	"ml": 1, // 1ml Wasser ≈ 1g (vereinfacht)
	"EL": 15,     // 1 Esslöffel ≈ 15g
	"TL": 5,      // 1 Teelöffel ≈ 5g
	"Stück": null, // Nicht konvertierbar - wird übersprungen
	"": 1
};

/**
 * Konvertiert eine Zutatenmenge in die Referenzeinheit (typisch 100g)
 * Gibt den Skalierungsfaktor zurück (z.B. 0.5 für 50g)
 */
function getScaleFactor(amount, unit, referenceAmount = 100) {
	if (!amount || amount === null || amount === undefined) return 0;
	
	const gramsPerUnit = UNIT_TO_GRAMS[unit] || UNIT_TO_GRAMS[""];
	if (gramsPerUnit === null) return 0; // Stück - nicht skalierbar
	
	const totalGrams = amount * gramsPerUnit;
	return totalGrams / referenceAmount;
}

/**
 * Skaliert ein einzelnes Nährstoffwert basierend auf Zutatenmenge
 */
function scaleValue(value, scaleFactor) {
	if (!value || value === null || value === undefined) return 0;
	return Number(value) * scaleFactor;
}

/**
 * Merged zwei Nährstoff-Objekte durch Addition der Werte
 */
function mergeNutrients(acc, obj) {
	if (!obj) return acc;
	
	for (const [key, value] of Object.entries(obj)) {
		if (typeof value === "number" && value > 0) {
			acc[key] = (acc[key] || 0) + value;
		}
	}
	return acc;
}

/**
 * Merged Nährstoffe UND trackt Beiträge aus jeder Zutat
 */
function mergAndTrackNutrients(aggregated, scaled, ingredientName, amount, unit) {
	// Merge macros
	for (const [key, value] of Object.entries(scaled.macros)) {
		if (typeof value === "number" && value > 0) {
			aggregated.macros[key] = (aggregated.macros[key] || 0) + value;
			
			// Track breakdown
			const breakdownKey = `macros_${key}`;
			if (!aggregated._breakdowns[breakdownKey]) {
				aggregated._breakdowns[breakdownKey] = [];
			}
			aggregated._breakdowns[breakdownKey].push({
				ingredient: ingredientName,
				amount,
				unit,
				value
			});
		}
	}

	// Merge vitamins
	for (const [key, value] of Object.entries(scaled.vitamins)) {
		if (typeof value === "number" && value > 0) {
			aggregated.vitamins[key] = (aggregated.vitamins[key] || 0) + value;
			
			const breakdownKey = `vitamins_${key}`;
			if (!aggregated._breakdowns[breakdownKey]) {
				aggregated._breakdowns[breakdownKey] = [];
			}
			aggregated._breakdowns[breakdownKey].push({
				ingredient: ingredientName,
				amount,
				unit,
				value
			});
		}
	}

	// Merge minerals
	for (const [key, value] of Object.entries(scaled.minerals)) {
		if (typeof value === "number" && value > 0) {
			aggregated.minerals[key] = (aggregated.minerals[key] || 0) + value;
			
			const breakdownKey = `minerals_${key}`;
			if (!aggregated._breakdowns[breakdownKey]) {
				aggregated._breakdowns[breakdownKey] = [];
			}
			aggregated._breakdowns[breakdownKey].push({
				ingredient: ingredientName,
				amount,
				unit,
				value
			});
		}
	}

	// Merge carbs
	for (const [key, value] of Object.entries(scaled.carbs)) {
		if (typeof value === "number" && value > 0) {
			aggregated.carbs[key] = (aggregated.carbs[key] || 0) + value;
			
			const breakdownKey = `carbs_${key}`;
			if (!aggregated._breakdowns[breakdownKey]) {
				aggregated._breakdowns[breakdownKey] = [];
			}
			aggregated._breakdowns[breakdownKey].push({
				ingredient: ingredientName,
				amount,
				unit,
				value
			});
		}
	}

	// Merge fibers
	for (const [key, value] of Object.entries(scaled.fibers)) {
		if (typeof value === "number" && value > 0) {
			aggregated.fibers[key] = (aggregated.fibers[key] || 0) + value;
			
			const breakdownKey = `fibers_${key}`;
			if (!aggregated._breakdowns[breakdownKey]) {
				aggregated._breakdowns[breakdownKey] = [];
			}
			aggregated._breakdowns[breakdownKey].push({
				ingredient: ingredientName,
				amount,
				unit,
				value
			});
		}
	}
}

/**
 * Extrahiert die relevanten Nährstoffkategorien aus den Zutatendaten
 * und skaliert sie nach der Zutatenmenge
 */
function extractAndScaleNutrients(ingredientData, scaleFactor) {
	if (!ingredientData || scaleFactor <= 0) {
		return { macros: {}, vitamins: {}, minerals: {}, carbs: {}, fibers: {} };
	}

	const scaled = {
		macros: {},
		vitamins: {},
		minerals: {},
		carbs: {},
		fibers: {}
	};

	// Macros
	if (ingredientData.macros) {
		for (const [key, value] of Object.entries(ingredientData.macros)) {
			if (value !== null && value !== undefined) {
				scaled.macros[key] = scaleValue(value, scaleFactor);
			}
		}
	}

	// Vitamins
	if (ingredientData.vitamins) {
		for (const [key, value] of Object.entries(ingredientData.vitamins)) {
			if (value !== null && value !== undefined) {
				scaled.vitamins[key] = scaleValue(value, scaleFactor);
			}
		}
	}

	// Minerals
	if (ingredientData.minerals) {
		for (const [key, value] of Object.entries(ingredientData.minerals)) {
			if (value !== null && value !== undefined) {
				scaled.minerals[key] = scaleValue(value, scaleFactor);
			}
		}
	}

	// Carbohydrates
	if (ingredientData.carbohydrates) {
		for (const [key, value] of Object.entries(ingredientData.carbohydrates)) {
			if (value !== null && value !== undefined) {
				scaled.carbs[key] = scaleValue(value, scaleFactor);
			}
		}
	}

	// Fibers
	if (ingredientData.fibers) {
		for (const [key, value] of Object.entries(ingredientData.fibers)) {
			if (value !== null && value !== undefined) {
				scaled.fibers[key] = scaleValue(value, scaleFactor);
			}
		}
	}

	return scaled;
}

/**
 * Aggregiert die Nährstoffinformationen für ein komplettes Rezept
 * @param {Object} recipe - Rezeptobjekt mit ingredients Array
 * @param {Object} creds - Credentials für DAV-Zugriff (optional)
 * @returns {Promise<Object>} Aggregierte Nährstoffwerte mit Breakdowns
 */
export async function aggregateRecipeNutrition(recipe, creds) {
	if (!recipe || !recipe.ingredients || recipe.ingredients.length === 0) {
		return null;
	}

	const aggregated = {
		macros: {},
		vitamins: {},
		minerals: {},
		carbs: {},
		fibers: {},
		// Tracking für Detailansicht: { nutrientKey: [{ ingredient, amount, unit, value }, ...] }
		_breakdowns: {},
		ingredients: [] // Zur Diagnose
	};

	for (const ing of recipe.ingredients) {
		if (!ing || !ing.name || !ing.amount) continue;

		try {
			const key = normalizeIngredient(ing.name);
			const ingredientData = await loadIngredientDetails(creds, key);

			if (!ingredientData) {
				console.warn(`Nährstoffdaten für "${ing.name}" nicht gefunden`);
				continue;
			}

			const scaleFactor = getScaleFactor(
				ing.amount,
				ing.unit || "g",
				ingredientData.referenceAmount || 100
			);

			if (scaleFactor <= 0) {
				console.warn(`Konnte ${ing.unit} nicht skalieren für "${ing.name}"`);
				continue;
			}

			const scaled = extractAndScaleNutrients(ingredientData, scaleFactor);

			// Merge und tracke Beiträge
			mergAndTrackNutrients(
				aggregated,
				scaled,
				ing.name,
				ing.amount,
				ing.unit || "g"
			);

			aggregated.ingredients.push({
				name: ing.name,
				amount: ing.amount,
				unit: ing.unit,
				scaleFactor,
				found: true
			});
		} catch (err) {
			console.error(`Fehler bei der Aggregation von "${ing.name}":`, err);
		}
	}

	return aggregated;
}

/**
 * Formatiert einen Nährstoffwert für die Anzeige
 */
function formatNutrientValue(value, precision = 1) {
	if (!value || value === 0) return "0";
	if (value < 1) return value.toFixed(2);
	return value.toFixed(precision);
}

/**
 * Erzeugt HTML für ein Breakdown-Modal eines einzelnen Nährstoffs
 */
export function renderNutrientBreakdownModal(category, nutrient, aggregated) {
	const breakdownKey = `${category}_${nutrient}`;
	const breakdown = aggregated._breakdowns?.[breakdownKey] || [];
	
	// Label finden
	let nutrientLabel = "Nährstoff";
	let nutrientUnit = "";
	
	if (category === "macros" && MACRO_LABELS[nutrient]) {
		[nutrientLabel, nutrientUnit] = MACRO_LABELS[nutrient];
	} else if (category === "minerals" && MINERAL_LABELS[nutrient]) {
		[nutrientLabel, nutrientUnit] = MINERAL_LABELS[nutrient];
	} else if (category === "vitamins") {
		const labelFat = FAT_SOLUBLE_VITAMIN_LABELS[nutrient];
		const labelWater = WATER_SOLUBLE_VITAMIN_LABELS[nutrient];
		if (labelFat) [nutrientLabel, nutrientUnit] = labelFat;
		if (labelWater) [nutrientLabel, nutrientUnit] = labelWater;
	} else if (category === "carbs" && CARB_LABELS[nutrient]) {
		[nutrientLabel, nutrientUnit] = CARB_LABELS[nutrient];
	} else if (category === "fibers" && FIBER_LABELS[nutrient]) {
		[nutrientLabel, nutrientUnit] = FIBER_LABELS[nutrient];
	}
	
	const total = breakdown.reduce((sum, item) => sum + (item.value || 0), 0);
	
	const rows = breakdown
		.sort((a, b) => (b.value || 0) - (a.value || 0))
		.map(item => {
			const percent = total > 0 ? ((item.value / total) * 100).toFixed(1) : 0;
			return `
				<div class="flex justify-between items-center py-2 border-b last:border-b-0">
					<div class="flex-1">
						<div class="font-medium text-sm text-gray-900">${item.ingredient}</div>
						<div class="text-xs text-gray-500">${item.amount} ${item.unit}</div>
					</div>
					<div class="text-right">
						<div class="font-semibold text-gray-900">${formatNutrientValue(item.value)} ${nutrientUnit}</div>
						<div class="text-xs text-gray-500">${percent}%</div>
					</div>
				</div>
			`;
		})
		.join("");
	
	return `
		<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" id="nutrientBreakdownModal">
			<div class="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 p-6">
				<!-- Header -->
				<div class="flex justify-between items-start mb-4">
					<h2 class="text-lg font-semibold text-gray-900">${nutrientLabel}</h2>
					<button id="closeBreakdownModal" class="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
				</div>
				
				<!-- Total -->
				<div class="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
					<div class="text-xs text-gray-600 mb-1">Gesamt</div>
					<div class="text-2xl font-bold text-gray-900">${formatNutrientValue(total)} ${nutrientUnit}</div>
				</div>
				
				<!-- Breakdown List -->
				<div class="max-h-96 overflow-y-auto">
					${rows || '<p class="text-gray-500 text-sm text-center py-4">Keine Daten verfügbar</p>'}
				</div>
				
				<!-- Close Button -->
				<button onclick="document.getElementById('nutrientBreakdownModal')?.remove()" class="w-full mt-4 px-4 py-2 bg-surface-muted hover:bg-gray-200 text-gray-900 rounded-lg font-medium transition">
					Schließen
				</button>
			</div>
		</div>
	`;
}

/**
 * Setzt Click-Handler für Nährstoff-Kärtchen
 */
export function setupNutritionCardListeners(aggregated) {
	const cards = document.querySelectorAll(".nutrition-card");
	
	cards.forEach(card => {
		card.addEventListener("click", () => {
			const category = card.getAttribute("data-category");
			const nutrient = card.getAttribute("data-nutrient");
			
			// Altes Modal entfernen falls vorhanden
			const oldModal = document.getElementById("nutrientBreakdownModal");
			if (oldModal) oldModal.remove();
			
			// Neues Modal rendern
			const modal = renderNutrientBreakdownModal(category, nutrient, aggregated);
			document.body.insertAdjacentHTML("beforeend", modal);
			
			// Close-Button Handler
			const closeBtn = document.getElementById("closeBreakdownModal");
			if (closeBtn) {
				closeBtn.addEventListener("click", () => {
					document.getElementById("nutrientBreakdownModal")?.remove();
				});
			}
			
			// Modal schließen bei Click außerhalb
			document.getElementById("nutrientBreakdownModal")?.addEventListener("click", (e) => {
				if (e.target.id === "nutrientBreakdownModal") {
					e.target.remove();
				}
			});
		});
	});
}

/**
 * Generiert HTML für die Nährstoffzusammenfassung mit Click-Events
 * @param {Object} aggregated - Aggregierte Nährstoffe von aggregateRecipeNutrition()
 * @returns {string} HTML-String für die Anzeige
 */
export function renderNutritionSummary(aggregated) {
	if (!aggregated) return "";

	const macros = aggregated.macros || {};
	const vitamins = aggregated.vitamins || {};
	const minerals = aggregated.minerals || {};
	const carbs = aggregated.carbs || {};
	const fibers = aggregated.fibers || {};

	// Hauptmakros (meist relevante)
	const mainMacros = [
		{ key: "kcal", label: MACRO_LABELS.kcal },
		{ key: "protein", label: MACRO_LABELS.protein },
		{ key: "fat", label: MACRO_LABELS.fat },
		{ key: "carbs", label: MACRO_LABELS.carbs },
		{ key: "fiber", label: MACRO_LABELS.fiber }
	];

	// Wichtige Mineralien
	const importantMinerals = [
		"ca", "mg", "k", "na", "fe", "zn"
	];

	// Wichtige Vitamine
	const importantVitamins = [
		"vitc", "vitd", "vitb12", "vitb6", "fol", "vita", "vite"
	];

	const html = `
		<div class="nutrition-summary-content">
			<!-- Makros -->
			<div class="nutrition-category">
				<h3 class="text-sm font-semibold text-gray-800 mb-2">Makronährstoffe</h3>
				<div class="grid grid-cols-2 gap-2">
					${mainMacros.map(m => {
						const val = macros[m.key] || 0;
						const [label, unit] = m.label;
						return `
							<div class="nutrition-card cursor-pointer hover:shadow-md transition p-2 rounded-lg border border-blue-100 bg-blue-50" 
							     data-category="macros" data-nutrient="${m.key}" data-value="${formatNutrientValue(val)}" data-unit="${unit}">
								<div class="text-xs text-gray-600">${label}</div>
								<div class="text-sm font-semibold text-gray-900">${formatNutrientValue(val)} ${unit}</div>
							</div>
						`;
					}).join("")}
				</div>
			</div>

			<!-- Mineralien -->
			<div class="nutrition-category mt-4">
				<h3 class="text-sm font-semibold text-gray-800 mb-2">Mineralien</h3>
				<div class="grid grid-cols-2 gap-2">
					${importantMinerals.map(key => {
						const val = minerals[key];
						if (!val) return "";
						const label = MINERAL_LABELS[key];
						if (!label) return "";
						const [name, unit] = label;
						return `
							<div class="nutrition-card cursor-pointer hover:shadow-md transition p-2 rounded-lg border border-amber-100 bg-amber-50"
							     data-category="minerals" data-nutrient="${key}" data-value="${formatNutrientValue(val)}" data-unit="${unit}">
								<div class="text-xs text-gray-600">${name}</div>
								<div class="text-sm font-semibold text-gray-900">${formatNutrientValue(val)} ${unit}</div>
							</div>
						`;
					}).filter(h => h).join("")}
				</div>
			</div>

			<!-- Vitamine -->
			<div class="nutrition-category mt-4">
				<h3 class="text-sm font-semibold text-gray-800 mb-2">Vitamine</h3>
				<div class="grid grid-cols-2 gap-2">
					${importantVitamins.map(key => {
						const val = vitamins[key];
						if (!val) return "";
						const labelFat = FAT_SOLUBLE_VITAMIN_LABELS[key];
						const labelWater = WATER_SOLUBLE_VITAMIN_LABELS[key];
						const label = labelFat || labelWater;
						if (!label) return "";
						const [name, unit] = label;
						return `
							<div class="nutrition-card cursor-pointer hover:shadow-md transition p-2 rounded-lg border border-green-100 bg-green-50"
							     data-category="vitamins" data-nutrient="${key}" data-value="${formatNutrientValue(val)}" data-unit="${unit}">
								<div class="text-xs text-gray-600">${name}</div>
								<div class="text-sm font-semibold text-gray-900">${formatNutrientValue(val)} ${unit}</div>
							</div>
						`;
					}).filter(h => h).join("")}
				</div>
			</div>

			<!-- Kohlenhydrate Details -->
			${Object.keys(carbs).length > 0 ? `
				<div class="nutrition-category mt-4">
					<h3 class="text-sm font-semibold text-gray-800 mb-2">Kohlenhydrate</h3>
					<div class="grid grid-cols-2 gap-2">
						${Object.entries(carbs).slice(0, 6).map(([key, val]) => {
							const label = CARB_LABELS[key];
							if (!label || !val) return "";
							const [name, unit] = label;
							return `
								<div class="nutrition-card cursor-pointer hover:shadow-md transition p-2 rounded-lg border border-purple-100 bg-purple-50"
								     data-category="carbs" data-nutrient="${key}" data-value="${formatNutrientValue(val)}" data-unit="${unit}">
									<div class="text-xs text-gray-600">${name}</div>
									<div class="text-sm font-semibold text-gray-900">${formatNutrientValue(val)} ${unit}</div>
								</div>
							`;
						}).filter(h => h).join("")}
					</div>
				</div>
			` : ""}
		</div>
	`;

	return html;
}
