import { buildFullEmptyTemplate } from "./ingredient-schema.js";

export function buildIngredientGptPrompt(label) {
	const template = buildFullEmptyTemplate(label);
	return [
		`Parse nutrient data for "${label}" into this JSON schema.`,
		"Return ONLY valid JSON. Keep all keys. Unknown values=null. Numbers only, no strings. Values per referenceAmount/unit, usually 100 g. Put source/notes if known.",
		JSON.stringify(template)
	].join("\n");
}

export function buildIngredientGptPromptWithInput(label, current, userInput) {
	return [
		buildIngredientGptPrompt(label, current),
		"SOURCE",
		userInput || "(Der Nutzer liefert das Quellmaterial anschliessend, z.B. als Bild, URL oder Text.)",
		"If source is URL/text/image, extract/package nutrition into schema. If values are per serving, convert to referenceAmount if possible."
	].join("\n");
}
