/**
 * Ingredient Details Module
 *
 * Lädt, speichert und zeigt detaillierte Nährstoffinformationen
 * für einzelne Zutaten aus dem Nextcloud-Ordner "ingredients_details/".
 *
 * Features:
 * - Offline-First Caching (IndexedDB)
 * - ETag-basierte Updates (nur bei Änderung laden)
 * - Stale-While-Revalidate Pattern
 *
 * Dateinamenschema: ingredients_details/<normalisierter-key>.json
 */

import { APP } from "../core/config.js";
import { loadCreds, davBaseFolderUrl, get, put } from "../dav/webdav.js";
import { 
  getIngredientDetailsFromCache, 
  saveIngredientDetailsToCache,
	deleteIngredientDetailsFromCache
} from "../storage/db.js";

// ─── Schema ──────────────────────────────────────────────────────────────────

export function createEmptyDetails(name = "") {
	return {
		name,

		referenceAmount: 100,
		unit: "g",
		category: "",
		notes: "",
		source: "",
		macros: {
			kcal: null,
			water: null,
			protein: null,
			fat: null,
			carbs: null,
			fiber: null,
			alcohol: null,
			sugarAlcohols: null
		},
		vitamins: {},
		minerals: {},
		carbohydrates: {},
		fibers: {},
		sugarAlcoholsDetail: {},
		fattyAcids: {},
		aminoAcids: {},
		otherNutrients: {},
		extra: {}
	};
}

// ─── Label-Mappings ──────────────────────────────────────────────────────────

export const MACRO_LABELS = {
	kcal:          ["Kalorien (kcal)",   "kcal"],
	water:         ["Wasser",            "g"],
	protein:       ["Protein",           "g"],
	fat:           ["Fett",              "g"],
	carbs:         ["Kohlenhydrate",     "g"],
	fiber:         ["Ballaststoffe",     "g"],
	alcohol:       ["Alkohol (Ethanol)", "g"],
	sugarAlcohols: ["Zuckeralkohole",    "g"]
};

export const FAT_SOLUBLE_VITAMIN_LABELS = {
	vita:      ["Vitamin A, Retinol-Äquivalent (RE)", "µg"],
	vitaa:     ["Vitamin A, Retinol-Aktivitäts-Äquivalent (RAE)", "µg"],
	retol:     ["Retinol", "µg"],
	cartb:     ["Beta-Carotin", "µg"],
	carotpaxb: ["Carotinoide, außer Beta-Carotin", "µg"],
	vitd:      ["Vitamin D", "µg"],
	chocal:    ["Vitamin D3 (Cholecalciferol)", "µg"],
	ergcal:    ["Vitamin D2 (Ergocalciferol)", "µg"],
	vite:      ["Vitamin E (Alpha-Tocopherol)", "mg"],
	tocpha:    ["Alpha-Tocopherol", "mg"],
	tocphb:    ["Beta-Tocopherol", "mg"],
	tocphg:    ["Gamma-Tocopherol", "mg"],
	tocphd:    ["Delta-Tocopherol", "mg"],
	toctra:    ["Alpha-Tocotrienol", "mg"],
	vitk:      ["Vitamin K", "µg"],
	vitk1:     ["Vitamin K1 (Phyllochinon)", "µg"],
	vitk2:     ["Vitamin K2 (Menachinone)", "µg"]
};

export const WATER_SOLUBLE_VITAMIN_LABELS = {
	thia:   ["Vitamin B1 (Thiamin)", "mg"],
	ribf:   ["Vitamin B2 (Riboflavin)", "mg"],
	niaeq:  ["Niacin-Äquivalent", "mg"],
	nia:    ["Niacin", "mg"],
	pantac: ["Pantothensäure", "mg"],
	vitb6:  ["Vitamin B6", "µg"],
	biot:   ["Biotin", "µg"],
	fol:    ["Folat-Äquivalent", "µg"],
	folfd:  ["Folat", "µg"],
	folac:  ["Folsäure, synthetisch", "µg"],
	vitb12: ["Vitamin B12 (Cobalamine)", "µg"],
	vitc:   ["Vitamin C", "mg"]
};

