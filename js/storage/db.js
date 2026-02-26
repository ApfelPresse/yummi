/**
 * db.js - IndexedDB Wrapper für Rezepte-Caching
 * 
 * Features:
 * - Speichert Rezepte lokal (Offline-fähig)
 * - ETag-basiertes Caching (nur Änderungen laden)
 * - Schneller Start (Cache-First)
 */

const DB_NAME = "YummiDB";
const DB_VERSION = 2; // Version erhöht für Images Store
const STORE_RECIPES = "recipes";
const STORE_METADATA = "metadata";
const STORE_IMAGES = "images";

let dbInstance = null;

/**
 * Öffnet/erstellt die IndexedDB
 */
export async function openDB() {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Recipes Store: id als Key
      if (!db.objectStoreNames.contains(STORE_RECIPES)) {
        const recipeStore = db.createObjectStore(STORE_RECIPES, { keyPath: "id" });
        recipeStore.createIndex("category", "category", { unique: false });
        recipeStore.createIndex("title", "title", { unique: false });
      }

      // Metadata Store: filename als Key, etag + lastModified speichern
      if (!db.objectStoreNames.contains(STORE_METADATA)) {
        db.createObjectStore(STORE_METADATA, { keyPath: "filename" });
      }

      // Images Store: imageId als Key (z.B. "pasta_birne_walnuss_bergkaese")
      if (!db.objectStoreNames.contains(STORE_IMAGES)) {
        db.createObjectStore(STORE_IMAGES, { keyPath: "imageId" });
      }
    };
  });
}

/**
 * Alle Rezepte aus Cache laden
 */
export async function getAllRecipesFromCache() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_RECIPES, "readonly");
    const store = tx.objectStore(STORE_RECIPES);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Ein Rezept in Cache speichern
 */
export async function saveRecipeToCache(recipe) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_RECIPES, "readwrite");
    const store = tx.objectStore(STORE_RECIPES);
    const request = store.put(recipe);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Mehrere Rezepte in Cache speichern (Batch)
 */
export async function saveRecipesToCache(recipes) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_RECIPES, "readwrite");
    const store = tx.objectStore(STORE_RECIPES);

    for (const recipe of recipes) {
      store.put(recipe);
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Metadata (ETag, Last-Modified) speichern
 */
export async function saveMetadata(filename, metadata) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_METADATA, "readwrite");
    const store = tx.objectStore(STORE_METADATA);
    const request = store.put({ filename, ...metadata });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Metadata für eine Datei laden
 */
export async function getMetadata(filename) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_METADATA, "readonly");
    const store = tx.objectStore(STORE_METADATA);
    const request = store.get(filename);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Alle Metadaten laden (für Sync-Check)
 */
export async function getAllMetadata() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_METADATA, "readonly");
    const store = tx.objectStore(STORE_METADATA);
    const request = store.getAll();

    request.onsuccess = () => {
      const items = request.result || [];
      // Als Map zurückgeben für einfachen Zugriff
      const map = new Map();
      for (const item of items) {
        map.set(item.filename, item);
      }
      resolve(map);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Rezept aus Cache löschen
 */
export async function deleteRecipeFromCache(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_RECIPES, "readwrite");
    const store = tx.objectStore(STORE_RECIPES);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Metadaten für Datei löschen
 */
export async function deleteMetadata(filename) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_METADATA, "readwrite");
    const store = tx.objectStore(STORE_METADATA);
    const request = store.delete(filename);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Bild aus Cache löschen
 */
export async function deleteImageFromCache(imageId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_IMAGES, "readwrite");
    const store = tx.objectStore(STORE_IMAGES);
    const request = store.delete(imageId);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Gesamten Cache leeren (für Debugging)
 */
export async function clearCache() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_RECIPES, STORE_METADATA, STORE_IMAGES], "readwrite");
    
    tx.objectStore(STORE_RECIPES).clear();
    tx.objectStore(STORE_METADATA).clear();
    tx.objectStore(STORE_IMAGES).clear();

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Prüft, ob Cache leer ist
 */
export async function isCacheEmpty() {
  const recipes = await getAllRecipesFromCache();
  return recipes.length === 0;
}

/**
 * Bild in Cache speichern (als Blob)
 */
export async function saveImageToCache(imageId, blob, etag = null) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_IMAGES, "readwrite");
    const store = tx.objectStore(STORE_IMAGES);
    const request = store.put({ 
      imageId, 
      blob, 
      etag,
      cachedAt: new Date().toISOString() 
    });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Bild aus Cache laden
 */
export async function getImageFromCache(imageId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_IMAGES, "readonly");
    const store = tx.objectStore(STORE_IMAGES);
    const request = store.get(imageId);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Alle gecachten Bilder auflisten (für Debugging)
 */
export async function getAllImagesFromCache() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_IMAGES, "readonly");
    const store = tx.objectStore(STORE_IMAGES);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}
