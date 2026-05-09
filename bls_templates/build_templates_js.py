#!/usr/bin/env python3
"""
Build Templates JS

Liest alle bls_4_0_*.json und fooddata_*.json Dateien aus dem aktuellen Verzeichnis
und packt sie in eine einzelne templates.js Datei mit:
  - Alle Templates als Array
  - Index zum schnellen Nachschlagen
  - Suchfunktionen

Ausgabe: templates.js (mit allen 7140 Einträgen)

Verwendung:
    python build_templates_js.py
"""

import json
import sys
from pathlib import Path
from collections import defaultdict

def normalize_name(s: str) -> str:
    """Normalisiert Namen für Suche."""
    s = str(s or "").strip().lower()
    # Einfache Normalisierung: nur ASCII, keine Diakritika
    s = s.encode("ascii", "ignore").decode("ascii")
    s = "".join(c for c in s if c.isalnum() or c in "- ")
    return s


def main():
    script_dir = Path(__file__).parent
    
    # Alle JSON-Template-Dateien einlesen
    json_files = sorted(script_dir.glob("bls_4_0_*.json"))
    json_files += sorted(script_dir.glob("fooddata_*.json"))
    
    if not json_files:
        print("Fehler: Keine Template-JSON-Dateien gefunden!")
        sys.exit(1)
    
    print(f"Lese {len(json_files)} Template-Dateien…")
    
    templates = []
    index = defaultdict(list)
    
    for json_file in json_files:
        try:
            data = json.loads(json_file.read_text(encoding="utf-8"))
            templates.append(data)
            
            # Index erstellen: normalisierter Name → Array von Indizes
            name = data.get("name", "")
            norm = normalize_name(name)
            if norm:
                current_index = len(templates) - 1
                # Vollständigen normalisierten Namen und erstes Wort indexieren.
                index[norm].append(current_index)
                first_word = norm.split()[0] if norm.split() else norm
                if first_word != norm:
                    index[first_word].append(current_index)
        except Exception as e:
            print(f"  ✗ Fehler bei {json_file.name}: {e}", file=sys.stderr)
    
    # Konvertiere defaultdict zu regulärem dict
    index = dict(index)
    
    # JavaScript-Code generieren
    js_code = f"""// BLS 4.0 + FoodData Central Templates
// Auto-generated {len(templates)} entries
// Last updated: {Path(__file__).stat().st_mtime}

/**
 * All BLS 4.0 and FoodData Central nutrition templates
 * Each template contains complete nutrition data (macros, vitamins, minerals, etc.)
 */
const BLS_TEMPLATES = {json.dumps(templates, ensure_ascii=False, separators=(',', ':'))};

/**
 * Index for quick lookups
 * Maps normalized ingredient names to template indices
 */
const BLS_TEMPLATES_INDEX = {json.dumps(index, ensure_ascii=False)};

/**
 * Search templates by ingredient name
 * @param {{string}} ingredientName - The ingredient name to search
 * @returns {{Array}} Array of matching templates
 */
function searchBLSTemplates(ingredientName) {{
  const needle = ingredientName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9 -]/g, "");
  
  const indices = BLS_TEMPLATES_INDEX[needle] || [];
  return indices
    .map(i => BLS_TEMPLATES[i])
    .sort((a, b) => {{
      const aName = a.name.toLowerCase().replace(/[^a-z0-9 -]/g, "");
      const bName = b.name.toLowerCase().replace(/[^a-z0-9 -]/g, "");
      const aExact = aName === needle ? 0 : 1;
      const bExact = bName === needle ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;
      return aName.length - bName.length;
    }});
}}

/**
 * Get single template by name
 * @param {{string}} name - The exact template name
 * @returns {{Object|null}} Template data or null
 */
function getBLSTemplate(name) {{
  const results = BLS_TEMPLATES.filter(t => t.name === name);
  return results.length > 0 ? results[0] : null;
}}

/**
 * Get template by index
 * @param {{number}} index - The template index
 * @returns {{Object|null}} Template data or null
 */
function getBLSTemplateByIndex(index) {{
  return BLS_TEMPLATES[index] || null;
}}

/**
 * Get all unique first words (for autocomplete, etc.)
 * @returns {{Array}} Sorted array of first words
 */
function getBLSTemplateCategories() {{
  return Object.keys(BLS_TEMPLATES_INDEX).sort();
}}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {{
  module.exports = {{
    BLS_TEMPLATES,
    BLS_TEMPLATES_INDEX,
    searchBLSTemplates,
    getBLSTemplate,
    getBLSTemplateByIndex,
    getBLSTemplateCategories,
  }};
}}
"""
    
    # Schreibe templates.js im Datenordner und in den vom Frontend geladenen Pfad.
    output_file = script_dir / "templates.js"
    app_output_file = script_dir.parent / "js" / "ingredients" / "template" / "bls_4_0" / "templates.js"
    output_file.write_text(js_code, encoding="utf-8")
    app_output_file.write_text(js_code, encoding="utf-8")
    
    # Statistiken
    file_size_mb = output_file.stat().st_size / (1024 * 1024)
    print(f"\nFertig!")
    print(f"  Templates: {len(templates)}")
    print(f"  Index-Einträge: {len(index)}")
    print(f"  templates.js: {file_size_mb:.2f} MB")
    print(f"  Gespeichert: {output_file}")
    print(f"  Frontend: {app_output_file}")
    print(f"\nHinweis: Die Datei wird von der Seite gecacht.")
    print(f"Cache-Header setzen für lange TTL!")


if __name__ == "__main__":
    main()
