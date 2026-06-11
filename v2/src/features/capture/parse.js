// parse.js — Capture-Logik (Phase-4-SCAFFOLD, pur & unit-getestet).
// Der eigentliche Vision-Parse ist hinter FLAGS.captureParse deaktiviert.
// Was schon steht: der Entwurfs-Builder (draftFromInput) und die Naht,
// an der später der echte Parse andockt (parseCapture).

import { FLAGS } from "../../flags.js";

export class CaptureDisabledError extends Error {
  constructor() {
    super("Die automatische Bild-/URL-Analyse ist noch deaktiviert (kommt mit einem späteren Update).");
    this.kind = "disabled";
  }
}

/** "shakshuka-mit-feta_2024" → "Shakshuka Mit Feta" */
function nameFromSlug(slug) {
  const words = slug
    .replace(/\.(html?|php|aspx?)$/i, "")
    .split(/[-_+%0-9]+/)
    .filter((w) => w.length > 1);
  if (!words.length) return "";
  return words.map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

/** Rezeptnamen-Vermutung aus einer URL (letztes Pfadsegment, sonst Hostname). */
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

/**
 * Leerer/teilbefüllter Rezept-Entwurf fürs Review-Formular (flaches v3-Schema).
 * Die Quelle (URL/Notiz) wandert schema-sicher in tips — v3 kennt kein source-Feld.
 */
export function draftFromInput({ url = "", note = "" } = {}) {
  const tipsParts = [];
  if (note.trim()) tipsParts.push(note.trim());
  if (url.trim()) tipsParts.push("Quelle: " + url.trim());
  return {
    name: url ? guessNameFromUrl(url) : "",
    category: "Vegetarische Hauptgerichte", // häufigster Fall; im Review änderbar
    time: "",
    servings: "~4",
    effort: "",
    difficulty: "",
    cuisine: "",
    season: "",
    mealPrep: false,
    toTry: true, // erfasst = noch nie gekocht
    image: "",
    ingredients: [],
    steps: [],
    tips: tipsParts.join(" "),
  };
}

/**
 * DIE Naht für den echten Vision-Parse (später):
 * input = { photoBlob?, url?, note? } → Promise<Rezept-Entwurf>.
 * Implementierung dann über ai/client.js (Vision-Content-Block + Bild/URL-Text),
 * Antwort durch ai/parse.coerceRecipe — und IMMER durchs Review-Formular,
 * nie auto-speichern (03_FEATURES §6).
 */
export async function parseCapture(/* input */) {
  if (!FLAGS.captureParse) throw new CaptureDisabledError();
  throw new Error("parseCapture: noch nicht implementiert (Backlog).");
}
