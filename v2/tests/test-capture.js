// Tests: capture/parse.js — pure Helfer (guessNameFromUrl, draftFromInput,
// buildCapturePrompt). Der echte parseCapture-Pfad braucht Netz/Browser → hier
// nur die reinen Bausteine.
import { test, assert, assertEqual } from "./runner.js";
import { FLAGS } from "../src/flags.js";
import { guessNameFromUrl, draftFromInput, buildCapturePrompt } from "../src/features/capture/parse.js";
import { validateRecipe, CATEGORIES } from "../src/data/schema.js";

test("captureParse-Flag ist jetzt aktiv", () => {
  assertEqual(FLAGS.captureParse, true);
});

test("guessNameFromUrl: Slug → Titel, Fallback Hostname", () => {
  assertEqual(guessNameFromUrl("https://kochbar.de/rezepte/shakshuka-mit-feta"), "Shakshuka Mit Feta");
  assertEqual(guessNameFromUrl("https://example.com/r/linsen_dal_2024.html"), "Linsen Dal");
  assertEqual(guessNameFromUrl("https://www.chefkoch.de/"), "chefkoch.de");
  assertEqual(guessNameFromUrl("kein-url"), "");
});

test("draftFromInput: URL → Namensvermutung + Quelle in tips, toTry=true", () => {
  const d = draftFromInput({ url: "https://example.com/rezepte/ofen-feta-pasta" });
  assertEqual(d.name, "Ofen Feta Pasta");
  assert(d.tips.includes("Quelle: https://example.com/rezepte/ofen-feta-pasta"));
  assertEqual(d.toTry, true);
});

test("draftFromInput: leer → kategoriegültiger Entwurf", () => {
  const d = draftFromInput({});
  const v = validateRecipe({ ...d, id: "r0", name: "Test" });
  assert(v.valid, v.errors.join("; "));
});

test("buildCapturePrompt: nennt die 16 Kategorien + flaches JSON-Schema", () => {
  const p = buildCapturePrompt("aus diesem Bild");
  assert(p.includes("aus diesem Bild"));
  assert(p.includes('"category"'));
  assert(p.includes('"ingredients"'));
  for (const c of CATEGORIES) assert(p.includes(c), `Kategorie fehlt im Prompt: ${c}`);
  assert(p.includes("web") === false || p.includes("JSON"), "JSON-Anweisung vorhanden");
});
