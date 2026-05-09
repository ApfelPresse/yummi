#!/usr/bin/env python3
"""
BLS 4.0 → Template Generator

Liest ALLE Einträge aus der BLS 4.0 Nährstoffdatenbank und erzeugt
für jeden Eintrag ein vollständiges JSON-Template im Format des 
ingredient-details.js Schemas.

Ausgabe: bls_templates/bls_4_0_<name>.json

Verwendung:
    python generate_templates.py [--bls <pfad>] [--dry]

Optionen:
    --bls <pfad>    Pfad zur BLS XLSX Datei (default: ../BLS_4_0_2025_DE/BLS_4_0_Daten_2025_DE.xlsx)
    --dry           Nur anzeigen, nichts speichern
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

# ─── BLS-Schlüssel → JSON-Feldname Mapping ───────────────────────────────────

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
    s = re.sub(r"[\u0300-\u036f]", "", s)  # Diakritika entfernen
    s = re.sub(r"\s+", "_", s)  # Spaces zu Underscores
    s = re.sub(r"[^\w\-]", "", s)  # Nur alphanumerisch, _, -
    return s


def build_col_index(headers: tuple) -> dict:
    """Baut ein Dict BLS_KEY_UPPERCASE → Spaltenindex aus den Header-Namen."""
    idx = {}
    for i, h in enumerate(headers):
        if h:
            key = str(h).split()[0].upper()
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
            return round(f, 4) if f != int(f) else int(f)
        except (TypeError, ValueError):
            return None

    def mv(bls_key):
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
    """Lädt die BLS-Daten."""
    print(f"Lade BLS-Daten aus {xlsx_path} …")
    wb = openpyxl.load_workbook(xlsx_path, read_only=True, data_only=True)
    ws = wb.active
    rows_iter = ws.iter_rows(values_only=True)
    headers = next(rows_iter)
    rows = list(rows_iter)
    print(f"  {len(rows)} Einträge geladen.\n")
    return headers, rows


def main():
    script_dir = Path(__file__).parent
    parent_dir = script_dir.parent

    parser = argparse.ArgumentParser(description="BLS 4.0 → Template Generator")
    parser.add_argument(
        "--bls", default=str(parent_dir / "BLS_4_0_2025_DE" / "BLS_4_0_Daten_2025_DE.xlsx"),
        help="Pfad zur BLS XLSX Datei"
    )
    parser.add_argument(
        "--dry", action="store_true",
        help="Nur anzeigen, nichts speichern"
    )
    args = parser.parse_args()

    out_dir = script_dir
    bls_path = Path(args.bls)

    if not bls_path.exists():
        print(f"Fehler: BLS-Datei nicht gefunden: {bls_path}")
        sys.exit(1)

    headers, rows = load_bls(bls_path)
    col_idx = build_col_index(headers)

    print(f"Generiere Templates… {'(DRY RUN)' if args.dry else ''}\n")

    if not args.dry:
        out_dir.mkdir(parents=True, exist_ok=True)

    saved_count = 0
    skipped_count = 0

    for idx, row in enumerate(rows, 1):
        if not row[1]:
            skipped_count += 1
            continue

        ingredient_name = str(row[1]).strip()
        normalized = norm_name(ingredient_name)
        filename = f"bls_4_0_{normalized}.json"
        out_path = out_dir / filename

        try:
            data = row_to_json(row, col_idx, ingredient_name)

            if not args.dry:
                out_path.write_text(
                    json.dumps(data, ensure_ascii=False, indent=2),
                    encoding="utf-8"
                )

            if idx % 50 == 0 or idx == len(rows):
                print(f"  [{idx:4d}] {ingredient_name:40s} → {filename}")

            saved_count += 1

        except Exception as e:
            print(f"  ✗ Fehler bei {ingredient_name}: {e}", file=sys.stderr)
            skipped_count += 1

    print(f"\nFertig!")
    print(f"  Gespeichert: {saved_count}")
    print(f"  Übersprungen: {skipped_count}")


if __name__ == "__main__":
    main()
