export const APP = {
  STORAGE_KEY_SELECTED: "pantry_selected_v1",
  STORAGE_KEY_IGNORED: "pantry_ignored_v1",
  STORAGE_KEY_IGNORED_ETAG: "pantry_ignored_etag_v1",
  IMG_EXT: "jpg",

  // Zutaten, die NIE in der Pantry-Liste auftauchen sollen
  IGNORE_INGREDIENTS: ["salz", "pfeffer", "wasser"],

  // Wo liegen die Rezepte relativ zum "App-Ordner"?
  // Beispiel: Wenn dein App-Ordner "RezeptApp/" ist, dann ist das:
  // RezeptApp/recipes/*.json
  RECIPES_SUBFOLDER: "recipes/",
  
  // Wo liegen die Bilder?
  // RezeptApp/images/*.jpg
  IMAGES_SUBFOLDER: "images/",

  // Credentials-Storage (falls du schon Login gebaut hast)
  CREDS_KEY: "yummi_creds",

  // Wenn du einen Proxy nutzt, der Nextcloud unter /dav/... weiterleitet:
  // "" (normal für direkte Nextcloud) oder "/dav" (für Proxy)
  DAV_PREFIX: ""
};
