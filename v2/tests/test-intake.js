// Tests: C2 (Erfassungs-Fehlercodes übersetzt), C3 (Koch-Profil + 🛒 in Erfassungs-Prompts),
// D2 (EIN Katalog in data/catalog.js für Einkauf, Lager und Rezept-Zutaten). Rein, kein DOM.
import { test, assert, assertEqual } from "./runner.js";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildCapturePrompt, buildBulkPrompt } from "../src/features/capture/parse.js";
import { buildSystemPrompt, profileBlock, DEFAULT_PROFILE } from "../src/ai/prompts.js";
import { ingMatchCat, itemIcon, ingredientIcons } from "../src/data/catalog.js";
import { DEFAULT_PANTRY } from "../src/features/lager/logic.js";
import { DICT, LANGS } from "../src/i18n.js";

const v2 = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(v2, p), "utf8");
const get = (obj, key) => key.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
const PROFILE = { ...DEFAULT_PROFILE, diet: "Vegan, keine Eier", servings: "~2" };

/* ---------- C3 ---------- */

test("C3: Erfassung mit Vorrat → 🛒-Regel nennt den Vorrat; ohne Vorrat keine Regel", () => {
  const withStock = buildCapturePrompt("aus diesem Bild", { staples: ["Salz", "Reis"] });
  assert(withStock.includes("🛒") && withStock.includes("Salz, Reis"), "🛒-Regel mit Vorrat fehlt");
  const plain = buildCapturePrompt("aus diesem Bild");
  assert(!plain.includes("bekommen am Ende"), "ohne Vorrat keine 🛒-Regel (rückwärtskompatibel)");
});

test("C3: Abschreiben bleibt quelltreu — kein Koch-Profil im Erfassungs-Prompt", () => {
  const p = buildCapturePrompt("von dieser URL", { staples: ["Salz"] });
  assert(p.includes("inhaltlich treu"), "Treue-Regel fehlt");
  assert(!p.includes("KOCH-PROFIL"), "Profil darf eine Vorlage nicht umschreiben");
});

test("C3: KI-Ideen folgen dem Koch-Profil (Ernährung, Portionen); Auslesen nicht", () => {
  const gen = buildBulkPrompt({ generate: true, wish: "Pasta", count: 3, profile: PROFILE, staples: ["Salz"] });
  assert(gen.includes("Vegan, keine Eier") && gen.includes("~2 Portionen"), "Profil fehlt beim Erfinden");
  assert(gen.includes("🛒"), "🛒-Regel fehlt beim Erfinden");
  const extract = buildBulkPrompt({ generate: false, profile: PROFILE, staples: ["Salz"] });
  assert(!extract.includes("KOCH-PROFIL"), "beim Auslesen kein Profil");
  assert(extract.includes("🛒"), "🛒-Regel auch beim Auslesen");
});

test("C3: Assistent und Erfassung nutzen denselben Profil-Block (eine Quelle)", () => {
  const sys = buildSystemPrompt({ recipes: [], staples: [], profile: PROFILE });
  assert(sys.includes(profileBlock(PROFILE)), "System-Prompt baut nicht auf profileBlock()");
});

/* ---------- C2 ---------- */

test("C2: jeder Erfassungs-Fehlercode hat eine Übersetzung in allen Sprachen", () => {
  const src = read("src/features/capture/parse.js");
  const codes = new Set(["disabled", "invalid", ...[...src.matchAll(/CaptureParseError\("(\w+)"/g)].map((m) => m[1])]);
  assert(codes.size >= 5, "Fehlercodes nicht gefunden");
  for (const { code } of LANGS) for (const c of codes) {
    assert(typeof get(DICT[code], "capture.err." + c) === "string", `${code}: capture.err.${c} fehlt`);
  }
});

test("C2: keine fest verdrahteten deutschen Texte mehr in der Sammel-Erfassung", () => {
  const src = read("src/features/capture/capture.js");
  assert(!src.includes('" Zutaten'), "„Zutaten“ hart kodiert");
  assert(!src.includes('" Min"'), "„Min“ hart kodiert");
  assert(src.includes("onSubmit"), "Bearbeiten muss onSubmit nutzen (sonst Doppel-Speichern)");
});

/* ---------- D2 ---------- */

test("D2: Katalog lebt nur in data/catalog.js; niemand importiert den alten Pfad", () => {
  assert(!existsSync(join(v2, "src/features/shopping/catalog.js")), "alter Katalog existiert noch");
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]);
  for (const f of walk(join(v2, "src")).filter((f) => f.endsWith(".js"))) {
    assert(!readFileSync(f, "utf8").includes("shopping/catalog"), "alter Import in " + f);
  }
  for (const f of ["src/features/shopping/shopping.js", "src/features/lager/lager.js", "src/features/cookbook/detail.js", "src/features/cooking/cooking.js"]) {
    assert(read(f).includes("data/catalog.js"), "Konsument nutzt den Katalog nicht: " + f);
  }
});

test("D2: Singular findet Plural-Artikel, längster Treffer gewinnt weiter", () => {
  assertEqual(ingMatchCat("1 Zwiebel, gewürfelt").icon, "🧅");
  assertEqual(ingMatchCat("1 Karotte").cat, "Gemüse");
  assertEqual(ingMatchCat("Saft von 1 Zitrone").icon, "🍋");
  assertEqual(ingMatchCat("400ml Kokosmilch").cat, "Konserven & Vorrat");
  assertEqual(ingMatchCat("2 EL Olivenöl").icon, "🫒");
  assertEqual(ingMatchCat("200g Reis").icon, "🍚");
});

test("D2: jeder Standard-Vorrat (außer „Öl“) bekommt ein Symbol", () => {
  const missing = DEFAULT_PANTRY.filter((p) => p.name !== "Öl" && !itemIcon(p.name)).map((p) => p.name);
  assertEqual(missing.join(", "), "");
});

test("D2: ≥ 95 % der Zutaten der Basis-Rezepte bekommen ein Symbol", () => {
  const snap = JSON.parse(read("data/rezepte.snapshot.json"));
  const all = snap.recipes.flatMap((r) => r.ingredients || []);
  const hit = all.filter((i) => itemIcon(i)).length;
  assert(hit / all.length >= 0.95, `nur ${hit}/${all.length}`);
});

test("D2: ingredientIcons matcht auf Deutsch, zeigt lokalisiert; bei Längen-Abweichung Anzeige", () => {
  assertEqual(ingredientIcons(["2 onions", "salt"], ["2 Zwiebeln", "Salz"]).join(), "🧅,🧂");
  assertEqual(ingredientIcons(["2 Zwiebeln"], ["a", "b"]).join(), "🧅");
  assertEqual(ingredientIcons(["etwas Liebe"]).join(), "");
});