export const MINERAL_LABELS = {
	nacl: ["Salz (Natriumchlorid)", "g"],
	na:   ["Natrium", "mg"],
	cld:  ["Chlorid", "mg"],
	k:    ["Kalium", "mg"],
	ca:   ["Calcium", "mg"],
	mg:   ["Magnesium", "mg"],
	p:    ["Phosphor", "mg"],
	s:    ["Schwefel", "mg"],
	fe:   ["Eisen", "mg"],
	zn:   ["Zink", "mg"],
	id:   ["Iodid", "µg"],
	cu:   ["Kupfer", "µg"],
	mn:   ["Mangan", "µg"],
	fd:   ["Fluorid", "µg"],
	cr:   ["Chrom", "µg"],
	mo:   ["Molybdän", "µg"]
};

export const CARB_LABELS = {
	cho:    ["Kohlenhydrate, verfügbar", "g"],
	mnsac:  ["Monosaccharide, gesamt", "g"],
	glus:   ["Glucose", "g"],
	frus:   ["Fructose", "g"],
	gals:   ["Galactose", "g"],
	disac:  ["Disaccharide, gesamt", "g"],
	sucs:   ["Saccharose", "g"],
	mals:   ["Maltose", "g"],
	lacs:   ["Lactose", "g"],
	sugar:  ["Zucker (Mono- und Disaccharide), gesamt", "g"],
	olsac:  ["Oligosaccharide, verfügbar", "g"],
	starch: ["Stärke (Stärke, Glykogen, Dextrine)", "g"]
};

export const FIBER_LABELS = {
	fibt:    ["Ballaststoffe, gesamt", "g"],
	fiblmw:  ["Ballaststoffe, niedermolekular", "g"],
	fibhmw:  ["Ballaststoffe, hochmolekular", "g"],
	fibins:  ["Ballaststoffe, wasserunlöslich", "g"],
	fibsol:  ["Ballaststoffe, wasserlöslich", "g"],
	fibhmws: ["Ballaststoffe, hochmolekular, wasserlöslich", "g"],
	fibhmwi: ["Ballaststoffe, hochmolekular, wasserunlöslich", "g"]
};

export const SUGAR_ALCOHOL_LABELS = {
	polyl: ["Zuckeralkohole, gesamt", "g"],
	mantl: ["Mannit", "g"],
	sortl: ["Sorbit", "g"],
	xyltl: ["Xylit", "g"]
};

export const FATTY_ACID_LABELS = {
	fasat:    ["Fettsäuren, gesättigt, gesamt", "g"],
	f4_0:     ["Fettsäure C4:0 (Buttersäure)", "g"],
	f6_0:     ["Fettsäure C6:0 (Capronsäure)", "g"],
	f8_0:     ["Fettsäure C8:0 (Caprylsäure)", "g"],
	f10_0:    ["Fettsäure C10:0 (Caprinsäure)", "g"],
	f12_0:    ["Fettsäure C12:0 (Laurinsäure)", "g"],
	f14_0:    ["Fettsäure C14:0 (Myristinsäure)", "g"],
	f15_0:    ["Fettsäure C15:0 (Pentadecylsäure)", "g"],
	f16_0:    ["Fettsäure C16:0 (Palmitinsäure)", "g"],
	f17_0:    ["Fettsäure C17:0 (Margarinsäure)", "g"],
	f18_0:    ["Fettsäure C18:0 (Stearinsäure)", "g"],
	f20_0:    ["Fettsäure C20:0 (Arachinsäure)", "g"],
	f22_0:    ["Fettsäure C22:0 (Behensäure)", "g"],
	f24_0:    ["Fettsäure C24:0 (Lignocerinsäure)", "g"],
	fams:     ["Fettsäure, einfach ungesättigt, gesamt", "g"],
	f14_1cn5: ["Fettsäure C14:1 n-5 cis (Myristoleinsäure)", "g"],
	f16_1cn7: ["Fettsäure C16:1 n-7 cis (Palmitoleinsäure)", "g"],
	f18_1cn7: ["Fettsäure C18:1 n-7 cis (Vaccensäure)", "g"],
	f18_1cn9: ["Fettsäure C18:1 n-9 cis (Ölsäure)", "g"],
	f20_1cn9: ["Fettsäure C20:1 n-9 cis (Gondosäure)", "g"],
	f22_1cn9: ["Fettsäure C22:1 n-9 cis (Erucasäure)", "g"],
	fapu:     ["Fettsäuren, mehrfach ungesättigt, gesamt", "g"],
	fapun3:   ["Fettsäuren, mehrfach ungesättigt n-3 (Omega-3), gesamt", "g"],
	f18_3cn3: ["Fettsäure C18:3 n-3 all-cis (Alpha-Linolensäure)", "g"],
	f18_4cn3: ["Fettsäure C18:4 n-3 all-cis (Stearidonsäure)", "g"],
	f20_5cn3: ["Fettsäure C20:5 n-3 all-cis (Eicosapentaensäure)", "g"],
	f22_5cn3: ["Fettsäure C22:5 n-3 all-cis (Docosapentaensäure)", "g"],
	f22_6cn3: ["Fettsäure C22:6 n-3 all-cis (Docosahexaensäure)", "g"],
	fapun6:   ["Fettsäuren, mehrfach ungesättigt n-6 (Omega-6), gesamt", "g"],
	f18_2cn6: ["Fettsäure C18:2 n-6 cis, cis (Linolsäure)", "g"],
	f18_2c9t11: ["Fettsäure C18:2 n-7 cis 9, trans 11 (konjugierte Linolsäure)", "g"],
	f18_3cn6: ["Fettsäure C18:3 n-6 all-cis (Gamma-Linolensäure)", "g"],
	f20_2cn6: ["Fettsäure C20:2 n-6 all-cis (Eicosadiensäure)", "g"],
	f20_3cn6: ["Fettsäure C20:3 n-6 all-cis (Dihomogamma-Linolensäure)", "g"],
	f20_4cn6: ["Fettsäure C20:4 n-6 all-cis (Arachidonsäure)", "g"],
	fax:      ["Fettsäuren, sonstige", "g"]
};

