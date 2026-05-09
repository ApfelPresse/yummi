#!/usr/bin/env python3
"""
Batch-Verarbeitung der Zutaten-Liste gegen BLS 4.0.

Für jede Zutat:
  - Exakter Treffer (genau 1) → JSON wird gespeichert
  - Mehrere exakte Treffer   → aufgelistet, nichts gespeichert
  - Nur Teilstring-Treffer   → aufgelistet, nichts gespeichert
  - Kein Treffer             → gelistet

Am Ende: Zusammenfassung mit allen nicht eindeutig aufgelösten Zutaten.

Verwendung:
    python bls_batch.py [--out <pfad>] [--dry] [--bls <pfad>]
"""

import sys
import argparse
from pathlib import Path

# Skript importiert die Kernlogik aus bls_to_json.py
sys.path.insert(0, str(Path(__file__).parent))
from bls_to_json import load_bls, build_col_index, search_bls, row_to_json, norm_name

import json

# ─── Zutaten-Liste ────────────────────────────────────────────────────────────

INGREDIENTS = [
    "Sonnenblumenöl",
    "Agavendicksaft",
    "Ahornsirup",
    "AONORI",
    "Apfel",
    "Apfelessig",
    "Aubergine",
    "Austernpilz",
    "Avocado",
    "BACKPULVER",
    "Balsamico-Essig",
    "Bergkäse",
    "Birnen",
    "Blumenkohl",
    "Bockshornkleesamen",
    "BONITOFLOCKE",
    "Brauner Reissirup",
    "Braunreismehl",
    "Brokkoli",
    "Brokkoliblatt",
    "Brötchen",
    "Brühe",
    "Buchweizenmehl",
    "Butter",
    "Cashewkerne",
    "Champignon",
    "Chili",
    "Chiliflocken",
    "Chiliöl",
    "Chilipulver",
    "Chilischote",
    "Chinakohl",
    "Currypulver",
    "Dashima",
    "Dattel",
    "Dijonsenf",
    "Doubanjiang",
    "Dukkah",
    "Edelpilzkäse",
    "Ei",
    "Eigelb",
    "Erdnuss",
    "Erdnussbutter",
    "Fermentierte Schwarze Bohne",
    "Fermentierte Sojabohnen",
    "Feta",
    "Fladenbrot",
    "Frische Petersilie",
    "Frühlingszwiebel",
    "Frühlingszwiebelgrün",
    "GARNELE ODER TINTENFISCH",
    "Gemüsebrühe",
    "Getrocknete Chili",
    "Gewürzgurke",
    "Ghee",
    "Gochugaru",
    "Gochujang",
    "Granatapfelsirup",
    "Griechischer Joghurt",
    "Gurke",
    "Gurkenflüssigkeit",
    "Halloumi",
    "Hartweizengrieß",
    "Helle Sojasauce",
    "Himbeere",
    "Honig",
    "Ingwer",
    "Jalapeño",
    "JAPANISCHE MAYONNAISE",
    "Joghurt",
    "Kapern",
    "Kapernlake",
    "Karotte",
    "Kartoffel",
    "Kartoffelstärke",
    "KÄSE",
    "KETCHUP",
    "Kimchi",
    "Kimchi-Lake",
    "Kirschtomate",
    "Klebreiswein",
    "Knoblauch",
    "Knoblauchpulver",
    "Knoblauchzehe",
    "Kochsahne",
    "Kochspray",
    "Kohlrabi",
    "Koreanische BBQ-Sauce",
    "Koriander",
    "Koriandergrün",
    "Koriandersamen",
    "Kreuzkümmel",
    "Kreuzkümmelsamen",
    "Kürbis",
    "Kurkuma",
    "Lachsfilet",
    "Lauchgrün",
    "Limabohne",
    "Limette",
    "Lion's Mane Pilze",
    "Lorbeerblatt",
    "Maisstärke",
    "Mandelmehl",
    "Mangold",
    "Mayonnaise",
    "Meerrettich",
    "Meersalz",
    "Mehl",
    "Mezze",
    "Minze",
    "Miso",
    "Möhre",
    "MSG",
    "Muskatnuss",
    "Nährhefe",
    "Nelke",
    "NEUTRALES ÖL",
    "Nigellasamen",
    "Noriflocken",
    "OKONOMIYAKI-SAUCE",
    "Oliven",
    "Orange",
    "Orangenlikör",
    "Pak Choi",
    "Paniermehl",
    "Panko",
    "Paprika",
    "Paprikamark",
    "Paprikapulver",
    "Paprikaschote",
    "Pasta",
    "Petersilie",
    "Pflanzendrink",
    "Pflanzenmilch",
    "Pflanzliche Milch",
    "Pilz",
    "Pinienkern",
    "Pinienkerne",
    "Portwein",
    "Ramen-Gewürz",
    "Ramen-Gewürzmischung",
    "Rapsöl",
    "Ras-el-Hanout",
    "Reis",
    "Reisessig",
    "Reismehl",
    "Relish",
    "Rettich",
    "Rinderfond",
    "Rinderhack",
    "Rinderknochen",
    "Rindertalg",
    "Risottoreis",
    "Rohrohrzucker",
    "Rosmarin",
    "Rote Bete",
    "Rote Linse",
    "Rote-Bete-Blatt",
    "Rotkohl",
    "Rotwein",
    "Rundkornreis",
    "Safranfäden",
    "Salbei",
    "Schafskäse",
    "Schalotte",
    "Schwarze Bohnen",
    "Schwarze Pfefferkörner",
    "Schwarzer Pfeffer",
    "Schwarzer Sesam",
    "Schweinerippe",
    "Selleriestange",
    "Sesamöl",
    "Sesamsamen",
    "Shaoxing-Wein",
    "Shiitake",
    "Shiitakepilz",
    "Sichuan-Chilibohnenpaste",
    "Sichuanpfeffer",
    "Sojamehl",
    "Sojamilch",
    "Sojasahne",
    "Sojasauce",
    "Sojasoße",
    "Sojawürfel",
    "Somyeon",
    "Speisestärke",
    "Spinat",
    "Spitzkohl",
    "Sprudelwasser",
    "Staudensellerie",
    "Steinpilz",
    "Steinzucker",
    "Sternanis",
    "Suppengrün",
    "Süßkartoffel",
    "Szechuan-Chili",
    "Szechuanpfeffer",
    "Tagliatelle, Spaghetti oder Bavette",
    "Thymian",
    "Tofu",
    "Tomate",
    "Tomatenmark",
    "Trockenhefe",
    "Veganer Mozzarella",
    "Veganes Entenbrustfilet",
    "Walnuss",
    "WASSER ODER DASHI",
    "Weißer Pfeffer",
    "WEISSKOHL",
    "Weißkohl",
    "Weißwein",
    "Weißweinessig",
    "Weizenmehl",
    "WORCESTERSAUCE",
    "Zimt",
    "Zitrone",
    "Zitronensaft",
    "Zucchini",
    "Zucker",
    "Zwiebelpulver",
    "Zwiebelschmalz",
]

