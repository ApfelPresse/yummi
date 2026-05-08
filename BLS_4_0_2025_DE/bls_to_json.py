#!/usr/bin/env python3
"""
BLS 4.0 → ingredient-details JSON generator

Liest die BLS 4.0 Nährstoffdatenbank und erzeugt für eine Liste von Zutaten
die passenden JSON-Dateien im Format des ingredient-details.js Schemas.

Logik:
  - Exakter Treffer (1 Eintrag, Name stimmt genau überein, case-insensitiv)
    → JSON wird erzeugt und gespeichert
  - Mehrdeutig (mehrere Treffer) oder nur Teilstring-Treffer
    → Ergebnisse werden ausgegeben, aber nichts gespeichert
  - Kein Treffer → Meldung

Verwendung:
    python bls_to_json.py [Zutat1] [Zutat2] ...

    Ohne Argumente wird die INGREDIENTS-Liste im Script verwendet.

Ausgabe-Ordner (relativ zum Script):
    ../ingredients_details_out/   (überschreibbar mit --out <pfad>)

Optionen:
    --out <pfad>    Ausgabe-Ordner
    --dry           Nur anzeigen, nichts speichern
    --bls <pfad>    Pfad zur BLS XLSX Datei (default: BLS_4_0_Daten_2025_DE.xlsx)
"""

import sys
import json
import unicodedata
import re
import argparse
from pathlib import Path

try:
    import openpyxl
except ImportError:
    print("Fehler: openpyxl nicht installiert. Bitte: pip install openpyxl")
    sys.exit(1)

# ─── Zutaten-Liste ────────────────────────────────────────────────────────────
# Hier eintragen oder als Kommandozeilenargumente übergeben
INGREDIENTS = [
    "Ahornsirup",
    "Olivenöl",
    "Haferflocken",
    "Vollmilch",
    "Butter",
]

# ─── BLS-Schlüssel → JSON-Feldname Mapping ───────────────────────────────────

# Jede Zeile: (BLS_SPALTEN_KEY, json_key, kategorie)
# Kategorien: macro, vitamin, mineral, carbohydrate, fiber,
#             sugarAlcohol, fattyAcid, aminoAcid, other

