# Yummi 🍽️

![Yummi Logo](logo.png)

Eine moderne **Rezept-App**, die dir hilft, passende Rezepte basierend auf deinen verfügbaren Zutaten zu finden.

## Features

- 🔍 **Intelligente Rezeptsuche** – Wähle deine Zutaten aus und finde sofort passende Rezepte
- ☁️ **Nextcloud-Synchronisation** – Deine Rezepte und Vorlieben sind überall verfügbar
- 🖼️ **Rezeptbilder** – Schöne Bilder für jedes Rezept
- 📝 **Rezepte erstellen & bearbeiten** – Neue Rezepte hinzufügen uber die Web-App
- 🔒 **Datenschutz** – Alle Daten bleiben auf deinem Nextcloud-Server
- 📱 **Progressive Web App** – Funktioniert offline und als installierte App
- ⚡ **Schnell & responsiv** – Optimiert für Mobile und Desktop

## Schnellstart

## Rezepte strukturieren

Rezepte werden als JSON-Dateien in deinem Nextcloud-Server unter `App-Ordner/recipes/` gespeichert:

```json
{
  "id": "pizza-margherita",
  "title": "Pizza Margherita",
  "description": "Klassische italienische Pizza",
  "category": "Hauptgerichte",
  "ingredients": [
    { "name": "Mehl", "amount": 500, "unit": "g" },
    { "name": "Tomaten", "amount": 400, "unit": "g" },
    { "name": "Mozzarella", "amount": 250, "unit": "g" }
  ],
  "steps": [
    { "title": "Teig zubereiten", "text": "Mehl mit Wasser mischen..." }
  ],
  "meta": {
    "prepMin": 30,
    "cookMin": 15,
    "servings": 4
  }
}
```

---

## Nährstoffdetails für Zutaten

### Überblick

Die App unterstützt detaillierte Nährstoffinformationen für einzelne Zutaten. Diese können direkt in der Pantry-Ansicht (Zutaten-Chips) aufgerufen und bearbeitet werden.

### Aktivierung

Im Zutaten-Panel gibt es neben **„Nur ausgewählte anzeigen"** eine neue Checkbox: **„Nährstoffdetails anzeigen"**.

- **Deaktiviert** (Standard): Klick auf einen Chip wählt die Zutat aus/ab – wie bisher.
- **Aktiviert**: Klick auf einen Chip öffnet ein Popup mit den vollständigen Nährstoffdaten der Zutat. Die Zutat wird dabei automatisch ausgewählt.

### Datenspeicherung

Nährstoffdetails liegen als JSON-Dateien im Nextcloud-App-Ordner unter:

```
App-Ordner/ingredients_details/<normalisierter-name>.json
```

Beispiel für Karotten: `ingredients_details/karotten.json`

Der Name wird dabei normalisiert (Kleinbuchstaben, ohne Akzente, Leerzeichen bleiben erhalten). Ist noch keine Datei vorhanden, öffnet sich das Popup leer zum Ausfüllen. Nach dem Speichern wird die Datei automatisch angelegt.

### JSON-Schema (BLS-basiert)

Die auswählbaren Felder basieren auf `BLS_4_0_2025_DE/BLS_4_0_Components_DE_EN.xlsx`.

Das JSON enthält feste Blöcke:

- `macros`
- `vitamins`
- `minerals`
- `carbohydrates`
- `fibers`
- `sugarAlcoholsDetail`
- `fattyAcids`
- `aminoAcids`
- `otherNutrients`
- `extra`

Alle Nährstofffelder sind optional (`null` = kein Wert bekannt).

### Vorlage & Import

Im Popup gibt es zwei zusätzliche Aktionen:

- `JSON Vorlage kopieren`:
  Kopiert ein vollständiges JSON in die Zwischenablage, mit **allen** aktuell unterstützten Feldern (nicht nur den eingeblendeten), wobei unbekannte Werte als `null` gesetzt sind.
- `JSON importieren`:
  Importiert eine `.json`-Datei und übernimmt die Daten ins Formular. Danach kann normal gespeichert werden.

Hinweis: JSON unterstützt keine Kommentare. Daher wird die Vorlage mit `null`-Werten als ausfüllbare Struktur erzeugt.

### Code-Struktur

| Datei | Beschreibung |
|---|---|
| `js/ingredients/ingredient-details.js` | Popup-UI und kompatible Re-Exports |
| `js/ingredients/ingredient-details-store.js` | DAV-Lade/Speicher-Logik und Cache-Helfer |
| `js/ingredients/ingredient-schema.js` | JSON-Schema, Vorlagen und Import-Normalisierung |
| `js/ingredients/nutrient-labels.js` | Nährstoff-Keys, Labels und Einheiten |
| `js/ingredients/ingredient-gpt.js` | GPT-Prompt für Ingredient-JSON |
| `js/core/config.js` | Neu: `INGREDIENT_DETAILS_SUBFOLDER` |
| `js/recipes/app.js` | Rezeptliste, Filter, Chips und Boot-Logik |
| `js/recipes/cache-maintenance.js` | App-Version und manueller Daten-Cache-Reset |
| `js/recipes/cleanup-tools.js` | Wartungs-Popup zum Umbenennen von Zutaten und Einheiten |
| `index.html` | Neue Checkbox „Nährstoffdetails anzeigen" |