# ─── Manuelles Mapping ────────────────────────────────────────────────────────
# Zutaten ohne exakten BLS-Treffer → manuell zugeordneter BLS-Name.
# Das JSON wird gespeichert, aber mit einer Notiz versehen.

MAPPING = {
    "Apfel":              "Apfel roh",
    "Aubergine":          "Aubergine gegrillt",
    "Austernpilz":        "Austernpilz getrocknet",
    "Avocado":            "Avocado roh",
    "Balsamico-Essig":    "Balsamicoessig",
    "Bergkäse":           "Bergkäse mind. 45 % Fett i. Tr.",
    "Birnen":             "Apfel-Bananen-Birnenmus roh",
    "Blumenkohl":         "Blumenkohl gedünstet (mit Fett und Salz)",
    "Brokkoli":           "Broccoli gedünstet",
    "Brokkoliblatt":      "Broccoli roh",
    "Brötchen":           "Weizenbrötchen",
    "Brühe":              "Gemüse Bouillon/Brühe/Suppe (Brühwürfel, Pulver)",
    "Buchweizenmehl":     "Buchweizen Mehl",
    "Champignon":         "Champignon gebraten ohne Fett (Pfanne)",
    "Chinakohl":          "Chinakohl roh",
    "Dattel":             "Dattel getrocknet",
    "Dijonsenf":          "Senf mittelscharf",
    "Ei":                 "Hühnerei gebacken",
    "Eigelb":             "Hühnerei Eigelb, gebraten ohne Fett (Pfanne)",
    "Erdnuss":            "Erdnuss geröstet",
    "Erdnussbutter":      "Erdnussbutter/Erdnusscreme",
    "Edelpilzkäse":       "Edelpilzkäse mind. 50 % Fett i. Tr.",
    "Feta":               "Feta mind. 45 % Fett i. Tr.",
    "Fladenbrot":         "Weizenfladenbrot",
    "Frühlingszwiebel":   "Frühlingszwiebel/Lauchzwiebel (ohne Laub) roh",
    "Gewürzgurke":        "Gurke gesäuert (Gewürzgurke) abgetropft",
    "Gurke":              "Gurke roh",
    "Halloumi":           "Halloumi Grillkäse, gegrillt",
    "Helle Sojasauce":    "Sojasauce/Sojasoße",
    "Himbeere":           "Himbeere roh",
    "Ingwer":             "Ingwer/Ingwerwurzel, roh",
    "Joghurt":            "Joghurt mild, mind. 3,5 % Fett",
    "Kapern":             "Kapern gesäuert, abgetropft",
    "Kartoffelstärke":    "Kartoffelstärke (Kartoffelmehl)",
    "Kartoffel":          "Kartoffel ungeschält, gebacken",
    "Karotte":            "Karotte/Möhre, gebraten ohne Fett (Pfanne)",
    "KÄSE":               "Edelpilzkäse mind. 50 % Fett i. Tr.",
    "KETCHUP":            "Tomatenketchup",
    "Kirschtomaten":      "Tomate gedünstet",
    "Knoblauch":          "Knoblauch gebraten ohne Fett (Pfanne)",
    "Knoblauchpulver":    "Knoblauch getrocknet",
    "Knoblauchzehe":      "Knoblauch gebraten ohne Fett (Pfanne)",
    "Kohlrabi":           "Kohlrabi gekocht",
    "Kürbis":             "Kürbis gedünstet (mit Fett und Salz)",
    "Lachsfilet":         "Seelachsfilet gedünstet (mit Fett und Salz)",
    "Limabohne":          "Limabohne (Butterbohne, Mondbohne) reif, gekocht",
    "Limette":            "Limettensaft",
    "Maisstärke":         "Mais Stärke",
    "Mangold":            "Mangold gedünstet (mit Fett und Salz)",
    "Mayonnaise":         "Mayonnaise (Fertigprodukt)",
    "Meerrettich":        "Meerrettichsoße Konserve",
    "Mehl":               "Weizen Mehl, Type 405",
    "Miso":               "Miso/Sojabohnenpaste",
    "Möhre":              "Karotte/Möhre, gebraten ohne Fett (Pfanne)",
    "Nährhefe":           "Hefe Flocken/Nährhefe",
    "Oliven":             "Oliven geschwärzt, in Salzlake, abgetropft",
    "Orange":             "Orange roh",
    "Pak Choi":           "Pak Choi gedünstet",
    "Paniermehl":         "Paniermehl/Semmelbrösel/Semmelmehl",
    "Paprika":            "Paprika gedünstet (mit Fett und Salz)",
    "Paprikamark":        "Tomatenmark",
    "Paprikapulver":      "Paprika gedünstet (mit Fett und Salz)",
    "Paprikaschote":      "Paprika gedünstet (mit Fett und Salz)",
    "Petersilie":         "Petersilienblatt roh",
    "Pilz":               "Steinpilz getrocknet",
    "Rapsöl":             "Rapsöl/Rüböl",
    "Reis":               "Reis gekocht",
    "Reismehl":           "Reis Mehl",
    "Rettich":            "Rettich roh",
    "Rindertalg":         "Rinderfett/Rindertalg",
    "Rote Bete":          "Rote Rübe/Rote Bete, gedünstet",
    "Rotkohl":            "Rotkohl geschmort ohne Fett",
    "Rotwein":            "Rotwein trocken",
    "Schalotte":          "Schalotte gedünstet",
    "Schwarzer Pfeffer":  "Pfeffer schwarz, getrocknet",
    "Sesamsamen":         "Sesam",
    "Shiitake":           "Shiitakepilz getrocknet",
    "Shiitakepilz":       "Shiitakepilz getrocknet",
    "Sojamehl":           "Sojamehl vollfett",
    "Sojasauce":          "Sojasauce/Sojasoße",
    "Sojasoße":           "Sojasauce/Sojasoße",
    "Speisestärke":       "Mais Stärke",
    "Spinat":             "Spinat gedünstet",
    "Spitzkohl":          "Spitzkohl gedünstet (mit Fett und Salz)",
    "Staudensellerie":    "Selleriegemüse gekocht",
    "Steinpilz":          "Steinpilz getrocknet",
    "Steinzucker":        "Zucker weiß (Raffinadezucker/Weißzucker)",
    "Suppengrün":         "Suppengrün/Suppenkraut, gekocht",
    "Süßkartoffel":       "Batate/Süßkartoffel, gebacken",
    "Tomate":             "Tomate geschält, Konserve",
    "Trockenhefe":        "Backhefe getrocknet (Trockenbackhefe)",
    "Veganer Mozzarella": "Käsealternative, Basis Cashewkerne, vegan",
    "Weißer Pfeffer":     "Pfeffer schwarz, getrocknet",
    "Weißkohl":           "Weißkohl gedünstet",
    "WEISSKOHL":          "Weißkohl gedünstet",
    "Weißwein":           "Weißwein trocken",
    "Weißweinessig":      "Weinessig",
    "Weizenmehl":         "Weizen Mehl, Type 405",
    "Zitrone":            "Zitrone roh",
    "Zucker":             "Zucker weiß (Raffinadezucker/Weißzucker)",
    "Zucchini":           "Zucchini gedünstet (mit Fett und Salz)",
    "Zwiebelpulver":      "Speisezwiebel getrocknet",
}


