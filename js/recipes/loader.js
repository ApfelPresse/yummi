import { APP } from "../core/config.js";
import { loadCreds, davBaseFolderUrl, propfind, parseMultiStatus, get } from "../dav/webdav.js";
import { 
  getAllRecipesFromCache, 
  saveRecipeToCache, 
  saveMetadata, 
  getAllMetadata,
  isCacheEmpty,
  saveImageToCache,
  deleteRecipeFromCache,
  deleteMetadata,
  deleteImageFromCache
} from "../storage/db.js";

function joinUrl(base, rel) {
  const b = base.replace(/\/+$/, "");
  const r = rel.replace(/^\/+/, "");
  return `${b}/${r}`;
}

function isJsonFile(item) {
  if (item.isCollection) return false;
  const name = (item.displayName || item.href || "").toLowerCase();
  return name.endsWith(".json");
}

/**
 * Lädt ein Bild von Nextcloud und speichert es im Cache
 */
export async function loadAndCacheImage(recipeId, creds) {
  try {
    const baseFolder = davBaseFolderUrl(creds);
    const imagesFolder = joinUrl(baseFolder, APP.IMAGES_SUBFOLDER);
    const imageFilename = `${recipeId}.${APP.IMG_EXT}`;
    const imageUrl = joinUrl(imagesFolder, imageFilename);
    
    console.log(`📷 Lade Bild: ${recipeId}.${APP.IMG_EXT}`);
    
    // Direkter fetch mit Basic Auth für Bild-Blob
    const response = await fetch(imageUrl, {
      method: "GET",
      headers: {
        "Authorization": `Basic ${btoa(`${creds.user}:${creds.pass}`)}`
      }
    });
    
    if (response.ok) {
      const blob = await response.blob();
      console.log(`✅ Bild ${recipeId} geladen (${blob.size} bytes)`);
      await saveImageToCache(recipeId, blob);
      console.log(`✅ Bild ${recipeId} gecacht`);
      return true;
    } else if (response.status === 404) {
      console.log(`⚠️ Bild ${recipeId} nicht gefunden (404)`);
      return false;
    } else {
      console.warn(`⚠️ Bild ${recipeId}: HTTP ${response.status}`);
      return false;
    }
  } catch (err) {
    console.error(`❌ Bild ${recipeId} Fehler:`, err);
    return false;
  }
}

function getFilenameFromHref(href) {
  return decodeURIComponent(href.split("/").pop() || "");
}

/**
 * Lädt Rezepte mit Offline-First + ETag-Sync
 * 
 * 1. Cache vorhanden? → Sofort zurückgeben
 * 2. Im Hintergrund: Sync mit Nextcloud (nur Änderungen)
 * 3. Cache leer? → Alle laden
 */
export async function loadAllRecipesFromDav() {
  const creds = loadCreds();
  if (!creds) {
    throw new Error("Keine Nextcloud-Credentials gefunden (localStorage). Bitte zuerst einloggen.");
  }

  // 1. Versuche aus Cache zu laden
  const cacheEmpty = await isCacheEmpty();
  
  if (!cacheEmpty) {
    // Cache vorhanden → sofort zurückgeben
    const cachedRecipes = await getAllRecipesFromCache();
    console.log(`📦 ${cachedRecipes.length} Rezepte aus Cache geladen`);
    
    // Im Hintergrund: Sync starten (nicht blockieren)
    syncWithNextcloud(creds).catch(err => {
      console.warn("Background-Sync fehlgeschlagen:", err);
    });
    
    return cachedRecipes;
  }

  // 2. Cache leer → Initial Load (alle Rezepte)
  console.log("📥 Cache leer, lade alle Rezepte von Nextcloud...");
  return await loadAllRecipesInitial(creds);
}

/**
 * Initial Load: Alle Rezepte von Nextcloud laden + cachen
 */
