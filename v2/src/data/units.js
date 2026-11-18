// units.js — R2.1: die EINE Einheiten-Tabelle (ADR-R1 §4). Neutrale ids, Anzeigenamen je Sprache.
// Pur, unit-testbar. `factor` rechnet in `base` (g oder ml) um; Zähl-Einheiten haben keinen festen
// Faktor — ihr Gewicht steht je Zutat in ingredients.json (`units`).

const mass = (factor, name) => ({ kind: "mass", base: "g", factor, names: { de: name, en: name, es: name, da: name } });
const volume = (factor, de, en, es, da) => ({ kind: "volume", base: "ml", factor, names: { de, en, es, da } });
const count = (de, en, es, da) => ({ kind: "count", base: null, factor: null, names: { de, en, es, da } });

export const UNITS = {
  g: mass(1, "g"),
  kg: mass(1000, "kg"),
  ml: volume(1, "ml", "ml", "ml", "ml"),
  l: volume(1000, "l", "l", "l", "l"),
  tsp: volume(5, "TL", "tsp", "cdta.", "tsk."),
  tbsp: volume(15, "EL", "tbsp", "cda.", "spsk."),
  cup: volume(250, "Tasse", "cup", "taza", "kop"),
  piece: count("Stück", "piece", "unidad", "stk."),
  clove: count("Zehe", "clove", "diente", "fed"),
  slice: count("Scheibe", "slice", "rebanada", "skive"),
  bunch: count("Bund", "bunch", "manojo", "bundt"),
  can: count("Dose", "can", "lata", "dåse"),
  packet: count("Päckchen", "packet", "sobre", "pakke"),
  jar: count("Glas", "jar", "tarro", "glas"),
  tub: count("Becher", "tub", "tarrina", "bæger"),
  cube: count("Würfel", "cube", "cubito", "terning"),
  cm: count("cm", "cm", "cm", "cm"),
  pinch: { kind: "vague", base: "g", factor: 0.5, names: { de: "Prise", en: "pinch", es: "pizca", da: "knivspids" } },
};

export const UNIT_IDS = Object.keys(UNITS);

// Was heute in den (deutschen) Rezeptzeilen steht → id. Schlüssel klein, ohne Punkt am Ende.
const FROM_TEXT = {
  el: "tbsp", tl: "tsp", liter: "l", "päckchen": "packet", pck: "packet", dose: "can", dosen: "can",
  prise: "pinch", prisen: "pinch", zehe: "clove", zehen: "clove", scheibe: "slice", scheiben: "slice",
  "stück": "piece", bund: "bunch", glas: "jar", becher: "tub", "würfel": "cube", tasse: "cup", tassen: "cup",
};

/** Einheit aus einer Rezeptzeile ("EL", "Pck.", "Dosen", "g") → Einheiten-id, unbekannt → null. */
export function unitFromText(text) {
  if (typeof text !== "string") return null;
  const key = text.trim().toLowerCase().replace(/\.$/, "");
  if (Object.hasOwn(UNITS, key)) return key;
  return Object.hasOwn(FROM_TEXT, key) ? FROM_TEXT[key] : null;
}