# ─── Verarbeitung ─────────────────────────────────────────────────────────────

def process_all(ingredients, rows, col_idx, out_dir, dry):
    saved         = []   # [(ingredient, bls_code, bls_name, is_mapped)]
    multi_exact   = []   # [(ingredient, [rows])]
    partial_only  = []   # [(ingredient, [rows])]
    not_found     = []   # [ingredient]

    total = len(ingredients)
    for i, ingredient in enumerate(ingredients, 1):
        # Prüfe ob ein manuelles Mapping existiert
        mapped_name = MAPPING.get(ingredient)

        # Erst exakte Suche auf Originalname
        result = search_bls(ingredient, rows)
        exact  = result["exact"]
        partial = result["partial"]

        # Falls kein exakter Treffer und Mapping vorhanden → Mapping-Suche
        if len(exact) != 1 and mapped_name:
            mapped_result = search_bls(mapped_name, rows)
            if len(mapped_result["exact"]) == 1:
                exact = mapped_result["exact"]
                partial = []

        if len(exact) == 1:
            row      = exact[0]
            is_mapped = mapped_name is not None and row[1].strip() != ingredient
            note = (
                f"Kein exakter BLS-Treffer für '{ingredient}'; Nährstoffe basieren auf: {row[1].strip()}"
                if is_mapped else ""
            )
            data = row_to_json(row, col_idx, ingredient)
            data["name"]  = ingredient   # Originalname behalten
            data["notes"] = note
            key      = norm_name(ingredient)
            out_path = out_dir / f"{key}.json"

            marker = "~" if is_mapped else "✓"
            mapped_info = f"  (via Mapping: {row[1]})" if is_mapped else ""
            print(f"[{i:3}/{total}] {marker}  {ingredient}  →  {row[1]}  (BLS: {row[0]}){mapped_info}")

            if not dry:
                out_dir.mkdir(parents=True, exist_ok=True)
                out_path.write_text(
                    json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
                )
            saved.append((ingredient, row[0], row[1], is_mapped))

        elif len(exact) > 1:
            print(f"[{i:3}/{total}] ⚠  {ingredient}  →  {len(exact)} exakte Treffer")
            multi_exact.append((ingredient, exact))

        elif partial:
            print(f"[{i:3}/{total}] ?  {ingredient}  →  {len(partial)} Teilstring-Treffer")
            partial_only.append((ingredient, partial))

        else:
            print(f"[{i:3}/{total}] ✗  {ingredient}  →  kein Treffer")
            not_found.append(ingredient)

    return saved, multi_exact, partial_only, not_found


