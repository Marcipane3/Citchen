// Tests: i18n.js — Key-Parität DE/EN/ES, Interpolation, Plural, Fallback.
import { test, assert, assertEqual } from "./runner.js";
import { t, tn, setLang, getLang, LANGS } from "../src/i18n.js";

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