FIELD_MAP = [
    # Makros
    ("ENERCC",    "kcal",         "macro"),
    ("WATER",     "water",        "macro"),
    ("PROT625",   "protein",      "macro"),
    ("FAT",       "fat",          "macro"),
    ("CHO",       "carbs",        "macro"),
    ("FIBT",      "fiber",        "macro"),
    ("ALC",       "alcohol",      "macro"),
    ("POLYL",     "sugarAlcohols","macro"),

    # Vitamine (fettlöslich)
    ("VITA",      "vita",         "vitamin"),
    ("VITAA",     "vitaa",        "vitamin"),
    ("RETOL",     "retol",        "vitamin"),
    ("CARTB",     "cartb",        "vitamin"),
    ("CAROTPAXB", "carotpaxb",    "vitamin"),
    ("VITD",      "vitd",         "vitamin"),
    ("CHOCAL",    "chocal",       "vitamin"),
    ("ERGCAL",    "ergcal",       "vitamin"),
    ("VITE",      "vite",         "vitamin"),
    ("TOCPHA",    "tocpha",       "vitamin"),
    ("TOCPHB",    "tocphb",       "vitamin"),
    ("TOCPHG",    "tocphg",       "vitamin"),
    ("TOCPHD",    "tocphd",       "vitamin"),
    ("TOCTRA",    "toctra",       "vitamin"),
    ("VITK",      "vitk",         "vitamin"),
    ("VITK1",     "vitk1",        "vitamin"),
    ("VITK2",     "vitk2",        "vitamin"),

    # Vitamine (wasserlöslich)
    ("THIA",      "thia",         "vitamin"),
    ("RIBF",      "ribf",         "vitamin"),
    ("NIAEQ",     "niaeq",        "vitamin"),
    ("NIA",       "nia",          "vitamin"),
    ("PANTAC",    "pantac",       "vitamin"),
    ("VITB6",     "vitb6",        "vitamin"),
    ("BIOT",      "biot",         "vitamin"),
    ("FOL",       "fol",          "vitamin"),
    ("FOLFD",     "folfd",        "vitamin"),
    ("FOLAC",     "folac",        "vitamin"),
    ("VITB12",    "vitb12",       "vitamin"),
    ("VITC",      "vitc",         "vitamin"),

    # Mineralien
    ("NACL",      "nacl",         "mineral"),
    ("NA",        "na",           "mineral"),
    ("CLD",       "cld",          "mineral"),
    ("K",         "k",            "mineral"),
    ("CA",        "ca",           "mineral"),
    ("MG",        "mg",           "mineral"),
    ("P",         "p",            "mineral"),
    ("S",         "s",            "mineral"),
    ("FE",        "fe",           "mineral"),
    ("ZN",        "zn",           "mineral"),
    ("ID",        "id",           "mineral"),
    ("CU",        "cu",           "mineral"),
    ("MN",        "mn",           "mineral"),
    ("FD",        "fd",           "mineral"),
    ("CR",        "cr",           "mineral"),
    ("MO",        "mo",           "mineral"),

    # Kohlenhydrate (Detaildaten)
    ("CHO",       "cho",          "carbohydrate"),
    ("MNSAC",     "mnsac",        "carbohydrate"),
    ("GLUS",      "glus",         "carbohydrate"),
    ("FRUS",      "frus",         "carbohydrate"),
    ("GALS",      "gals",         "carbohydrate"),
    ("DISAC",     "disac",        "carbohydrate"),
    ("SUCS",      "sucs",         "carbohydrate"),
    ("MALS",      "mals",         "carbohydrate"),
    ("LACS",      "lacs",         "carbohydrate"),
    ("SUGAR",     "sugar",        "carbohydrate"),
    ("OLSAC",     "olsac",        "carbohydrate"),
    ("STARCH",    "starch",       "carbohydrate"),

    # Ballaststoffe (Detaildaten)
    ("FIBT",      "fibt",         "fiber"),
    ("FIBLMW",    "fiblmw",       "fiber"),
    ("FIBHMW",    "fibhmw",       "fiber"),
    ("FIBINS",    "fibins",       "fiber"),
    ("FIBSOL",    "fibsol",       "fiber"),
    ("FIBHMWS",   "fibhmws",      "fiber"),
    ("FIBHMWI",   "fibhmwi",      "fiber"),

    # Zuckeralkohole (Detaildaten)
    ("POLYL",     "polyl",        "sugarAlcohol"),
    ("MANTL",     "mantl",        "sugarAlcohol"),
    ("SORTL",     "sortl",        "sugarAlcohol"),
    ("XYLTL",     "xyltl",        "sugarAlcohol"),

    # Fettsäuren
    ("FASAT",     "fasat",        "fattyAcid"),
    ("F4:0",      "f4_0",         "fattyAcid"),
    ("F6:0",      "f6_0",         "fattyAcid"),
    ("F8:0",      "f8_0",         "fattyAcid"),
    ("F10:0",     "f10_0",        "fattyAcid"),
    ("F12:0",     "f12_0",        "fattyAcid"),
    ("F14:0",     "f14_0",        "fattyAcid"),
    ("F15:0",     "f15_0",        "fattyAcid"),
    ("F16:0",     "f16_0",        "fattyAcid"),
    ("F17:0",     "f17_0",        "fattyAcid"),
    ("F18:0",     "f18_0",        "fattyAcid"),
    ("F20:0",     "f20_0",        "fattyAcid"),
    ("F22:0",     "f22_0",        "fattyAcid"),
    ("F24:0",     "f24_0",        "fattyAcid"),
    ("FAMS",      "fams",         "fattyAcid"),
    ("F14:1CN5",  "f14_1cn5",     "fattyAcid"),
    ("F16:1CN7",  "f16_1cn7",     "fattyAcid"),
    ("F18:1CN7",  "f18_1cn7",     "fattyAcid"),
    ("F18:1CN9",  "f18_1cn9",     "fattyAcid"),
    ("F20:1CN9",  "f20_1cn9",     "fattyAcid"),
    ("F22:1CN9",  "f22_1cn9",     "fattyAcid"),
    ("FAPU",      "fapu",         "fattyAcid"),
    ("FAPUN3",    "fapun3",       "fattyAcid"),
    ("F18:3CN3",  "f18_3cn3",     "fattyAcid"),
    ("F18:4CN3",  "f18_4cn3",     "fattyAcid"),
    ("F20:5CN3",  "f20_5cn3",     "fattyAcid"),
    ("F22:5CN3",  "f22_5cn3",     "fattyAcid"),
    ("F22:6CN3",  "f22_6cn3",     "fattyAcid"),
    ("FAPUN6",    "fapun6",       "fattyAcid"),
    ("F18:2CN6",  "f18_2cn6",     "fattyAcid"),
    ("F18:2C9T11","f18_2c9t11",   "fattyAcid"),
    ("F18:3CN6",  "f18_3cn6",     "fattyAcid"),
    ("F20:2CN6",  "f20_2cn6",     "fattyAcid"),
    ("F20:3CN6",  "f20_3cn6",     "fattyAcid"),
    ("F20:4CN6",  "f20_4cn6",     "fattyAcid"),
    ("FAX",       "fax",          "fattyAcid"),

    # Aminosäuren
    ("AAE9",      "aae9",         "aminoAcid"),
    ("ALA",       "ala",          "aminoAcid"),
    ("ARG",       "arg",          "aminoAcid"),
    ("ASP",       "asp",          "aminoAcid"),
    ("CYSTE",     "cyste",        "aminoAcid"),
    ("GLU",       "glu",          "aminoAcid"),
    ("GLY",       "gly",          "aminoAcid"),
    ("HIS",       "his",          "aminoAcid"),
    ("ILE",       "ile",          "aminoAcid"),
    ("LEU",       "leu",          "aminoAcid"),
    ("LYS",       "lys",          "aminoAcid"),
    ("MET",       "met",          "aminoAcid"),
    ("PHE",       "phe",          "aminoAcid"),
    ("PRO",       "pro",          "aminoAcid"),
    ("SER",       "ser",          "aminoAcid"),
    ("THR",       "thr",          "aminoAcid"),
    ("TRP",       "trp",          "aminoAcid"),
    ("TYR",       "tyr",          "aminoAcid"),
    ("VAL",       "val",          "aminoAcid"),

    # Sonstige
    ("CHORL",     "chorl",        "other"),
    ("NT",        "nt",           "other"),
]

# ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

def norm_name(s: str) -> str:
    """Entspricht normalizeIngredient() / normName() aus dem JS-Code."""
    s = str(s or "").strip().lower()
    s = unicodedata.normalize("NFD", s)
    s = re.sub(r"[\u0300-\u036f]", "", s)
    s = re.sub(r"\s+", " ", s)
    return s


def build_col_index(headers: tuple) -> dict:
    """Baut ein Dict BLS_KEY_UPPERCASE → Spaltenindex aus den Header-Namen."""
    idx = {}
    for i, h in enumerate(headers):
        if h:
            key = str(h).split()[0].upper()
            # Ersten Treffer behalten (Datenspalte vor Datenherkunft/Referenz)
            if key not in idx:
                idx[key] = i
    return idx


def row_to_json(row: tuple, col_idx: dict, ingredient_name: str) -> dict:
    """Wandelt eine BLS-Zeile in das ingredient-details JSON-Format um."""
    def v(bls_key):
        i = col_idx.get(bls_key)
        if i is None:
            return None
        val = row[i]
        if val is None:
            return None
        try:
            f = float(val)
            # Runden auf sinnvolle Nachkommastellen
            return round(f, 4) if f != int(f) else int(f)
        except (TypeError, ValueError):
            return None

    def mv(bls_key):
        """Wie v(), aber gibt None zurück wenn Wert 0 ist."""
        val = v(bls_key)
        return None if val == 0 else val

    macros = {
        "kcal":          mv("ENERCC"),
        "water":         mv("WATER"),
        "protein":       mv("PROT625"),
        "fat":           mv("FAT"),
        "carbs":         mv("CHO"),
        "fiber":         mv("FIBT"),
        "alcohol":       mv("ALC"),
        "sugarAlcohols": mv("POLYL"),
    }

    def section(keys):
        """Gibt Dict nur mit nicht-None Werten zurück."""
        result = {}
        for bls_key, js_key, _ in FIELD_MAP:
            if _ == keys:
                val = v(bls_key)
                if val is not None and val != 0:
                    result[js_key] = val
        return result

    # Nochmal sauber per Kategorie aufbauen
    def by_cat(cat):
        result = {}
        seen = set()
        for bls_key, js_key, c in FIELD_MAP:
            if c == cat and js_key not in seen:
                seen.add(js_key)
                val = v(bls_key)
                if val is not None and val != 0:
                    result[js_key] = val
        return result

    return {
        "name":            str(row[1]).strip() if row[1] else ingredient_name,
        "referenceAmount": 100,
        "unit":            "g",
        "category":        "",
        "notes":           "",
        "source":          "BLS 4.0",
        "macros":          macros,
        "vitamins":        by_cat("vitamin"),
        "minerals":        by_cat("mineral"),
        "carbohydrates":   by_cat("carbohydrate"),
        "fibers":          by_cat("fiber"),
        "sugarAlcoholsDetail": by_cat("sugarAlcohol"),
        "fattyAcids":      by_cat("fattyAcid"),
        "aminoAcids":      by_cat("aminoAcid"),
        "otherNutrients":  by_cat("other"),
        "extra":           {},
    }