export const AMINO_LABELS = {
	aae9: ["Aminosäuren, unentbehrlich, gesamt", "g"],
	ala:  ["Alanin", "g"],
	arg:  ["Arginin", "g"],
	asp:  ["Asparaginsäure, inklusive Asparagin", "g"],
	cyste: ["Cystein", "g"],
	glu:  ["Glutaminsäure, inklusive Glutamin", "g"],
	gly:  ["Glycin", "g"],
	his:  ["Histidin", "g"],
	ile:  ["Isoleucin", "g"],
	leu:  ["Leucin", "g"],
	lys:  ["Lysin", "g"],
	met:  ["Methionin", "g"],
	phe:  ["Phenylalanin", "g"],
	pro:  ["Prolin", "g"],
	ser:  ["Serin", "g"],
	thr:  ["Threonin", "g"],
	trp:  ["Tryptophan", "g"],
	tyr:  ["Tyrosin", "g"],
	val:  ["Valin", "g"]
};

export const OTHER_NUTRIENT_LABELS = {
	chorl: ["Cholesterin", "mg"],
	nt:    ["Stickstoff, gesamt", "g"]
};

const UNIT_OPTIONS = ["g", "ml", "Stück", "EL", "TL", "Portion"];
const CATEGORY_OPTIONS = [
	"", "Gemüse", "Obst", "Fleisch", "Fisch", "Milchprodukt",
	"Sojaprodukt", "Getreide", "Hülsenfrüchte", "Nüsse & Samen",
	"Fett & Öl", "Süßungsmittel", "Gewürz", "Getränk", "Sonstiges"
];

// ─── DAV helpers ─────────────────────────────────────────────────────────────

function joinUrl(base, rel) {
	return `${String(base).replace(/\/+$/, "")}/${String(rel).replace(/^\/+/, "")}`;
}

function getDetailsUrl(creds, key) {
	const baseFolder = davBaseFolderUrl(creds);
	return joinUrl(baseFolder, joinUrl(APP.INGREDIENT_DETAILS_SUBFOLDER, `${key}.json`));
}

async function ensureIngredientDetailsFolder(creds) {
	const baseFolder = davBaseFolderUrl(creds);
	const folderUrl = joinUrl(baseFolder, APP.INGREDIENT_DETAILS_SUBFOLDER);
	const basic = "Basic " + btoa(`${creds.user}:${creds.pass}`);
	const r = await fetch(folderUrl, {
		method: "MKCOL",
		headers: { "Authorization": basic }
	});
	const res = { status: r.status };

	// 201: erstellt, 405/301: existiert bereits (serverabhängig)
	if ([200, 201, 204, 301, 405].includes(res.status)) return;

	if (res.status === 409) {
		throw new Error("Ordner ingredients_details/ fehlt oder übergeordneter Pfad ist ungültig (HTTP 409)");
	}

	throw new Error(`Ordner ingredients_details/ konnte nicht angelegt werden (HTTP ${res.status})`);
}

