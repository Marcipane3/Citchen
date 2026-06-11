// migrate.js — Verlustfreies Laden/Serialisieren der v3-Sammlung.
// Grundsatz: Das persistierte Format bleibt EXAKT v3-flach (SCHEMA.md).
// "Migration" heißt hier: validieren + v1-kompatible Defaults ergänzen
// (dieselben sechs Felder, die v1.normalize() setzt) — sonst NICHTS ändern.
// Unbekannte Felder werden unverändert durchgereicht (zukunftssicher).

import { SCHEMA_VERSION, validateCollection, withDefaults } from "./schema.js";

/**
 * Lädt eine geparste rezepte.json in das In-Memory-Modell.
 * Gibt { collection: {version, updated, recipes}, report } zurück.
 * - report.errors: harte Validierungsfehler (Sammlung wird trotzdem geladen,
 *   defekte Rezepte werden NICHT verworfen — wir verlieren nie Daten).
 * - report.defaultsAdded: IDs, bei denen v1-Defaults ergänzt wurden.
 */
export function loadCollection(json) {
  const report = { errors: [], defaultsAdded: [] };
  const data = json && typeof json === "object" ? json : { version: SCHEMA_VERSION, recipes: [] };

  const validation = validateCollection(data);
  if (!validation.valid) report.errors = validation.errors;

  const recipes = (Array.isArray(data.recipes) ? data.recipes : []).map((r) => {
    const norm = withDefaults(r);
    // Nur melden, wenn sich wirklich etwas geändert hat
    if (Object.keys(norm).length !== Object.keys(r).length) report.defaultsAdded.push(r.id);
    return norm;
  });

  return {
    collection: {
      version: typeof data.version === "number" ? data.version : SCHEMA_VERSION,
      updated: typeof data.updated === "string" ? data.updated : null,
      recipes,
    },
    report,
  };
}

/**
 * Serialisiert die Sammlung zurück in das v3-Drive-Format.
 * setUpdated=true stempelt updated auf jetzt (wie v1.save()).
 * Es werden KEINE Felder entfernt oder umbenannt — was im Rezept steht, bleibt.
 */
export function serializeCollection(collection, { setUpdated = false, now = () => new Date().toISOString() } = {}) {
  return {
    version: SCHEMA_VERSION,
    updated: setUpdated ? now() : (collection.updated ?? now()),
    recipes: collection.recipes,
  };
}

/** Drive-Dateiinhalt (pretty, 2 Spaces — wie v1 schreibt). */
export function toFileString(collection, opts) {
  return JSON.stringify(serializeCollection(collection, opts), null, 2);
}