def load_bls(xlsx_path: Path) -> tuple[tuple, list[tuple]]:
    """Lädt die BLS-Daten und gibt (headers, rows) zurück."""
    print(f"Lade BLS-Daten aus {xlsx_path} …")
    wb = openpyxl.load_workbook(xlsx_path, read_only=True, data_only=True)
    ws = wb.active
    rows_iter = ws.iter_rows(values_only=True)
    headers = next(rows_iter)
    rows = list(rows_iter)
    print(f"  {len(rows)} Einträge geladen.\n")
    return headers, rows


def search_bls(ingredient: str, rows: list[tuple]) -> dict:
    """
    Sucht nach der Zutat in BLS-Spalte 1 (Lebensmittelbezeichnung).

    Gibt zurück:
        {"exact": [row, ...], "partial": [row, ...]}
    """
    needle = ingredient.strip().lower()
    exact = []
    partial = []
    for row in rows:
        name = str(row[1]).strip() if row[1] else ""
        if name.lower() == needle:
            exact.append(row)
        elif needle in name.lower():
            partial.append(row)
    return {"exact": exact, "partial": partial}


def process_ingredient(
    ingredient: str,
    rows: list[tuple],
    col_idx: dict,
    out_dir: Path,
    dry: bool,
) -> None:
    print(f"─── {ingredient} {'(DRY RUN) ' if dry else ''}{'─' * max(0, 50 - len(ingredient))}")

    result = search_bls(ingredient, rows)
    exact   = result["exact"]
    partial = result["partial"]

    if not exact and not partial:
        print(f"  ✗ Kein Treffer gefunden.\n")
        return

    if len(exact) == 1:
        # Direkter, eindeutiger Treffer → JSON erzeugen und speichern
        row = exact[0]
        data = row_to_json(row, col_idx, ingredient)
        key = norm_name(ingredient)
        filename = f"{key}.json"
        out_path = out_dir / filename

        print(f"  ✓ Direkter Treffer: {row[1]}  (BLS: {row[0]})")
        print(f"    kcal={data['macros']['kcal']}, Protein={data['macros']['protein']}g, "
              f"Fett={data['macros']['fat']}g, KH={data['macros']['carbs']}g")

        if not dry:
            out_dir.mkdir(parents=True, exist_ok=True)
            out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"    → Gespeichert: {out_path}")
        else:
            print(f"    → (DRY) Würde speichern als: {out_path}")

    elif len(exact) > 1:
        print(f"  ⚠ Mehrere exakte Treffer ({len(exact)}) – nichts gespeichert:")
        for row in exact:
            print(f"    • [{row[0]}] {row[1]}")

    else:
        # Kein exakter Treffer, aber Teilstring-Treffer
        all_hits = partial
        print(f"  ? Kein exakter Treffer. {len(all_hits)} Teilstring-Treffer – nichts gespeichert:")
        for row in all_hits[:20]:
            print(f"    • [{row[0]}] {row[1]}")
        if len(all_hits) > 20:
            print(f"    … und {len(all_hits) - 20} weitere.")

    print()


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    script_dir = Path(__file__).parent

    parser = argparse.ArgumentParser(description="BLS 4.0 → ingredient-details JSON")
    parser.add_argument(
        "ingredients", nargs="*",
        help="Zutaten (wenn leer, wird die INGREDIENTS-Liste im Script verwendet)"
    )
    parser.add_argument(
        "--out", default=str(script_dir.parent / "ingredients_details_out"),
        help="Ausgabe-Ordner (default: ../ingredients_details_out/)"
    )
    parser.add_argument(
        "--bls", default=str(script_dir / "BLS_4_0_Daten_2025_DE.xlsx"),
        help="Pfad zur BLS XLSX Datei"
    )
    parser.add_argument(
        "--dry", action="store_true",
        help="Nur anzeigen, nichts speichern"
    )
    args = parser.parse_args()

    ingredients = args.ingredients if args.ingredients else INGREDIENTS
    out_dir = Path(args.out)
    bls_path = Path(args.bls)

    if not bls_path.exists():
        print(f"Fehler: BLS-Datei nicht gefunden: {bls_path}")
        sys.exit(1)

    headers, rows = load_bls(bls_path)
    col_idx = build_col_index(headers)

    for ingredient in ingredients:
        process_ingredient(ingredient, rows, col_idx, out_dir, dry=args.dry)

    if not args.dry:
        saved = list(out_dir.glob("*.json")) if out_dir.exists() else []
        print(f"Fertig. {out_dir} enthält {len(saved)} Datei(en).")


if __name__ == "__main__":
    main()