export async function loadIngredientDetails(creds, key) {
	// ─── OFFLINE-FIRST: Zuerst aus Cache laden ────────────────────────────
	const cached = await getIngredientDetailsFromCache(key);
	if (cached?.data) {
		// Daten aus Cache vorhanden - sofort zurückgeben
		// Parallel im Hintergrund auf Updates prüfen (Fire-and-Forget)
		if (creds) {
			checkAndUpdateIngredientDetailsInBackground(creds, key, cached.etag);
		}
		return cached.data;
	}
	
	// ─── ONLINE: Cache leer, vom Server laden ──────────────────────────────
	if (!creds) {
		// Offline und kein Cache vorhanden
		return null;
	}
	
	try {
		const url = getDetailsUrl(creds, key);
		const res = await get(url, creds);
		
		if (res.status === 404) return null;
		if (res.status !== 200) throw new Error(`Laden fehlgeschlagen (HTTP ${res.status})`);
		
		let data = null;
		try { data = JSON.parse(res.text); } catch { return null; }
		
		// In Cache speichern mit ETag
		const etag = res.etag || null;
		await saveIngredientDetailsToCache(key, data, etag);
		
		return data;
	} catch (err) {
		console.warn(`Laden von Ingredient Details ${key} fehlgeschlagen:`, err);
		return null;
	}
}

/**
 * Überprüft im Hintergrund, ob es Updates gibt (Stale-While-Revalidate)
 * Diese Funktion aktualisiert den Cache, wenn sich der ETag geändert hat
 */
async function checkAndUpdateIngredientDetailsInBackground(creds, key, cachedEtag) {
	try {
		const url = getDetailsUrl(creds, key);
		// HEAD-Request würde schneller sein, aber nextcloud PUT/GET ist das Standard-Pattern
		const res = await get(url, creds);
		
		if (res.status !== 200) return;
		
		const serverEtag = res.etag;
		// Wenn ETag unterschiedlich, neuen Inhalt laden
		if (serverEtag && serverEtag !== cachedEtag) {
			try {
				const data = JSON.parse(res.text);
				await saveIngredientDetailsToCache(key, data, serverEtag);
				console.log(`[Cache Update] Ingredient ${key} aktualisiert`);
			} catch (e) {
				console.warn(`Update parse fehlgeschlagen für ${key}`);
			}
		}
	} catch (err) {
		// Fehler beim Update ignorieren - Cache bleibt gültig
		console.debug(`Background update fehlgeschlagen für ${key}:`, err.message);
	}
}

export async function saveIngredientDetails(creds, key, data) {
	await ensureIngredientDetailsFolder(creds);
	const url = getDetailsUrl(creds, key);
	const body = JSON.stringify(data, null, 2);
	const res = await put(url, creds, body);
	if (![200, 201, 204].includes(res.status)) {
		throw new Error(`Speichern fehlgeschlagen (HTTP ${res.status})`);
	}
	
	// Cache aktualisieren mit neuem ETag
	const newEtag = res.etag || null;
	await saveIngredientDetailsToCache(key, data, newEtag);
	
	// localStorage hint invalidieren
	const cacheKey = `nutrient_has_data_${key}`;
	localStorage.removeItem(cacheKey);
}

// ─── Nutrient data existence check (cached) ──────────────────────────────────

export async function hasIngredientData(creds, key) {
	if (!creds) return false;
	
	// Cache prüfen (7 Tage TTL)
	const cacheKey = `nutrient_has_data_${key}`;
	const cached = localStorage.getItem(cacheKey);
	if (cached) {
		const { value, timestamp } = JSON.parse(cached);
		const age = Date.now() - timestamp;
		if (age < 7 * 24 * 60 * 60 * 1000) return value;
	}
	
	// Server prüfen
	try {
		const data = await loadIngredientDetails(creds, key);
		const hasData = data !== null && (
			data.macros?.kcal !== null ||
			Object.keys(data.vitamins || {}).length > 0 ||
			Object.keys(data.minerals || {}).length > 0
		);
		
		// In Cache speichern
		localStorage.setItem(cacheKey, JSON.stringify({
			value: hasData,
			timestamp: Date.now()
		}));
		
		return hasData;
	} catch (err) {
		console.warn(`Überprüfung Nährstoffdaten für ${key} fehlgeschlagen:`, err);
		return false;
	}
}

// ─── Cache control helpers ──────────────────────────────────────────────────

export async function invalidateIngredientDetailsCache(key) {
	await deleteIngredientDetailsFromCache(key);
	localStorage.removeItem(`nutrient_has_data_${key}`);
}

export async function forceReloadIngredientDetails(creds, key) {
	if (!creds) return null;
	await invalidateIngredientDetailsCache(key);
	return loadIngredientDetails(creds, key);
}