async function loadAllRecipesInitial(creds) {
  const baseFolder = davBaseFolderUrl(creds);
  const recipesFolderUrl = joinUrl(baseFolder, APP.RECIPES_SUBFOLDER);

  const pf = await propfind(recipesFolderUrl, creds, "1");
  if (pf.status !== 207) {
    throw new Error(`PROPFIND fehlgeschlagen (${pf.status} ${pf.statusText})`);
  }

  const parsed = parseMultiStatus(pf.text);
  if (parsed.error) throw new Error(parsed.error);

  const jsonItems = parsed.items.filter(isJsonFile);
  
  if (jsonItems.length === 0) {
    console.warn("Keine Rezept-Dateien gefunden im Ordner:", recipesFolderUrl);
    return [];
  }

  const recipes = [];
  const total = jsonItems.length;
  
  for (let i = 0; i < jsonItems.length; i++) {
    const it = jsonItems[i];
    const filename = getFilenameFromHref(it.href);
    
    // Progress-Update
    if (typeof window !== "undefined" && window.dispatchEvent) {
      window.dispatchEvent(new CustomEvent("recipeLoadProgress", { 
        detail: { loaded: i + 1, total, mode: "initial" } 
      }));
    }
    
    const fileUrl = it.href.startsWith("http")
      ? it.href
      : `${creds.baseUrl}${it.href.startsWith("/") ? "" : "/"}${it.href}`;

    const res = await get(fileUrl, creds);
    if (res.status !== 200) {
      // Wenn 404, auch aus Cache entfernen (Rezept wurde gelöscht)
      if (res.status === 404) {
        const recipeIdFromFilename = filename.replace(/\.json$/, "");
        console.log(`🗑️ Rezept ${recipeIdFromFilename} nicht mehr auf Nextcloud, entferne aus Cache...`);
        await deleteRecipeFromCache(recipeIdFromFilename);
        await deleteMetadata(filename);
        await deleteImageFromCache(recipeIdFromFilename);
      } else {
        console.warn("GET failed", fileUrl, res.status);
      }
      continue;
    }

    try {
      const recipe = JSON.parse(res.text);
      if (recipe && typeof recipe === "object") {
        recipes.push(recipe);
        
        // In Cache speichern
        await saveRecipeToCache(recipe);
        
        // Metadata speichern (ETag für zukünftige Syncs)
        await saveMetadata(filename, {
          etag: it.etag || null,
          lastModified: new Date().toISOString()
        });
        
        // Bild laden (asynchron, nicht blockieren)
        loadAndCacheImage(recipe.id, creds).then(success => {
          if (success) {
            console.log(`✅ Bild ${recipe.id} erfolgreich gecacht`);
          } else {
            console.log(`⚠️ Bild ${recipe.id} konnte nicht geladen werden`);
          }
        }).catch((err) => {
          console.error(`❌ Bild ${recipe.id} Fehler:`, err);
        });
      }
    } catch (err) {
      console.warn("Invalid JSON", fileUrl, err);
    }
  }

  console.log(`✅ ${recipes.length} Rezepte geladen & gecacht. Bilder werden im Hintergrund geladen...`);
  return recipes;
}

/**
 * Background-Sync: Prüft ETags, lädt nur Änderungen
 */
async function syncWithNextcloud(creds) {
  const baseFolder = davBaseFolderUrl(creds);
  const recipesFolderUrl = joinUrl(baseFolder, APP.RECIPES_SUBFOLDER);

  const pf = await propfind(recipesFolderUrl, creds, "1");
  if (pf.status !== 207) {
    console.warn("Sync PROPFIND fehlgeschlagen:", pf.status);
    return;
  }

  const parsed = parseMultiStatus(pf.text);
  if (parsed.error) {
    console.warn("Sync XML parse error:", parsed.error);
    return;
  }

  const jsonItems = parsed.items.filter(isJsonFile);
  const cachedMetadata = await getAllMetadata();
  
  let updatedCount = 0;
  
  for (const it of jsonItems) {
    const filename = getFilenameFromHref(it.href);
    const cached = cachedMetadata.get(filename);
    
    // Prüfe ob ETag sich geändert hat
    const needsUpdate = !cached || cached.etag !== it.etag;
    
    if (needsUpdate) {
      // Datei hat sich geändert → neu laden
      const fileUrl = it.href.startsWith("http")
        ? it.href
        : `${creds.baseUrl}${it.href.startsWith("/") ? "" : "/"}${it.href}`;

      try {
        const res = await get(fileUrl, creds);
        if (res.status === 200) {
          const recipe = JSON.parse(res.text);
          await saveRecipeToCache(recipe);
          await saveMetadata(filename, {
            etag: it.etag || null,
            lastModified: new Date().toISOString()
          });
          updatedCount++;
        }
      } catch (err) {
        console.warn(`Sync failed for ${filename}:`, err);
      }
    }
  }

  // Prüfe auf gelöschte Rezepte: Wenn im Cache aber nicht mehr auf Nextcloud
  const cachedRecipes = await getAllRecipesFromCache();
  const nextcloudFilenames = jsonItems.map(it => getFilenameFromHref(it.href));
  
  for (const recipe of cachedRecipes) {
    const expectedFilename = recipe.id + ".json";
    if (!nextcloudFilenames.includes(expectedFilename)) {
      console.log(`🗑️ Rezept "${recipe.title}" wurde auf Nextcloud gelöscht, entferne aus Cache...`);
      await deleteRecipeFromCache(recipe.id);
      await deleteMetadata(expectedFilename);
      await deleteImageFromCache(recipe.id);
      updatedCount++;
    }
  }
  
  if (updatedCount > 0) {
    console.log(`🔄 ${updatedCount} Änderungen erkannt`);
    
    // Event dispatchen für UI-Update
    if (typeof window !== "undefined" && window.dispatchEvent) {
      window.dispatchEvent(new CustomEvent("recipesUpdated", { 
        detail: { count: updatedCount } 
      }));
    }
  } else {
    console.log("✓ Alle Rezepte sind aktuell");
  }
}
