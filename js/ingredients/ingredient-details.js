/**
 * Ingredient Details Popup
 *
 * UI fuer detaillierte Naehrstoffinformationen einzelner Zutaten.
 * Datenzugriff, Schema, Labels und GPT-Prompt leben in eigenen Modulen.
 */

import { loadCreds } from "../dav/webdav.js";
import {
	AMINO_LABELS,
	CARB_LABELS,
	FAT_SOLUBLE_VITAMIN_LABELS,
	FATTY_ACID_LABELS,
	FIBER_LABELS,
	MACRO_LABELS,
	MINERAL_LABELS,
	OTHER_NUTRIENT_LABELS,
	SUGAR_ALCOHOL_LABELS,
	WATER_SOLUBLE_VITAMIN_LABELS
} from "./nutrient-labels.js";
import { createEmptyDetails, buildFullTemplateFromCurrent, normalizeImportedData } from "./ingredient-schema.js";
import { loadIngredientDetails, saveIngredientDetails } from "./ingredient-details-store.js";
import { buildIngredientGptPromptWithInput } from "./ingredient-gpt.js";

export {
	AMINO_LABELS,
	CARB_LABELS,
	FAT_SOLUBLE_VITAMIN_LABELS,
	FATTY_ACID_LABELS,
	FIBER_LABELS,
	MACRO_LABELS,
	MINERAL_LABELS,
	OTHER_NUTRIENT_LABELS,
	SUGAR_ALCOHOL_LABELS,
	WATER_SOLUBLE_VITAMIN_LABELS
} from "./nutrient-labels.js";
export { createEmptyDetails, buildFullEmptyTemplate, buildFullTemplateFromCurrent, normalizeImportedData } from "./ingredient-schema.js";
export {
	forceReloadIngredientDetails,
	hasIngredientData,
	invalidateIngredientDetailsCache,
	loadIngredientDetails,
	saveIngredientDetails
} from "./ingredient-details-store.js";

const UNIT_OPTIONS = ["g", "ml", "Stück", "EL", "TL", "Portion"];
const CATEGORY_OPTIONS = [
	"", "Gemüse", "Obst", "Fleisch", "Fisch", "Milchprodukt",
	"Sojaprodukt", "Getreide", "Hülsenfrüchte", "Nüsse & Samen",
	"Fett & Öl", "Süßungsmittel", "Gewürz", "Getränk", "Sonstiges"
];

// ─── Popup state ─────────────────────────────────────────────────────────────

let _popupEl = null;
let _currentResolve = null;

function getOrCreatePopupEl() {
	if (_popupEl) return _popupEl;
	_popupEl = document.createElement("div");
	_popupEl.id = "ingredientDetailsOverlay";
	_popupEl.className = "hidden fixed inset-x-0 top-0 z-50";
	_popupEl.style.height = "100dvh";
	document.body.appendChild(_popupEl);
	return _popupEl;
}

function closePopup() {
	const el = document.getElementById("ingredientDetailsOverlay");
	if (el) el.classList.add("hidden");
	if (_currentResolve) { _currentResolve(null); _currentResolve = null; }
}

// ─── HTML helpers ─────────────────────────────────────────────────────────────

