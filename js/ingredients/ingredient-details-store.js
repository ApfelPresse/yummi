import { APP } from "../core/config.js";
import { davBaseFolderUrl, get, put } from "../dav/webdav.js";
import {
	getIngredientDetailsFromCache,
	saveIngredientDetailsToCache,
	deleteIngredientDetailsFromCache
} from "../storage/db.js";

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
	
	// localStorage hint aktualisieren
	const cacheKey = `nutrient_has_data_${key}`;
	localStorage.setItem(cacheKey, JSON.stringify({
		value: ingredientDetailsHasData(data),
		timestamp: Date.now()
	}));
}

// ─── Nutrient data existence check (cached) ──────────────────────────────────

function sectionHasData(section) {
	return Object.values(section || {}).some(value => value !== null && value !== undefined && value !== "");
}

function ingredientDetailsHasData(data) {
	if (!data) return false;
	return [
		data.macros,
		data.vitamins,
		data.minerals,
		data.carbohydrates,
		data.fibers,
		data.sugarAlcoholsDetail,
		data.fattyAcids,
		data.aminoAcids,
		data.otherNutrients
	].some(sectionHasData);
}

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
		const hasData = ingredientDetailsHasData(data);
		
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
