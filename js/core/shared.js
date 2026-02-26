/**
 * SHARED MODULE - Zentrale Logik für App und Recipe Details
 * Verhindert Code-Duplikate für:
 * - Cache-Zugriffe (Rezepte, Bilder)
 * - Auth
 * - UI-Utilities
 */

import { loadCreds } from "../dav/webdav.js";
import { getAllRecipesFromCache, getImageFromCache } from "../storage/db.js";
import { placeholderDataUri, normName, isIgnoredIngredient } from "../utils/helpers.js";
import { APP } from "./config.js";

/**
 * Lädt ein einzelnes Rezept aus Cache oder gibt null zurück
 */
export async function getRecipeFromCache(recipeId) {
  try {
    const recipes = await getAllRecipesFromCache();
    return recipes.find(r => r.id === recipeId) || null;
  } catch (err) {
    console.error("Fehler beim Laden aus Cache:", err);
    return null;
  }
}

/**
 * Lädt Rezept-Bild aus Cache, mit fallback zu Placeholder
 */
export async function getRecipeImageUrl(id) {
  try {
    const cached = await getImageFromCache(id);
    if (cached?.blob) {
      console.log(`🖼️ Bild ${id} aus Cache`);
      return URL.createObjectURL(cached.blob);
    } else {
      console.log(`📭 Bild ${id} nicht im Cache`);
    }
  } catch (err) {
    console.warn(`Fehler beim Laden von Bild ${id}:`, err);
  }
  return placeholderDataUri(id);
}

/**
 * Prüft ob User authenticated ist
 */
export function isAuthenticated() {
  const creds = loadCreds();
  return creds?.user && creds?.pass;
}

/**
 * Zeigt Fehler in einem Modal/Box an
 */
export function showError(msg, containerId = "errorBox") {
  const box = document.getElementById(containerId);
  if (box) {
    box.textContent = msg;
    box.classList?.remove("hidden");
  }
}

/**
 * Versteckt Error-Box
 */
export function hideError(containerId = "errorBox") {
  const box = document.getElementById(containerId);
  if (box) {
    box.classList?.add("hidden");
  }
}

/**
 * Loading-Spinner Show/Hide
 */
export function showLoading(message = "Laden...", containerId = "loadingOverlay") {
  const overlay = document.getElementById(containerId);
  const progress = document.getElementById("loadingProgress");
  if (overlay) overlay.classList.remove("hidden");
  if (progress) progress.textContent = message;
}

export function hideLoading(containerId = "loadingOverlay") {
  const overlay = document.getElementById(containerId);
  if (overlay) overlay.classList.add("hidden");
}

/**
 * Ingredient-Matching (global) - mit Normalisierung
 */
export function normalizeIngredient(name) {
  return normName(name);
}

export function shouldIgnoreIngredient(name) {
  return isIgnoredIngredient(name);
}

/**
 * Helper für HTML-Escape
 */
export function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/**
 * URL-Parameter auslesen
 */
export function getUrlParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}
