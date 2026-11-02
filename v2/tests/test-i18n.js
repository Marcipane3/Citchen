// Tests: i18n.js — Key-Parität DE/EN/ES, Interpolation, Plural, Fallback.
import { test, assert, assertEqual } from "./runner.js";
import { t, tn, tCat, tCuisine, tSeason, tLastCooked, setLang, getLang, LANGS, DICT } from "../src/i18n.js";
import { CATEGORIES } from "../src/data/schema.js";

// Sammelt alle Punkt-Pfade eines verschachtelten Objekts (Blätter = Strings).
function leafKeys(obj, prefix = "") {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") out.push(...leafKeys(v, path));
    else out.push(path);
  }
  return out;
}

// Zugriff aufs interne DICT über t() — wir prüfen Parität strukturell, indem
// wir eine repräsentative Key-Liste in allen Sprachen auflösen.
const SAMPLE_KEYS = [
  "common.save", "nav.cookbook", "nav.lager", "cookbook.searchPlaceholder",
  "detail.ingredients", "cooking.overview", "shopping.myList", "planner.newWeek",
  "assistant.title", "capture.title", "lager.stockHeading", "settings.title",
  "guide.title", "errors.nokey", "badge.alltag", "chip.fav",
];

test("Default ist Deutsch", () => {
  assertEqual(getLang(), "de");
});

test("Alle Beispiel-Keys in DE/EN/ES vorhanden (kein Key-Echo)", () => {
  for (const lang of LANGS.map((l) => l.code)) {
    setLang(lang);
    for (const k of SAMPLE_KEYS) {
      const v = t(k);
      assert(v && v !== k, `Key fehlt in ${lang}: ${k}`);
    }
  }
  setLang("de");
});

test("Volle Key-Parität: jede Sprache hat exakt die DE-Keys (kein Loch, kein Extra)", () => {
  const deKeys = leafKeys(DICT.de).sort();
  for (const lang of LANGS.map((l) => l.code)) {
    if (lang === "de") continue;
    const langKeys = leafKeys(DICT[lang]).sort();
    const missing = deKeys.filter((k) => !langKeys.includes(k));
    const extra = langKeys.filter((k) => !deKeys.includes(k));
    assertEqual(missing.length, 0, `${lang} fehlen Keys: ${missing.join(", ")}`);
    assertEqual(extra.length, 0, `${lang} hat Extra-Keys: ${extra.join(", ")}`);
  }
});

test("tCat: DE gibt kanonisch zurück, andere Sprachen übersetzen, Unbekanntes bleibt", () => {
  setLang("de");
  assertEqual(tCat("Pasta & Nudeln"), "Pasta & Nudeln");
  setLang("en");
  assertEqual(tCat("Pasta & Nudeln"), "Pasta & noodles");
  setLang("da");
  assertEqual(tCat("Vegetarische Hauptgerichte"), "Vegetariske hovedretter");
  // Unbekannte/nicht-kanonische Kategorie → unverändert zurück (kein Absturz)
  assertEqual(tCat("Phantasie-Kategorie"), "Phantasie-Kategorie");
  setLang("de");
});

test("tCat: jede der 16 Kategorien ist in EN/ES/DA übersetzt (keine Lücke)", () => {
  for (const lang of ["en", "es", "da"]) {
    setLang(lang);
    for (const c of CATEGORIES) {
      assert(tCat(c) !== c, `Kategorie nicht übersetzt in ${lang}: ${c}`);
    }
  }
  setLang("de");
});

test("Interpolation {n}", () => {
  setLang("de");
  assertEqual(t("cookbook.count_other", { n: 5 }), "5 Rezepte");
  setLang("en");
  assertEqual(t("cookbook.count_other", { n: 5 }), "5 recipes");
  setLang("de");
});

test("tn: Plural one/other", () => {
  setLang("en");
  assertEqual(tn("cookbook.count", 1), "1 recipe");
  assertEqual(tn("cookbook.count", 3), "3 recipes");
  setLang("de");
  assertEqual(tn("cookbook.count", 1), "1 Rezept");
});

test("Fallback auf DE bei fehlendem Key, Key-Echo bei komplett unbekanntem", () => {
  setLang("es");
  // erfundener Key existiert nirgends → Key zurück
  assertEqual(t("nope.nada"), "nope.nada");
  setLang("de");
});