def print_summary(saved, multi_exact, partial_only, not_found, dry):
    print("\n" + "═" * 60)
    print(f"ZUSAMMENFASSUNG{'  (DRY RUN)' if dry else ''}")
    print("═" * 60)
    print(f"  Gespeichert (exakter Treffer): {sum(1 for s in saved if not s[3])}")
    print(f"  Gespeichert (via Mapping):     {sum(1 for s in saved if s[3])}")
    print(f"  Mehrdeutig (mehrere exakte):   {len(multi_exact)}")
    print(f"  Nur Teilstring-Treffer:        {len(partial_only)}")
    print(f"  Nicht gefunden:                {len(not_found)}")

    if multi_exact:
        print("\n── Mehrdeutige Treffer ────────────────────────────────")
        for ingredient, rows in multi_exact:
            print(f"  {ingredient}:")
            for r in rows:
                print(f"    • [{r[0]}] {r[1]}")

    if partial_only:
        print("\n── Nur Teilstring-Treffer (manuell prüfen) ────────────")
        for ingredient, rows in partial_only:
            print(f"  {ingredient}:")
            for r in rows:
                print(f"    • [{r[0]}] {r[1]}")

    if not_found:
        print("\n── Nicht gefunden ──────────────────────────────────────")
        for ing in not_found:
            print(f"  • {ing}")

    print()


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    script_dir = Path(__file__).parent

    parser = argparse.ArgumentParser(description="BLS Batch → ingredient-details JSON")
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

    bls_path = Path(args.bls)
    out_dir  = Path(args.out)

    if not bls_path.exists():
        print(f"Fehler: BLS-Datei nicht gefunden: {bls_path}")
        sys.exit(1)

    headers, rows = load_bls(bls_path)
    col_idx = build_col_index(headers)

    saved, multi_exact, partial_only, not_found = process_all(
        INGREDIENTS, rows, col_idx, out_dir, dry=args.dry
    )

    print_summary(saved, multi_exact, partial_only, not_found, dry=args.dry)

    if not args.dry and out_dir.exists():
        count = len(list(out_dir.glob("*.json")))
        print(f"Ausgabe-Ordner: {out_dir}  ({count} Datei(en) gesamt)")


if __name__ == "__main__":
    main()
