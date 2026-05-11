import { APP_VERSION } from "../core/version.js";
import { hideLoading, showError, showLoading } from "../core/shared.js";
import { loadAllRecipesFromDav } from "./loader.js";

const APP_DATA_VERSION_KEY = "yummi_app_data_version";

export async function loadRecipesForCurrentAppVersion() {
	const storedVersion = localStorage.getItem(APP_DATA_VERSION_KEY);

	if (storedVersion !== APP_VERSION) {
		console.log(`[VERSION] App-Version geändert: ${storedVersion || "keine"} -> ${APP_VERSION}`);
		localStorage.setItem(APP_DATA_VERSION_KEY, APP_VERSION);
	}

	return await loadAllRecipesFromDav();
}

function clearIngredientExistenceCache() {
	for (let i = localStorage.length - 1; i >= 0; i--) {
		const key = localStorage.key(i);
		if (key?.startsWith("nutrient_has_data_")) {
			localStorage.removeItem(key);
		}
	}
}

export function createDataCacheTools({ setRecipes, refreshAfterReload }) {
	async function clearDataCacheFromUi() {
		const ok = window.confirm("Rezept- und Zutaten-Cache wirklich leeren? Danach werden die Daten frisch geladen.");
		if (!ok) return;

		try {
			showLoading("Daten-Cache wird geleert...");
			const { clearRecipeAndIngredientDataCache } = await import("../storage/db.js");
			await clearRecipeAndIngredientDataCache();
			clearIngredientExistenceCache();
			localStorage.removeItem(APP_DATA_VERSION_KEY);

			showLoading("Daten werden frisch geladen...");
			const { forceReloadAllRecipesFromDav } = await import("./loader.js");
			const recipes = await forceReloadAllRecipesFromDav();
			setRecipes(recipes);
			await refreshAfterReload();
		} catch (err) {
			console.error("Daten-Cache konnte nicht geleert werden:", err);
			showError(`Daten-Cache konnte nicht geleert werden: ${err.message}`);
		} finally {
			hideLoading();
		}
	}

	return { clearDataCacheFromUi };
}
