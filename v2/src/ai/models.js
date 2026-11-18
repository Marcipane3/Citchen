// models.js — v2.16 (Q1, Risiko R9): ALLE Modell-IDs und Preise an EINER Stelle.
// Ein Modellwechsel (Abkündigung, neues Modell) ändert nur diese Datei — test-ai.js prüft,
// dass sonst nirgends in src/ eine "claude-…"-ID steht. Pur, ohne Imports (Node-testbar).
// Nach jedem Wechsel des Erfassungs-Modells: Capture-Check mit 10 echten Fotos/URLs (ROADMAP-V2 Q1).

/**
 * Textmodelle, die der Nutzer in den Einstellungen wählt (Assistent, Wochenplan, Text/Ideen).
 * - effort: explizit setzen (Default der API kann sich ändern).
 * - maxTokens: Boden für Chat-Aufrufe. Denken ist bei den 5.5-Modellen an und zählt ins Limit —
 *   ein kleineres Limit des Aufrufers wird darauf angehoben (client.buildRequest).
 * - fallback: nur Sonnet 5.5. Haiku 5.5 kennt keinen serverseitigen Fallback (wäre ein 400).
 */
export const CHAT_MODELS = Object.freeze([
  Object.freeze({ id: "claude-haiku-5-5", label: "Haiku 5.5 — schnell & günstig (Standard)", tier: "haiku", effort: "medium", maxTokens: 8000, fallback: false }),
  Object.freeze({ id: "claude-sonnet-5-5", label: "Sonnet 5.5 — stärker", tier: "sonnet", effort: "medium", maxTokens: 8000, fallback: true }),
]);
export const DEFAULT_CHAT_MODEL = "claude-haiku-5-5";

/** #79: frühere Textmodell-Wahl → Nachfolger (gespeicherte Wahl bleibt beim Wechsel erhalten). */
export const CHAT_MODEL_SUCCESSORS = Object.freeze({
  "claude-haiku-4-5": "claude-haiku-5-5",
  "claude-sonnet-4-6": "claude-sonnet-5-5",
});

/**
 * Feste Aufgaben mit eigenem Modell — unabhängig von der Textmodell-Wahl.
 * - effort "low": Auslesen/Erkennen ist Extraktion, kein Nachdenken nötig (spart Tokens + Zeit).
 * - maxTokens: Denken zählt bei Sonnet 5.5 mit ins Limit → großzügiger als die Antwort selbst.
 * - fallback: bei einer Sicherheits-Ablehnung versucht die API serverseitig ein anderes Modell.
 */
export const TASKS = Object.freeze({
  capture: Object.freeze({ model: "claude-sonnet-5-5", effort: "low", maxTokens: 8000, fallback: true }),  // Rezept aus Foto/URL
  fridge: Object.freeze({ model: "claude-sonnet-5-5", effort: "low", maxTokens: 4000, fallback: true }),   // Kühlschrank-Foto
});

/** Vision-Modell (Anzeige in der Erfassung). */
export const VISION_MODEL = TASKS.capture.model;

/** Beta-Header für den serverseitigen Fallback (nur Claude-API, nur mit `fallbacks: "default"`). */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/**
 * Listenpreise in US-$ pro 1 Mio. Tokens (Stand 6. Okt. 2026). Nur für die Verbrauchsanzeige —
 * eine Schätzung, keine Abrechnung. cacheWrite = 5-Minuten-Cache (1,25 × input), cacheRead = 0,1 × input.
 * Haiku 5.5: Preis für Prompts bis 100K Tokens; darüber $0.50 / $2.50 (hier nicht abgebildet).
 * Die 4.x-Preise bleiben, damit ältere Einträge im Verbrauchsprotokoll ihren Preis behalten.
 */
export const PRICES = Object.freeze({
  "claude-haiku-5-5": Object.freeze({ input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 }),
  "claude-haiku-4-5": Object.freeze({ input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 }),
  "claude-sonnet-4-6": Object.freeze({ input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 }),
  "claude-sonnet-5-5": Object.freeze({ input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 }),
  "claude-sonnet-5": Object.freeze({ input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 }),  // Ziel des Fallbacks
});
