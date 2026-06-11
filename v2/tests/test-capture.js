// Tests: capture/parse.js — Scaffold-Vertrag (Phase 4).
// Flag ist AUS, der Parse wirft kontrolliert, der Entwurfs-Builder liefert
// schema-kompatible Drafts für das Review-Formular.
import { test, assert, assertEqual } from "./runner.js";
import { FLAGS } from "../src/flags.js";
import { parseCapture, draftFromInput, guessNameFromUrl, CaptureDisabledError } from "../src/features/capture/parse.js";
import { validateRecipe } from "../src/data/schema.js";

test("Scaffold-Vertrag: captureParse-Flag ist AUS", () => {
  assertEqual(FLAGS.captureParse, false);
});

test("parseCapture: wirft CaptureDisabledError solange das Flag aus ist", async () => {
  let err = null;
  try { await parseCapture({ url: "https://example.com/x" }); } catch (e) { err = e; }
  assert(err instanceof CaptureDisabledError, "erwartet CaptureDisabledError");
  assertEqual(err.kind, "disabled");
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
  assertEqual(d.servings, "~4");
});

test("draftFromInput: leer → leerer, aber kategoriegültiger Entwurf", () => {
  const d = draftFromInput({});
  assertEqual(d.name, "");
  assertEqual(d.tips, "");
  // Mit Name + Dummy-id muss der Entwurf das Schema bestehen (Review-Formular-Pfad)
  const v = validateRecipe({ ...d, id: "r0", name: "Test" });
  assert(v.valid, v.errors.join("; "));
});

test("draftFromInput: Notiz landet in tips (schema-sicher, kein neues Feld)", () => {
  const d = draftFromInput({ note: "Foto: seite-42.jpg", url: "https://x.de/a-b" });
  assert(d.tips.startsWith("Foto: seite-42.jpg"));
  assert(d.tips.includes("Quelle: https://x.de/a-b"));
  assertEqual(Object.keys(d).some((k) => k === "source" || k === "sourceUrl"), false, "kein Nicht-Schema-Feld");
});
