// prompts.js — Prompt-Vorlagen für den Assistenten. Antworten IMMER auf Deutsch
// (Projektkonvention). Das Modell antwortet mit genau EINEM JSON-Objekt,
// damit die App Vorschläge/Rezepte strukturiert rendern kann (parse.js).

import { CATEGORIES } from "../data/schema.js";
import { getTotalMinutes } from "../data/derive.js";

// A3: Koch-Profil — früher im System-Prompt hartkodiert, jetzt nutzereditierbar
// (Settings → data/settings.js). Diese Defaults sind Marcels Ausgangswerte; sie
// halten den Prompt unverändert, wenn niemand etwas anpasst. Pur & dep-frei,
// damit prompts.js testbar bleibt (settings.js importiert sie von hier).
export const DEFAULT_PROFILE = {
  level: "Anfänger bis Mittelstufe, pragmatisch",
  diet: "Hauptsächlich vegetarisch (Eier/Fisch ok, kein Fleisch im Regelkauf)",
  servings: "~4",
  weekday: "Schnell, 20–30 Min",
  weekend: "Aufwendiger, Experimente, Backen",
  shopping: "Dänische Supermärkte + Middle-Eastern-Bazaars",
  equipment: "Herd, Backofen, Mikrowelle, Mixer, Reiskocher",
  spices: "Salz, Pfeffer, Paprika, Kreuzkümmel, Curry, Chiliflocken, Rosmarin, Muskat, Zimt",
  notes: "",
};

const LANG_NAMES = { de: "Deutsch", en: "Englisch", es: "Spanisch", da: "Dänisch" };

/** Kompakte Sammlung-Übersicht: eine Zeile pro Rezept (id|Name|Kategorie|…). */
export function buildCollectionContext(recipes) {
  return recipes.map((r) => {
    const mins = getTotalMinutes(r);
    const bits = [r.id, r.name, r.category];
    if (mins) bits.push(mins + "min");
    if (r.effort) bits.push(r.effort);
    if (r.cuisine) bits.push(r.cuisine);
    if (r.mealPrep) bits.push("mealprep");
    if (r.toTry) bits.push("neu");
    if (r.rating >= 4) bits.push("★" + r.rating);
    return bits.join("|");
  }).join("\n");
}

export function buildSystemPrompt({ recipes, staples, fridge = [], profile = DEFAULT_PROFILE, lang = "de" }) {
  const p = { ...DEFAULT_PROFILE, ...(profile || {}) };
  const langName = LANG_NAMES[lang] || "Deutsch";
  const fridgeLine = fridge.length
    ? `\n\nFRISCH IM KÜHLSCHRANK (jetzt verfügbar — bevorzugt verwerten):\n${fridge.map((f) => f.menge ? `${f.name} (${f.menge})` : f.name).join(", ")}`
    : "";
  return `Du bist der Koch-Assistent in einer persönlichen Kochbuch-App.

KOCH-PROFIL:
- ${p.level}. ${p.diet}.
- Immer ${p.servings} Portionen (Reste werden über mehrere Tage gegessen).
- Wochentags: ${p.weekday}. Wochenende: ${p.weekend}.
${p.shopping ? `- Einkauf: ${p.shopping}.\n` : ""}- Ausstattung: ${p.equipment}. Kein Spezialgerät voraussetzen.
${p.notes ? `- ${p.notes}\n` : ""}
VORRAT (immer da — alles andere muss gekauft werden):
${(staples || []).join(", ")}
Gewürze nur: ${p.spices}. Andere Gewürze gelten als zu kaufen.${fridgeLine}

KOCHBUCH (id|Name|Kategorie|Minuten|Aufwand|Küche|…):
${buildCollectionContext(recipes)}

REGELN:
1. Antworte IMMER auf ${langName}, kurz und klar.
2. Antworte mit GENAU EINEM JSON-Objekt (ohne Markdown-Zaun, ohne Text davor/danach):
   - Vorschläge: {"type":"suggestions","intro":"1 Satz","items":[{"id":"r… oder null","name":"…","reason":"1 Satz"}]} — 3 bis 5 Stück. "id" nur, wenn das Rezept WIRKLICH im Kochbuch steht (exakte id aus der Liste). Neue Ideen: id=null.
   - Vollrezept: {"type":"recipe","intro":"1 Satz","recipe":{…}} — Schema unten.
   - Sonst: {"type":"text","text":"…"}
3. Rezept-Schema (flach, Schema v3):
   {"name":str,"category":str (EXAKT eine von: ${CATEGORIES.join(" / ")}),"time":"25 Min","servings":"~4","effort":"alltag"|"besonders","difficulty":"einfach"|"mittel"|"aufwändig","cuisine":str,"prepTime":int,"cookTime":int,"totalTime":int,"mealPrep":bool,"toTry":true,"season":str|"","tags":[str],"ingredients":[str],"steps":[str],"tips":str}
   - ingredients: eine Zutat pro Eintrag, mit Menge ("400g Kichererbsen (Dose)"). Zutaten, die NICHT im Vorrat sind, bekommen am Ende " 🛒".
   - steps: kurze, nummerierbare Schritte; Zeitangaben als "X Min" schreiben (die App macht daraus Timer).
   - tips: ein String nach der Konvention "Topping: … Swap: … Alltags-Upgrade: …".
4. Vorschläge bevorzugt aus dem Kochbuch (Rotation: zuletzt Gekochtes meiden, wenn bekannt); höchstens 1–2 neue Ideen.`;
}

