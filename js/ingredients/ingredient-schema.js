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

export function templateSection(labelMap, current = {}) {
	const all = {};
	for (const key of Object.keys(labelMap)) all[key] = null;
	for (const [k, v] of Object.entries(current || {})) {
		if (Object.prototype.hasOwnProperty.call(all, k)) all[k] = v;
	}
	return all;
}

export function buildFullTemplateFromCurrent(current, fallbackName) {
	const c = current || {};
	return {
		name: c.name || fallbackName || "",

		referenceAmount: c.referenceAmount ?? 100,
		unit: c.unit ?? "g",
		category: c.category ?? "",
		notes: c.notes ?? "",
		source: c.source ?? "",
		macros: templateSection(MACRO_LABELS, c.macros),
		vitamins: templateSection({ ...FAT_SOLUBLE_VITAMIN_LABELS, ...WATER_SOLUBLE_VITAMIN_LABELS }, c.vitamins),
		minerals: templateSection(MINERAL_LABELS, c.minerals),
		carbohydrates: templateSection(CARB_LABELS, c.carbohydrates),
		fibers: templateSection(FIBER_LABELS, c.fibers),
		sugarAlcoholsDetail: templateSection(SUGAR_ALCOHOL_LABELS, c.sugarAlcoholsDetail),
		fattyAcids: templateSection(FATTY_ACID_LABELS, c.fattyAcids),
		aminoAcids: templateSection(AMINO_LABELS, c.aminoAcids),
		otherNutrients: templateSection(OTHER_NUTRIENT_LABELS, c.otherNutrients),
		extra: { ...(c.extra || {}) }
	};
}

export function buildFullEmptyTemplate(fallbackName) {
	return buildFullTemplateFromCurrent(createEmptyDetails(fallbackName || ""), fallbackName || "");
}

export function normalizeImportedData(imported, fallbackName) {
	const base = createEmptyDetails(fallbackName || "");
	if (!imported || typeof imported !== "object") return base;

	const full = buildFullTemplateFromCurrent(base, fallbackName || "");
	const merged = buildFullTemplateFromCurrent(imported, fallbackName || "");

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
