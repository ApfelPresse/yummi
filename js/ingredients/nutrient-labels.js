// ─── Label-Mappings ──────────────────────────────────────────────────────────

export const MACRO_LABELS = {
	kcal:          ["Kalorien (kcal)",   "kcal"],
	water:         ["Wasser",            "g"],
	protein:       ["Protein",           "g"],
	fat:           ["Fett",              "g"],
	carbs:         ["Kohlenhydrate",     "g"],
	fiber:         ["Ballaststoffe",     "g"],
	alcohol:       ["Alkohol (Ethanol)", "g"],
	sugarAlcohols: ["Zuckeralkohole",    "g"]
};

export const FAT_SOLUBLE_VITAMIN_LABELS = {
	vita:      ["Vitamin A, Retinol-Äquivalent (RE)", "µg"],
	vitaa:     ["Vitamin A, Retinol-Aktivitäts-Äquivalent (RAE)", "µg"],
	retol:     ["Retinol", "µg"],
	cartb:     ["Beta-Carotin", "µg"],
	carotpaxb: ["Carotinoide, außer Beta-Carotin", "µg"],
	vitd:      ["Vitamin D", "µg"],
	chocal:    ["Vitamin D3 (Cholecalciferol)", "µg"],
	ergcal:    ["Vitamin D2 (Ergocalciferol)", "µg"],
	vite:      ["Vitamin E (Alpha-Tocopherol)", "mg"],
	tocpha:    ["Alpha-Tocopherol", "mg"],
	tocphb:    ["Beta-Tocopherol", "mg"],
	tocphg:    ["Gamma-Tocopherol", "mg"],
	tocphd:    ["Delta-Tocopherol", "mg"],
	toctra:    ["Alpha-Tocotrienol", "mg"],
	vitk:      ["Vitamin K", "µg"],
	vitk1:     ["Vitamin K1 (Phyllochinon)", "µg"],
	vitk2:     ["Vitamin K2 (Menachinone)", "µg"]
};

export const WATER_SOLUBLE_VITAMIN_LABELS = {
	thia:   ["Vitamin B1 (Thiamin)", "mg"],
	ribf:   ["Vitamin B2 (Riboflavin)", "mg"],
	niaeq:  ["Niacin-Äquivalent", "mg"],
	nia:    ["Niacin", "mg"],
	pantac: ["Pantothensäure", "mg"],
	vitb6:  ["Vitamin B6", "µg"],
	biot:   ["Biotin", "µg"],
	fol:    ["Folat-Äquivalent", "µg"],
	folfd:  ["Folat", "µg"],
	folac:  ["Folsäure, synthetisch", "µg"],
	vitb12: ["Vitamin B12 (Cobalamine)", "µg"],
	vitc:   ["Vitamin C", "mg"]
};

export const MINERAL_LABELS = {
	nacl: ["Salz (Natriumchlorid)", "g"],
	na:   ["Natrium", "mg"],
	cld:  ["Chlorid", "mg"],
	k:    ["Kalium", "mg"],
	ca:   ["Calcium", "mg"],
	mg:   ["Magnesium", "mg"],
	p:    ["Phosphor", "mg"],
	s:    ["Schwefel", "mg"],
	fe:   ["Eisen", "mg"],
	zn:   ["Zink", "mg"],
	id:   ["Iodid", "µg"],
	cu:   ["Kupfer", "µg"],
	mn:   ["Mangan", "µg"],
	fd:   ["Fluorid", "µg"],
	cr:   ["Chrom", "µg"],
	mo:   ["Molybdän", "µg"]
};

export const CARB_LABELS = {
	cho:    ["Kohlenhydrate, verfügbar", "g"],
	mnsac:  ["Monosaccharide, gesamt", "g"],
	glus:   ["Glucose", "g"],
	frus:   ["Fructose", "g"],
	gals:   ["Galactose", "g"],
	disac:  ["Disaccharide, gesamt", "g"],
	sucs:   ["Saccharose", "g"],
	mals:   ["Maltose", "g"],
	lacs:   ["Lactose", "g"],
	sugar:  ["Zucker (Mono- und Disaccharide), gesamt", "g"],
	olsac:  ["Oligosaccharide, verfügbar", "g"],
	starch: ["Stärke (Stärke, Glykogen, Dextrine)", "g"]
};

export const FIBER_LABELS = {
	fibt:    ["Ballaststoffe, gesamt", "g"],
	fiblmw:  ["Ballaststoffe, niedermolekular", "g"],
	fibhmw:  ["Ballaststoffe, hochmolekular", "g"],
	fibins:  ["Ballaststoffe, wasserunlöslich", "g"],
	fibsol:  ["Ballaststoffe, wasserlöslich", "g"],
	fibhmws: ["Ballaststoffe, hochmolekular, wasserlöslich", "g"],
	fibhmwi: ["Ballaststoffe, hochmolekular, wasserunlöslich", "g"]
};