// ─── Popup state ─────────────────────────────────────────────────────────────

let _popupEl = null;
let _currentResolve = null;

function getOrCreatePopupEl() {
	if (_popupEl) return _popupEl;
	_popupEl = document.createElement("div");
	_popupEl.id = "ingredientDetailsOverlay";
	_popupEl.className = "hidden fixed inset-0 z-50";
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
		<div class="relative min-h-full flex items-end sm:items-center justify-center p-0 sm:p-4">
			<div class="w-full sm:max-w-xl bg-white sm:rounded-2xl shadow-xl flex items-center justify-center h-48">
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
		<div class="relative min-h-full flex items-end sm:items-center justify-center p-0 sm:p-4 pointer-events-none">
			<div class="w-full sm:max-w-xl bg-white rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[92vh] overflow-hidden pointer-events-auto">

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
				<div class="px-5 py-4 border-t border-gray-200 shrink-0 space-y-3">
					<div class="flex gap-2">
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
							📊 Von BLS
						</button>
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
								class="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700">
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
							class="flex-1 rounded-xl bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700">
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

function _templateSection(labelMap, current = {}) {
	const all = {};
	for (const key of Object.keys(labelMap)) all[key] = null;
	for (const [k, v] of Object.entries(current || {})) {
		if (Object.prototype.hasOwnProperty.call(all, k)) all[k] = v;
	}
	return all;
}

function _buildFullTemplateFromCurrent(current, fallbackName) {
	const c = current || {};
	return {
		name: c.name || fallbackName || "",

		referenceAmount: c.referenceAmount ?? 100,
		unit: c.unit ?? "g",
		category: c.category ?? "",
		notes: c.notes ?? "",
		source: c.source ?? "",
		macros: _templateSection(MACRO_LABELS, c.macros),
		vitamins: _templateSection({ ...FAT_SOLUBLE_VITAMIN_LABELS, ...WATER_SOLUBLE_VITAMIN_LABELS }, c.vitamins),
		minerals: _templateSection(MINERAL_LABELS, c.minerals),
		carbohydrates: _templateSection(CARB_LABELS, c.carbohydrates),
		fibers: _templateSection(FIBER_LABELS, c.fibers),
		sugarAlcoholsDetail: _templateSection(SUGAR_ALCOHOL_LABELS, c.sugarAlcoholsDetail),
		fattyAcids: _templateSection(FATTY_ACID_LABELS, c.fattyAcids),
		aminoAcids: _templateSection(AMINO_LABELS, c.aminoAcids),
		otherNutrients: _templateSection(OTHER_NUTRIENT_LABELS, c.otherNutrients),
		extra: { ...(c.extra || {}) }
	};
}

function _normalizeImportedData(imported, fallbackName) {
	const base = createEmptyDetails(fallbackName || "");
	if (!imported || typeof imported !== "object") return base;

	const full = _buildFullTemplateFromCurrent(base, fallbackName || "");
	const merged = _buildFullTemplateFromCurrent(imported, fallbackName || "");

	return {
		...full,
		...merged,
		macros: { ...full.macros, ...merged.macros },
		vitamins: { ...full.vitamins, ...merged.vitamins },
		minerals: { ...full.minerals, ...merged.minerals },
		carbohydrates: { ...full.carbohydrates, ...merged.carbohydrates },
		fibers: { ...full.fibers, ...merged.fibers },
		sugarAlcoholsDetail: { ...full.sugarAlcoholsDetail, ...merged.sugarAlcoholsDetail },
		fattyAcids: { ...full.fattyAcids, ...merged.fattyAcids },
		aminoAcids: { ...full.aminoAcids, ...merged.aminoAcids },
		otherNutrients: { ...full.otherNutrients, ...merged.otherNutrients },
		extra: { ...(full.extra || {}), ...(imported.extra || {}) }
	};
}

function _bindPopupEvents(overlay, label, key, data, creds) {
	// ── Close ──
	overlay.querySelector("#det-close")?.addEventListener("click", closePopup);
	overlay.querySelector("#det-cancel")?.addEventListener("click", closePopup);
	overlay.querySelector("#det-backdrop")?.addEventListener("click", (e) => {
		if (e.target === overlay.querySelector("#det-backdrop")) closePopup();
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
		const fullTemplate = _buildFullTemplateFromCurrent(current, label);
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
			const normalized = _normalizeImportedData(parsed, label);
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
		const normalized = _normalizeImportedData(template, label);
		
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