export function suggestUserPrompt({ isWeekend, extra }) {
  const ctx = isWeekend
    ? "Es ist Wochenende — etwas Aufwendigeres oder ein Experiment ist ok."
    : "Es ist ein Wochentag — schnell und unkompliziert (20–30 Min).";
  return `Was koche ich heute? ${ctx}${extra ? " Wunsch: " + extra : ""} Gib 3–5 Vorschläge als suggestions-JSON.`;
}

export function leftoverUserPrompt(ingredients) {
  return `Reste verwerten: Ich habe ${ingredients}. Was kann ich damit kochen? Bevorzugt Rezepte aus meinem Kochbuch, sonst 1–2 neue Ideen. Gib suggestions-JSON.`;
}

export function generateUserPrompt(wish) {
  return `Erfinde ein neues Rezept für mein Kochbuch: ${wish}. Es darf kein Duplikat eines vorhandenen Rezepts sein. Gib recipe-JSON (vollständig, schema-konform, toTry=true).`;
}

export function elaborateUserPrompt(name) {
  return `Arbeite den Vorschlag "${name}" als vollständiges Rezept aus. Gib recipe-JSON (schema-konform, toTry=true).`;
}

/** Planner-KI-Hook: Wochenplan nach Wunsch anpassen. */
export function planUserPrompt({ wish, plan, lockedDays }) {
  const current = plan.days.map((d) => `${d.day}: ${d.recipeId || "—"}${d.leftoverOf ? " (Reste von " + d.leftoverOf + ")" : ""}`).join("\n");
  return `Passe meinen Wochenplan an. Wunsch: ${wish}
Aktueller Plan:
${current}
Gesperrt (NICHT ändern): ${lockedDays.length ? lockedDays.join(", ") : "keine"}
Regeln: Mo–Fr schnell/alltagstauglich, Sa/So darf aufwendig sein. Nur Rezept-IDs aus meinem Kochbuch verwenden, keine Wiederholung in der Woche, Hauptgerichte (keine Kuchen/Backen/Grundrezepte).
Antworte als JSON: {"type":"plan","days":{"Mo":"r…","Di":"r…","Mi":"r…","Do":"r…","Fr":"r…","Sa":"r…","So":"r…"},"note":"1 Satz"}`;
}