function escHtml(s) {
	return String(s ?? "")
		.replace(/&/g, "&amp;").replace(/</g, "&lt;")
		.replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function numInput(id, value) {
	return `<input type="number" id="${id}" value="${value ?? ""}"
		step="any" min="0"
		class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" />`;
}

function textInput(id, value, placeholder = "") {
	return `<input type="text" id="${id}" value="${escHtml(value ?? "")}" placeholder="${escHtml(placeholder)}"
		class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" />`;
}

function selectInput(id, options, currentValue) {
	const opts = options.map(o =>
		`<option value="${escHtml(o)}" ${o === currentValue ? "selected" : ""}>${escHtml(o || "— Wählen —")}</option>`
	).join("");
	return `<select id="${id}" class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">${opts}</select>`;
}

function fieldRow(label, inputHtml, unit = "") {
	return `
		<div>
			<label class="text-xs text-gray-500">${escHtml(label)}</label>
			<div class="flex items-center gap-1 mt-1">
				<div class="flex-1">${inputHtml}</div>
				${unit ? `<span class="text-xs text-gray-500 shrink-0">${escHtml(unit)}</span>` : ""}
			</div>
		</div>`;
}

function summaryTile(label, value, unit) {
	const display = (value !== null && value !== undefined && value !== "") ? value : "—";
	return `
		<div class="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-center min-w-0">
			<div class="text-lg font-bold text-gray-900 truncate">${display}<span class="text-xs font-normal text-gray-500 ml-0.5">${display !== "—" ? unit : ""}</span></div>
			<div class="text-xs text-gray-500 mt-0.5">${escHtml(label)}</div>
		</div>`;
}

// ─── Selectable nutrient sections ─────────────────────────────────────────────

/**
 * Baut eine aufklappbare Sektion, die nur Felder mit Werten zeigt.
 * Über "+" können weitere Felder aus einem Dropdown hinzugefügt werden.
 */
function buildSelectableSection(sectionId, title, labelMap, dataObj) {
	const presentKeys = Object.keys(labelMap).filter(k => {
		const v = dataObj?.[k];
		return v !== null && v !== undefined;
	});

	const rows = presentKeys.map(k => _selectableRow(sectionId, k, labelMap[k], dataObj[k])).join("");
	const countLabel = presentKeys.length > 0 ? `${presentKeys.length} Einträge` : "leer";

	return `
		<div class="border border-gray-200 rounded-xl" data-section="${sectionId}">
			<button type="button" data-toggle="${sectionId}-body"
				class="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-800 bg-gray-50 hover:bg-gray-100 transition">
				<span>${escHtml(title)}</span>
				<div class="flex items-center gap-2">
					<span class="text-xs font-normal text-gray-400" id="${sectionId}-count">${countLabel}</span>
					<svg data-icon="${sectionId}-body" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
					</svg>
				</div>
			</button>
			<div id="${sectionId}-body" class="hidden px-4 pb-4 pt-3 space-y-2">
				<div id="${sectionId}-fields" class="grid grid-cols-2 gap-x-3 gap-y-3">
					${rows}
				</div>
				<div class="mt-2" id="${sectionId}-add-wrap">
					<button type="button" data-add-section="${sectionId}"
						class="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium">
						<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/>
						</svg>
						Hinzufügen
					</button>
					<div id="${sectionId}-dropdown" class="hidden mt-2 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
						<div id="${sectionId}-dropdown-list" class="py-1"></div>
					</div>
				</div>
			</div>
		</div>`;
}

function _selectableRow(sectionId, fieldKey, [label, unit], value) {
	return `
		<div class="contents" data-section-row="${sectionId}" data-field-key="${escHtml(fieldKey)}">
			<div>
				<label class="text-xs text-gray-500">${escHtml(label)}</label>
				<div class="flex items-center gap-1 mt-1">
					<input type="number" data-field-input="${escHtml(fieldKey)}" value="${value ?? ""}"
						step="any" min="0"
						class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" />
					<span class="text-xs text-gray-500 shrink-0">${escHtml(unit)}</span>
				</div>
			</div>
			<div class="flex items-end pb-0.5">
				<button type="button" data-remove-field="${escHtml(fieldKey)}" data-remove-section="${sectionId}"
					class="mt-5 w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:bg-red-50 hover:border-red-300 hover:text-red-500 text-sm shrink-0">
					×
				</button>
			</div>
		</div>`;
}

function _updateSectionCount(overlay, sectionId) {
	const fields = overlay.querySelectorAll(`[data-section-row="${sectionId}"]`);
	const countEl = overlay.querySelector(`#${sectionId}-count`);
	if (countEl) countEl.textContent = fields.length > 0 ? `${fields.length} Einträge` : "leer";
}

function _refreshDropdown(overlay, sectionId, labelMap) {
	const list = overlay.querySelector(`#${sectionId}-dropdown-list`);
	if (!list) return;
	const presentKeys = new Set(
		Array.from(overlay.querySelectorAll(`[data-section-row="${sectionId}"]`))
			.map(el => el.dataset.fieldKey)
	);
	const available = Object.keys(labelMap).filter(k => !presentKeys.has(k));
	list.innerHTML = available.length === 0
		? `<div class="px-4 py-3 text-xs text-gray-400">Alle Felder bereits hinzugefügt</div>`
		: available.map(k => `
				<button type="button" data-pick-field="${escHtml(k)}" data-pick-section="${sectionId}"
					class="w-full text-left px-4 py-2 text-sm hover:bg-blue-50 hover:text-blue-700 flex items-center justify-between gap-2">
					<span>${escHtml(labelMap[k][0])}</span>
					<span class="text-xs text-gray-400 shrink-0">${escHtml(labelMap[k][1])}</span>
				</button>`).join("");
}

// ─── Extra fields section ──────────────────────────────────────────────────────

function buildExtraSection(extra) {
	const entries = Object.entries(extra || {});
	const rows = entries.map(([k, v]) =>
		`<div class="contents" data-extra-key="${escHtml(k)}">
			<div>${textInput(`extra_key_${escHtml(k)}`, k, "Schlüssel")}</div>
			<div class="flex gap-1">
				${textInput(`extra_val_${escHtml(k)}`, v, "Wert")}
				<button type="button" data-remove-extra="${escHtml(k)}"
					class="shrink-0 w-8 h-full flex items-center justify-center rounded-lg border border-gray-300 text-gray-400 hover:bg-red-50 hover:border-red-300 hover:text-red-500 text-sm">×</button>
			</div>
		</div>`
	).join("");
	return `
		<div class="border border-gray-200 rounded-xl overflow-hidden">
			<button type="button" data-toggle="det-extra-body"
				class="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-800 bg-gray-50 hover:bg-gray-100 transition">
				<span>Weitere Felder (Extra)</span>
				<svg data-icon="det-extra-body" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
				</svg>
			</button>
			<div id="det-extra-body" class="hidden px-4 pb-4 pt-3 space-y-2">
				<div id="det-extra-grid" class="grid grid-cols-2 gap-2">${rows}</div>
				<button type="button" id="det-add-extra"
					class="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium mt-2">
					<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/>
					</svg>
					Feld hinzufügen
				</button>
			</div>
		</div>`;
}

// ─── Main popup open ───────────────────────────────────────────────────────────

export async function openIngredientDetailsPopup(label, key) {
	const overlay = getOrCreatePopupEl();

	overlay.innerHTML = `
		<div class="absolute inset-0 bg-black/40"></div>
		<div class="relative h-full flex items-end sm:items-center justify-center px-0 pt-0 sm:p-4"
			style="padding-bottom: max(1rem, env(safe-area-inset-bottom, 0px) + 1rem);">
			<div class="w-full sm:max-w-xl bg-white rounded-2xl shadow-xl flex items-center justify-center h-48"
				style="max-height: calc(100dvh - max(2rem, env(safe-area-inset-bottom, 0px) + 2rem));">
				<div class="text-gray-500 text-sm">Lade Nährstoffdaten…</div>
			</div>
		</div>`;
	overlay.classList.remove("hidden");

	const creds = loadCreds();
	let data;
	try {
		const loaded = creds ? await loadIngredientDetails(creds, key) : null;
		data = loaded ?? createEmptyDetails(label);
	} catch (err) {
		console.warn("Nährstoffdaten laden fehlgeschlagen:", err);
		data = createEmptyDetails(label);
	}

	_renderPopup(overlay, label, key, data, creds);
	return new Promise(resolve => { _currentResolve = resolve; });
}

// ─── Render ────────────────────────────────────────────────────────────────────

function _renderPopup(overlay, label, key, data, creds) {
	const m = data.macros || {};

	overlay.innerHTML = `
		<div class="absolute inset-0 bg-black/40" id="det-backdrop"></div>
		<div class="relative h-full flex items-end sm:items-center justify-center px-0 pt-0 sm:p-4 pointer-events-none"
			style="padding-bottom: max(1rem, env(safe-area-inset-bottom, 0px) + 1rem);">
			<div class="w-full sm:max-w-xl bg-white rounded-2xl shadow-xl flex flex-col max-h-[92vh] overflow-hidden pointer-events-auto"
				style="max-height: calc(100dvh - max(2rem, env(safe-area-inset-bottom, 0px) + 2rem));">

				<!-- Header -->
				<div class="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
					<h2 class="text-lg font-semibold truncate pr-2">${escHtml(label)}</h2>
					<button id="det-close" type="button"
						class="p-1 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-800 shrink-0">
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
						</svg>
					</button>
				</div>

				<!-- Scrollable body -->
				<div class="overflow-y-auto flex-1 px-5 py-4 space-y-4">

					<!-- Summary tiles -->
					<div class="flex gap-2 flex-wrap">
						${summaryTile("kcal", m.kcal, "kcal")}
						${summaryTile("Protein", m.protein, "g")}
						${summaryTile("Fett", m.fat, "g")}
						${summaryTile("KH", m.carbs, "g")}
					</div>

					<!-- Basisdaten -->
					<div class="grid grid-cols-2 gap-x-3 gap-y-3">
						${fieldRow("Name", textInput("det_name", data.name))}
						${fieldRow("Kategorie", selectInput("det_category", CATEGORY_OPTIONS, data.category))}
						${fieldRow("Einheit", selectInput("det_unit", UNIT_OPTIONS, data.unit))}
						${fieldRow("Referenzmenge", numInput("det_refAmount", data.referenceAmount))}
					</div>

					<!-- Makros (immer aufgeklappt) -->
					<div class="border border-gray-200 rounded-xl overflow-hidden">
						<div class="px-4 py-3 bg-gray-50 text-sm font-semibold text-gray-800">Makronährstoffe</div>
						<div class="px-4 pb-4 pt-3 grid grid-cols-2 gap-x-3 gap-y-3">
							${Object.entries(MACRO_LABELS).map(([k, [lbl, unit]]) =>
								fieldRow(lbl, numInput(`det_macro_${k}`, m[k]), unit)
							).join("")}
						</div>
					</div>

					<!-- Vitamine -->
					${buildSelectableSection("det-vitamins-fat", "Fettlösliche Vitamine", FAT_SOLUBLE_VITAMIN_LABELS, data.vitamins)}
					${buildSelectableSection("det-vitamins-water", "Wasserlösliche Vitamine", WATER_SOLUBLE_VITAMIN_LABELS, data.vitamins)}

					<!-- Mineralstoffe -->
					${buildSelectableSection("det-minerals", "Elemente (Mineralstoffe)", MINERAL_LABELS, data.minerals)}

					<!-- Kohlenhydrate & Ballaststoffe -->
					${buildSelectableSection("det-carbs", "Kohlenhydrate (ohne Ballaststoffe)", CARB_LABELS, data.carbohydrates)}
					${buildSelectableSection("det-fiber", "Ballaststoffe", FIBER_LABELS, data.fibers)}
					${buildSelectableSection("det-sugar-alcohols", "Zuckeralkohole", SUGAR_ALCOHOL_LABELS, data.sugarAlcoholsDetail)}

					<!-- Fettsäuren -->
					${buildSelectableSection("det-fatty-acids", "Fettsäuren", FATTY_ACID_LABELS, data.fattyAcids)}

					<!-- Aminosäuren & Sonstiges -->
					${buildSelectableSection("det-amino-acids", "Aminosäuren", AMINO_LABELS, data.aminoAcids)}
					${buildSelectableSection("det-other-nutrients", "Sonstige Nährstoffe", OTHER_NUTRIENT_LABELS, data.otherNutrients)}

					<!-- Notizen & Quelle -->
					<div class="border border-gray-200 rounded-xl overflow-hidden">
						<button type="button" data-toggle="det-notes-body"
							class="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-800 bg-gray-50 hover:bg-gray-100 transition">
							<span>Notizen &amp; Quelle</span>
							<svg data-icon="det-notes-body" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
							</svg>
						</button>
						<div id="det-notes-body" class="hidden px-4 pb-4 pt-3 space-y-3">
							<div>
								<label class="text-xs text-gray-500">Quelle / Referenz</label>
								<input type="text" id="det_source" value="${escHtml(data.source ?? "")}" placeholder="z.B. BLS, fddb.info, &hellip;"
									class="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" />
							</div>
							<div>
								<label class="text-xs text-gray-500">Notizen</label>
								<textarea id="det_notes" rows="3"
									class="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm resize-none">${escHtml(data.notes ?? "")}</textarea>
							</div>
						</div>
					</div>

					<!-- Extra Felder -->
					${buildExtraSection(data.extra)}

				</div>

				<!-- Footer -->
				<div class="px-5 pt-4 border-t border-gray-200 shrink-0 space-y-3"
					style="padding-bottom: calc(1rem + env(safe-area-inset-bottom, 0px));">
					<div class="flex gap-2">
						<button id="det-gpt" type="button"
							class="flex-1 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
							GPT
						</button>
						<button id="det-copy-template" type="button"
							class="flex-1 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
							JSON Vorlage kopieren
						</button>
						<button id="det-import-json" type="button"
							class="flex-1 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
							JSON importieren
						</button>
						<button id="det-import-bls" type="button"
							class="flex-1 rounded-xl border border-green-300 bg-green-50 px-3 py-2 text-sm font-medium text-green-700 hover:bg-green-100">
							📊 Template
						</button>
					</div>
					<div id="det-gpt-panel" class="hidden rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2">
						<label for="det-gpt-input" class="text-xs text-gray-600">Quelle, URL, Packungstext oder Hinweis zum Bild</label>
						<textarea id="det-gpt-input" rows="5" placeholder="z.B. URL mit Nährwerten, Text von der Packung, oder: Ich hänge ein Foto der Nährwerttabelle an."
							class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"></textarea>
						<div class="flex gap-2">
							<button id="det-gpt-cancel" type="button"
								class="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
								Abbrechen
							</button>
							<button id="det-gpt-go" type="button"
							class="flex-1 rounded-lg bg-brand-ink px-3 py-2 text-sm text-white hover:bg-brand-ink-hover">
								Zu ChatGPT
							</button>
						</div>
					</div>
					<div id="det-import-panel" class="hidden rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2">
						<label for="det-import-text" class="text-xs text-gray-600">JSON hier einfügen</label>
						<textarea id="det-import-text" rows="7" placeholder='{"name":"Karotten", ...}'
							class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-mono"></textarea>
						<div class="flex gap-2">
							<button id="det-import-cancel" type="button"
								class="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
								Abbrechen
							</button>
							<button id="det-import-apply" type="button"
							class="flex-1 rounded-lg bg-brand-primary px-3 py-2 text-sm text-white hover:bg-brand-primary-hover">
								Übernehmen
							</button>
						</div>
					</div>
					<div class="flex gap-3">
						<button id="det-cancel" type="button"
							class="flex-1 rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50">
							Abbrechen
						</button>
						<button id="det-save" type="button"
						class="flex-1 rounded-xl bg-brand-primary px-4 py-3 text-sm font-medium text-white hover:bg-brand-primary-hover">
							Speichern
						</button>
					</div>
				</div>

			</div>
		</div>`;

	_bindPopupEvents(overlay, label, key, data, creds);
}

// ─── Event binding ─────────────────────────────────────────────────────────────

const SECTION_MAPS = {
	"det-vitamins-fat": FAT_SOLUBLE_VITAMIN_LABELS,
	"det-vitamins-water": WATER_SOLUBLE_VITAMIN_LABELS,
	"det-minerals": MINERAL_LABELS,
	"det-carbs": CARB_LABELS,
	"det-fiber": FIBER_LABELS,
	"det-sugar-alcohols": SUGAR_ALCOHOL_LABELS,
	"det-fatty-acids": FATTY_ACID_LABELS,
	"det-amino-acids": AMINO_LABELS,
	"det-other-nutrients": OTHER_NUTRIENT_LABELS
};

function _closeAllDropdowns(overlay) {
	overlay.querySelectorAll("[id$='-dropdown']").forEach(d => d.classList.add("hidden"));
}

function _collectPopupData(overlay, label) {
	const macros = {};
	for (const k of Object.keys(MACRO_LABELS)) {
		const el = overlay.querySelector(`#det_macro_${k}`);
		macros[k] = el && el.value !== "" ? parseFloat(el.value) : null;
	}

	const collectSection = (sectionId) => {
		const obj = {};
		overlay.querySelectorAll(`[data-section-row="${sectionId}"]`).forEach(row => {
			const fk = row.dataset.fieldKey;
			const input = row.querySelector(`[data-field-input="${fk}"]`);
			obj[fk] = input && input.value !== "" ? parseFloat(input.value) : null;
		});
		return obj;
	};

	const extra = {};
	overlay.querySelectorAll("[data-extra-key]").forEach(row => {
		const origKey = row.dataset.extraKey;
		const keyEl = overlay.querySelector(`#extra_key_${origKey}`);
		const valEl = overlay.querySelector(`#extra_val_${origKey}`);
		if (keyEl && valEl) {
			const k = keyEl.value.trim();
			if (k) extra[k] = valEl.value;
		}
	});

	return {
		name: overlay.querySelector("#det_name")?.value || label,

		referenceAmount: (() => {
			const v = overlay.querySelector("#det_refAmount")?.value;
			return v ? parseFloat(v) : 100;
		})(),
		unit: overlay.querySelector("#det_unit")?.value ?? "g",
		category: overlay.querySelector("#det_category")?.value ?? "",
		notes: overlay.querySelector("#det_notes")?.value ?? "",
		source: overlay.querySelector("#det_source")?.value ?? "",
		macros,
		vitamins: {
			...collectSection("det-vitamins-fat"),
			...collectSection("det-vitamins-water")
		},
		minerals: collectSection("det-minerals"),
		carbohydrates: collectSection("det-carbs"),
		fibers: collectSection("det-fiber"),
		sugarAlcoholsDetail: collectSection("det-sugar-alcohols"),
		fattyAcids: collectSection("det-fatty-acids"),
		aminoAcids: collectSection("det-amino-acids"),
		otherNutrients: collectSection("det-other-nutrients"),
		extra
	};
}

function _bindPopupEvents(overlay, label, key, data, creds) {
	// ── Close ──
	overlay.querySelector("#det-close")?.addEventListener("click", closePopup);
	overlay.querySelector("#det-cancel")?.addEventListener("click", closePopup);
	overlay.querySelector("#det-backdrop")?.addEventListener("click", (e) => {
		if (e.target === overlay.querySelector("#det-backdrop")) closePopup();
	});

	const gptPanel = overlay.querySelector("#det-gpt-panel");
	const gptInput = overlay.querySelector("#det-gpt-input");
	overlay.querySelector("#det-gpt")?.addEventListener("click", () => {
		if (!gptPanel) return;
		gptPanel.classList.remove("hidden");
		gptInput?.focus();
	});

	overlay.querySelector("#det-gpt-cancel")?.addEventListener("click", () => {
		if (!gptPanel) return;
		gptPanel.classList.add("hidden");
		if (gptInput) gptInput.value = "";
	});

	overlay.querySelector("#det-gpt-go")?.addEventListener("click", async () => {
		const current = _collectPopupData(overlay, label);
		const prompt = buildIngredientGptPromptWithInput(label, current, gptInput?.value?.trim() || "");
		window.location.href = `https://chat.openai.com/?q=${encodeURIComponent(prompt)}&temporary-chat=true`;
	});

	// ── Collapsibles ──
	overlay.querySelectorAll("[data-toggle]").forEach(btn => {
		btn.addEventListener("click", () => {
			const targetId = btn.dataset.toggle;
			const target = overlay.querySelector(`#${targetId}`);
			const icon = overlay.querySelector(`[data-icon="${targetId}"]`);
			if (target) {
				const isNowHidden = target.classList.toggle("hidden");
				icon?.classList.toggle("rotate-180", !isNowHidden);
			}
		});
	});

	// ── Delegated click handler for add/pick/remove ──
	overlay.addEventListener("click", (e) => {
		// Open dropdown
		const addBtn = e.target.closest("[data-add-section]");
		if (addBtn) {
			const sectionId = addBtn.dataset.addSection;
			const dropdown = overlay.querySelector(`#${sectionId}-dropdown`);
			if (!dropdown) return;
			const opening = dropdown.classList.toggle("hidden");
			if (!opening) {
				_refreshDropdown(overlay, sectionId, SECTION_MAPS[sectionId]);
			}
			e.stopPropagation();
			return;
		}

		// Pick field from dropdown
		const pickBtn = e.target.closest("[data-pick-field]");
		if (pickBtn) {
			const fieldKey = pickBtn.dataset.pickField;
			const sectionId = pickBtn.dataset.pickSection;
			const labelMap = SECTION_MAPS[sectionId];
			if (!labelMap?.[fieldKey]) return;
			_closeAllDropdowns(overlay);
			const fieldsContainer = overlay.querySelector(`#${sectionId}-fields`);
			if (!fieldsContainer) return;
			const div = document.createElement("div");
			div.className = "contents";
			div.innerHTML = _selectableRow(sectionId, fieldKey, labelMap[fieldKey], null);
			fieldsContainer.appendChild(div);
			_updateSectionCount(overlay, sectionId);
			div.querySelector("input")?.focus();
			return;
		}

		// Remove selectable row
		const removeField = e.target.closest("[data-remove-field]");
		if (removeField) {
			const fieldKey = removeField.dataset.removeField;
			const sectionId = removeField.dataset.removeSection;
			overlay.querySelectorAll(`[data-section-row="${sectionId}"][data-field-key="${CSS.escape(fieldKey)}"]`)
				.forEach(r => r.remove());
			_updateSectionCount(overlay, sectionId);
			return;
		}

		// Remove extra field
		const removeExtra = e.target.closest("[data-remove-extra]");
		if (removeExtra) {
			overlay.querySelectorAll(`[data-extra-key="${CSS.escape(removeExtra.dataset.removeExtra)}"]`)
				.forEach(r => r.remove());
			return;
		}

		// Click outside → close dropdowns
		if (!e.target.closest("[id$='-dropdown']")) {
			_closeAllDropdowns(overlay);
		}
	});

	// ── Add extra field ──
	overlay.querySelector("#det-add-extra")?.addEventListener("click", () => {
		const grid = overlay.querySelector("#det-extra-grid");
		if (!grid) return;
		const tempKey = `custom_${Date.now()}`;
		const div = document.createElement("div");
		div.className = "contents";
		div.dataset.extraKey = tempKey;
		div.innerHTML = `
			<div>${textInput(`extra_key_${tempKey}`, "", "Schlüssel")}</div>
			<div class="flex gap-1">
				${textInput(`extra_val_${tempKey}`, "", "Wert")}
				<button type="button" data-remove-extra="${escHtml(tempKey)}"
					class="shrink-0 w-8 flex items-center justify-center rounded-lg border border-gray-300 text-gray-400 hover:bg-red-50 hover:border-red-300 hover:text-red-500 text-sm">×</button>
			</div>`;
		grid.appendChild(div);
		div.querySelector("input")?.focus();
	});

	// ── Copy full JSON template (all possible fields) ──
	overlay.querySelector("#det-copy-template")?.addEventListener("click", async () => {
		const current = _collectPopupData(overlay, label);
		const fullTemplate = buildFullTemplateFromCurrent(current, label);
		const pretty = JSON.stringify(fullTemplate, null, 2);
		try {
			await navigator.clipboard.writeText(pretty);
			const btn = overlay.querySelector("#det-copy-template");
			if (btn) {
				const prev = btn.textContent;
				btn.textContent = "Kopiert";
				setTimeout(() => { btn.textContent = prev; }, 1200);
			}
		} catch {
			alert("Kopieren fehlgeschlagen. Bitte Browser-Rechte für die Zwischenablage prüfen.");
		}
	});

	// ── Import JSON text into current popup ──
	const importBtn = overlay.querySelector("#det-import-json");
	const importPanel = overlay.querySelector("#det-import-panel");
	const importText = overlay.querySelector("#det-import-text");
	const importApply = overlay.querySelector("#det-import-apply");
	const importCancel = overlay.querySelector("#det-import-cancel");

	importBtn?.addEventListener("click", () => {
		if (!importPanel) return;
		importPanel.classList.remove("hidden");
		importText?.focus();
	});

	importCancel?.addEventListener("click", () => {
		if (!importPanel) return;
		importPanel.classList.add("hidden");
		if (importText) importText.value = "";
	});

	importApply?.addEventListener("click", () => {
		const raw = importText?.value?.trim();
		if (!raw) {
			alert("Bitte JSON einfügen.");
			return;
		}
		try {
			const parsed = JSON.parse(raw);
			const normalized = normalizeImportedData(parsed, label);
			_renderPopup(overlay, normalized.name || label, key, normalized, creds);
		} catch (err) {
			console.error("JSON-Import fehlgeschlagen:", err);
			alert("JSON-Import fehlgeschlagen. Bitte gültigen JSON-Text prüfen.");
		}
	});

	// ── BLS Template Import ──
	const blsBtn = overlay.querySelector("#det-import-bls");
	blsBtn?.addEventListener("click", () => {
		// Trigger BLS Modal mit aktueller Zutat
		if (typeof blsImporter !== 'undefined') {
			blsImporter.openImportModal(label, blsBtn);
		} else {
			alert("BLS-Templates nicht geladen. Bitte Seite neu laden.");
		}
	});

	// Listen für BLS Import Events
	const handleBLSImport = (e) => {
		const { template, importNote } = e.detail;
		
		// Normalisiere das BLS Template
		const normalized = normalizeImportedData(template, label);
		
		// Füge die Import-Note hinzu
		if (normalized.notes) {
			normalized.notes += "\n" + importNote;
		} else {
			normalized.notes = importNote;
		}
		
		// Rendern Sie das Popup mit den importierten Daten neu
		_renderPopup(overlay, normalized.name || label, key, normalized, creds);
	};
	
	document.addEventListener('blsTemplateImported', handleBLSImport, { once: true });

	// ── Save ──
	overlay.querySelector("#det-save")?.addEventListener("click", async () => {
		const result = _collectPopupData(overlay, label);

		const saveBtn = overlay.querySelector("#det-save");
		saveBtn.textContent = "Speichern…";
		saveBtn.disabled = true;

		if (creds) {
			try {
				await saveIngredientDetails(creds, key, result);
			} catch (err) {
				console.error("Speichern fehlgeschlagen:", err);
				alert(`Speichern fehlgeschlagen: ${err.message}`);
				saveBtn.textContent = "Speichern";
				saveBtn.disabled = false;
				return;
			}
		}

		overlay.classList.add("hidden");
		if (_currentResolve) { _currentResolve(result); _currentResolve = null; }
	});
}
