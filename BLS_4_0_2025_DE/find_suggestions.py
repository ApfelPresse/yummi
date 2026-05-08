#!/usr/bin/env python3
import zipfile
import xml.etree.ElementTree as ET

# XLSX ist ein ZIP
with zipfile.ZipFile("BLS_4_0_Daten_2025_DE.xlsx") as z:
    with z.open("xl/worksheets/sheet1.xml") as f:
        tree = ET.parse(f)
        root = tree.getroot()

# Namespace handling
ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'

# Alle Zellwerte extrahieren (Code, Name)
rows_data = []
for row in root.iter(f'{{{ns}}}row'):
    cells = row.findall(f'{{{ns}}}c')
    if len(cells) >= 2:
        text_nodes = [c.find(f'{{{ns}}}v') for c in cells[:2]]
        if all(t is not None for t in text_nodes):
            rows_data.append((text_nodes[0].text, text_nodes[1].text))

print(f"BLS-Einträge geladen: {len(rows_data)}\n")

not_found = [
    "Chiliflocken", "Chiliöl", "Chilipulver", "Getrocknete Chili",
    "Paprikamark", "Paprikapulver", "Frische Petersilie", "Lauchgrün",
    "Selleriestange", "Rote-Bete-Blatt", "Rote Linse", "Pasta", "Reismehl",
    "Schwarzer Pfeffer", "Schwarze Bohnen", "Muskatnuss", "Nelke", "Sternanis",
    "Kurkuma", "Ghee", "NEUTRALES ÖL", "Sojamilch", "Sojasahne", "Gochujang",
    "Kimchi", "Mandelmehl", "Panko", "Granatapfelsirup", "Hartweizengrieß",
    "Klebreiswein", "Reisessig", "Rinderfond", "Risottoreis"
]

print("VALIDIERTE VORSCHLÄGE (exakte BLS-Treffer):")
print("=" * 80)

suggestions = {}
for zutat in not_found:
    # Case-insensitive substring search
    matches = [(code, name) for code, name in rows_data 
               if zutat.lower() in name.lower()][:3]
    if matches:
        suggestions[zutat] = matches

for zutat in sorted(suggestions.keys()):
    print(f"\n{zutat}:")
    for code, name in suggestions[zutat]:
        print(f"  → {name:50} (BLS: {code})")

print(f"\n\nGESAMT: {len(suggestions)} / {len(not_found)} mit Vorschlägen")