export const SUGAR_ALCOHOL_LABELS = {
	polyl: ["Zuckeralkohole, gesamt", "g"],
	mantl: ["Mannit", "g"],
	sortl: ["Sorbit", "g"],
	xyltl: ["Xylit", "g"]
};

export const FATTY_ACID_LABELS = {
	fasat:    ["Fettsäuren, gesättigt, gesamt", "g"],
	f4_0:     ["Fettsäure C4:0 (Buttersäure)", "g"],
	f6_0:     ["Fettsäure C6:0 (Capronsäure)", "g"],
	f8_0:     ["Fettsäure C8:0 (Caprylsäure)", "g"],
	f10_0:    ["Fettsäure C10:0 (Caprinsäure)", "g"],
	f12_0:    ["Fettsäure C12:0 (Laurinsäure)", "g"],
	f14_0:    ["Fettsäure C14:0 (Myristinsäure)", "g"],
	f15_0:    ["Fettsäure C15:0 (Pentadecylsäure)", "g"],
	f16_0:    ["Fettsäure C16:0 (Palmitinsäure)", "g"],
	f17_0:    ["Fettsäure C17:0 (Margarinsäure)", "g"],
	f18_0:    ["Fettsäure C18:0 (Stearinsäure)", "g"],
	f20_0:    ["Fettsäure C20:0 (Arachinsäure)", "g"],
	f22_0:    ["Fettsäure C22:0 (Behensäure)", "g"],
	f24_0:    ["Fettsäure C24:0 (Lignocerinsäure)", "g"],
	fams:     ["Fettsäure, einfach ungesättigt, gesamt", "g"],
	f14_1cn5: ["Fettsäure C14:1 n-5 cis (Myristoleinsäure)", "g"],
	f16_1cn7: ["Fettsäure C16:1 n-7 cis (Palmitoleinsäure)", "g"],
	f18_1cn7: ["Fettsäure C18:1 n-7 cis (Vaccensäure)", "g"],
	f18_1cn9: ["Fettsäure C18:1 n-9 cis (Ölsäure)", "g"],
	f20_1cn9: ["Fettsäure C20:1 n-9 cis (Gondosäure)", "g"],
	f22_1cn9: ["Fettsäure C22:1 n-9 cis (Erucasäure)", "g"],
	fapu:     ["Fettsäuren, mehrfach ungesättigt, gesamt", "g"],
	fapun3:   ["Fettsäuren, mehrfach ungesättigt n-3 (Omega-3), gesamt", "g"],
	f18_3cn3: ["Fettsäure C18:3 n-3 all-cis (Alpha-Linolensäure)", "g"],
	f18_4cn3: ["Fettsäure C18:4 n-3 all-cis (Stearidonsäure)", "g"],
	f20_5cn3: ["Fettsäure C20:5 n-3 all-cis (Eicosapentaensäure)", "g"],
	f22_5cn3: ["Fettsäure C22:5 n-3 all-cis (Docosapentaensäure)", "g"],
	f22_6cn3: ["Fettsäure C22:6 n-3 all-cis (Docosahexaensäure)", "g"],
	fapun6:   ["Fettsäuren, mehrfach ungesättigt n-6 (Omega-6), gesamt", "g"],
	f18_2cn6: ["Fettsäure C18:2 n-6 cis, cis (Linolsäure)", "g"],
	f18_2c9t11: ["Fettsäure C18:2 n-7 cis 9, trans 11 (konjugierte Linolsäure)", "g"],
	f18_3cn6: ["Fettsäure C18:3 n-6 all-cis (Gamma-Linolensäure)", "g"],
	f20_2cn6: ["Fettsäure C20:2 n-6 all-cis (Eicosadiensäure)", "g"],
	f20_3cn6: ["Fettsäure C20:3 n-6 all-cis (Dihomogamma-Linolensäure)", "g"],
	f20_4cn6: ["Fettsäure C20:4 n-6 all-cis (Arachidonsäure)", "g"],
	fax:      ["Fettsäuren, sonstige", "g"]
};

export const AMINO_LABELS = {
	aae9: ["Aminosäuren, unentbehrlich, gesamt", "g"],
	ala:  ["Alanin", "g"],
	arg:  ["Arginin", "g"],
	asp:  ["Asparaginsäure, inklusive Asparagin", "g"],
	cyste: ["Cystein", "g"],
	glu:  ["Glutaminsäure, inklusive Glutamin", "g"],
	gly:  ["Glycin", "g"],
	his:  ["Histidin", "g"],
	ile:  ["Isoleucin", "g"],
	leu:  ["Leucin", "g"],
	lys:  ["Lysin", "g"],
	met:  ["Methionin", "g"],
	phe:  ["Phenylalanin", "g"],
	pro:  ["Prolin", "g"],
	ser:  ["Serin", "g"],
	thr:  ["Threonin", "g"],
	trp:  ["Tryptophan", "g"],
	tyr:  ["Tyrosin", "g"],
	val:  ["Valin", "g"]
};

export const OTHER_NUTRIENT_LABELS = {
	chorl: ["Cholesterin", "mg"],
	nt:    ["Stickstoff, gesamt", "g"]
};