test("setLang ignoriert unbekannte Sprachen", () => {
  setLang("de");
  setLang("xx");
  assertEqual(getLang(), "de");
});

test("tCuisine: DE gibt canonical zurück, andere Sprachen übersetzen, Unbekanntes bleibt", () => {
  setLang("de");
  assertEqual(tCuisine("Italienisch"), "Italienisch");
  setLang("en");
  assertEqual(tCuisine("Italienisch"), "Italian");
  assertEqual(tCuisine("Asiatisch"), "Asian");
  assertEqual(tCuisine("Middle Eastern"), "Middle Eastern");
  setLang("da");
  assertEqual(tCuisine("Mexikanisch"), "Mexicansk");
  assertEqual(tCuisine("Unbekannt"), "Unbekannt");
  setLang("de");
});

test("tSeason: DE gibt canonical zurück, andere Sprachen übersetzen, Unbekanntes bleibt", () => {
  setLang("de");
  assertEqual(tSeason("Sommer"), "Sommer");
  setLang("en");
  assertEqual(tSeason("Sommer"), "Summer");
  assertEqual(tSeason("Herbst"), "Autumn");
  assertEqual(tSeason("Spätsommer"), "Late summer");
  setLang("es");
  assertEqual(tSeason("Winter"), "Invierno");
  assertEqual(tSeason("Unbekannt"), "Unbekannt");
  setLang("de");
});

test("tLastCooked: DE gibt unverändert zurück, andere Sprachen übersetzen Monatsnamen", () => {
  setLang("de");
  assertEqual(tLastCooked("Mai 2026"), "Mai 2026");
  setLang("en");
  assertEqual(tLastCooked("Mai 2026"), "May 2026");
  assertEqual(tLastCooked("Januar 2025"), "January 2025");
  assertEqual(tLastCooked("Dezember 2024"), "December 2024");
  setLang("da");
  assertEqual(tLastCooked("März 2026"), "marts 2026");
  assertEqual(tLastCooked("Juni 2026"), "juni 2026");
  setLang("es");
  assertEqual(tLastCooked("Oktober 2025"), "octubre 2025");
  // Unbekanntes Format bleibt unverändert
  setLang("en");
  assertEqual(tLastCooked("2026-05"), "2026-05");
  assertEqual(tLastCooked(null), null);
  setLang("de");
});

// P8.1 (#26): ehemals hartcodierte deutsche UI-Texte laufen über i18n.
const P81_KEYS = ["form.addRow", "form.saveFailed", "cookbook.newRecipe", "detail.favoriteTitle", "settings.showKey", "export.copied", "export.copyFail"];

test("P8.1: neue Keys in allen 4 Sprachen vorhanden, EN ist englisch", () => {
  for (const lang of LANGS.map((l) => l.code)) {
    setLang(lang);
    for (const k of P81_KEYS) {
      const v = t(k, { e: "x", msg: "x" });
      assert(v && v !== k, `Key fehlt in ${lang}: ${k}`);
    }
  }
  setLang("en");
  assertEqual(t("detail.favoriteTitle"), "Favorite");
  assertEqual(t("settings.showKey"), "show");
  assertEqual(t("cookbook.newRecipe"), "New recipe");
  assertEqual(t("form.addRow"), "+ Add row");
  assertEqual(t("form.saveFailed", { e: "boom" }), "Save failed: boom");
  setLang("de");
  assertEqual(t("detail.favoriteTitle"), "Favorit");
  assertEqual(t("settings.showKey"), "anzeigen");
  assertEqual(t("form.addRow"), "+ Zeile hinzufügen");
});

test("P8.1: keine hartcodierten deutschen Literale mehr in den UI-Dateien", async () => {
  const fs = await import("node:fs");
  const base = new URL("../src/", import.meta.url);
  const checks = [
    ["features/assistant/assistant.js", "Speichern fehlgeschlagen"],
    ["ui/helpers.js", "Zeile hinzufügen"],
    ["features/cookbook/cookbook.js", 'title="Neues Rezept"'],
    ["features/cookbook/detail.js", 'title="Favorit"'],
    ["features/settings/settings.js", 'title="anzeigen"'],
    ["features/cookbook/export.js", "alert(\""],
  ];
  for (const [f, lit] of checks) {
    const src = fs.readFileSync(new URL(f, base), "utf8");
    assert(!src.includes(lit), `${f} enthält noch: ${lit}`);
  }
});
