// parse.js — Capture-Logik: Foto/URL → Rezept-Entwurf (flaches v3-Schema).
// Vision (Foto) via claude-sonnet-4-6; URL via web_fetch-Server-Tool (kein CORS).
// Ergebnis läuft IMMER durch coerceRecipe (Schema-Validierung) und dann durchs
// Review-Formular — nie auto-speichern.

import { FLAGS } from "../../flags.js";
import { complete, visionMessage, blobToBase64, VISION_MODEL, WEB_FETCH_TOOL } from "../../ai/client.js";
import { extractJson, coerceRecipe } from "../../ai/parse.js";
import { compressImage } from "../../ui/helpers.js";
import { CATEGORIES } from "../../data/schema.js";

export class CaptureDisabledError extends Error {
  constructor() {
    super("Die automatische Bild-/URL-Analyse ist noch deaktiviert (kommt mit einem späteren Update).");
    this.kind = "disabled";
  }
}
export class CaptureParseError extends Error {
  constructor(msg) { super(msg); this.kind = "parse"; }
}

/** "shakshuka-mit-feta_2024" → "Shakshuka Mit Feta" */
function nameFromSlug(slug) {
  const words = slug.replace(/\.(html?|php|aspx?)$/i, "").split(/[-_+%0-9]+/).filter((w) => w.length > 1);
  if (!words.length) return "";
  return words.map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

/** Rezeptnamen-Vermutung aus einer URL (für den manuellen Fallback). */
export function guessNameFromUrl(url) {
  try {
    const u = new URL(url);
    const segs = u.pathname.split("/").filter(Boolean);
    for (let i = segs.length - 1; i >= 0; i--) {
      const n = nameFromSlug(decodeURIComponent(segs[i]));
      if (n) return n;
    }
    return u.hostname.replace(/^www\./, "");
  } catch (e) {
    return "";
  }
}

/** Leerer/teilbefüllter Entwurf fürs Review-Formular (manueller Pfad). */
export function draftFromInput({ url = "", note = "" } = {}) {
  const tipsParts = [];
  if (note.trim()) tipsParts.push(note.trim());
  if (url.trim()) tipsParts.push("Quelle: " + url.trim());
  return {
    name: url ? guessNameFromUrl(url) : "",
    category: "Vegetarische Hauptgerichte", time: "", servings: "~4",
    effort: "", difficulty: "", cuisine: "", season: "",
    mealPrep: false, toTry: true, image: "",
    ingredients: [], steps: [], tips: tipsParts.join(" "),
  };
}

/** Pur & testbar: der Extraktions-Prompt (flaches v3-Schema, 16 Kategorien). */
export function buildCapturePrompt(sourceHint = "") {
  return `Extrahiere EIN Rezept ${sourceHint} und gib es als GENAU EIN JSON-Objekt zurück (ohne Markdown-Zaun, ohne Text davor/danach), exakt in diesem flachen Schema:
{"name":string,"category":string,"time":"25 Min","servings":"~4","effort":"alltag"|"besonders"|"","difficulty":"einfach"|"mittel"|"aufwändig"|"","cuisine":string,"prepTime":int,"cookTime":int,"totalTime":int,"mealPrep":bool,"toTry":true,"season":string,"tags":[string],"ingredients":[string],"steps":[string],"tips":string}
Regeln:
- "category" MUSS exakt eine von diesen 16 sein: ${CATEGORIES.join(" / ")}
- "ingredients": eine Zutat pro Eintrag, mit Menge ("400g Kichererbsen (Dose)").
- "steps": kurze, nummerierbare Schritte; Zeitangaben als "X Min".
- "tips": ein String (Konvention "Topping: … Swap: … Alltags-Upgrade: …"), darf leer sein.
- Wenn kein Rezept erkennbar ist, gib {"error":"kein Rezept erkennbar"} zurück.
- Antworte auf Deutsch.`;
}

async function runAndCoerce(messages, { tools = null } = {}) {
  const { text } = await complete({ messages, model: VISION_MODEL, maxTokens: 2000, tools });
  const json = extractJson(text);
  if (json && json.error) throw new CaptureParseError(String(json.error));
  const { recipe, errors } = coerceRecipe(json && (json.recipe || json));
  if (!recipe) throw new CaptureParseError(errors.join("; ") || "kein gültiges Rezept erkannt");
  return recipe;
}

/**
 * input = { photoBlob?, url?, note? } → Promise<Rezept-Entwurf (flach v3, ohne id)>.
 * IMMER über das Review-Formular speichern (nie automatisch).
 */
export async function parseCapture(input = {}) {
  if (!FLAGS.captureParse) throw new CaptureDisabledError();

  if (input.photoBlob) {
    const blob = await compressImage(input.photoBlob, 1568, 0.8);
    const b64 = await blobToBase64(blob);
    return runAndCoerce([visionMessage([b64], buildCapturePrompt("aus diesem Bild"))]);
  }
  if (input.url) {
    const prompt = `${buildCapturePrompt("von dieser URL")}\nURL: ${input.url}\nNutze das web_fetch-Werkzeug, um die Seite zu lesen.`;
    return runAndCoerce([{ role: "user", content: prompt }], { tools: [WEB_FETCH_TOOL] });
  }
  throw new CaptureParseError("Kein Foto und keine URL angegeben.");
}
