// client.js — Einzige Stelle, die die Anthropic-API aufruft (BYOK, direkt
// aus dem Browser; kein SDK, kein Backend). Schlüssel kommt aus gate.js und
// wird ausschließlich als x-api-key-Header an api.anthropic.com gesendet.
// Browser-Direktzugriff erfordert den Header
// "anthropic-dangerous-direct-browser-access: true" (CORS-Opt-in der API).

import { getKey, getModel } from "./gate.js";

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

export class AiError extends Error {
  constructor(msg, kind) { super(msg); this.kind = kind; } // "nokey"|"offline"|"auth"|"ratelimit"|"overloaded"|"api"
}

function headers(key) {
  return {
    "Content-Type": "application/json",
    "x-api-key": key,
    "anthropic-version": API_VERSION,
    "anthropic-dangerous-direct-browser-access": "true",
  };
}

async function throwForStatus(r) {
  let detail = "";
  try { detail = (await r.json())?.error?.message || ""; } catch (e) { /* egal */ }
  if (r.status === 401) throw new AiError("API-Schlüssel ungültig oder widerrufen. Prüfe ihn in den Einstellungen.", "auth");
  if (r.status === 429) throw new AiError("Rate-Limit erreicht — kurz warten und nochmal versuchen.", "ratelimit");
  if (r.status === 529) throw new AiError("Anthropic-API gerade überlastet — gleich nochmal versuchen.", "overloaded");
  throw new AiError(`API-Fehler ${r.status}${detail ? ": " + detail : ""}`, "api");
}

/**
 * Eine Messages-Anfrage. messages = [{role, content}], system optional.
 * Gibt den Text der Antwort zurück (erste Text-Blöcke zusammengefügt).
 */
export async function complete({ system, messages, maxTokens = 4096, model = null }) {
  const key = getKey();
  if (!key) throw new AiError("Kein API-Schlüssel hinterlegt (Einstellungen → KI).", "nokey");
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new AiError("Offline — KI braucht eine Internetverbindung.", "offline");
  }

  let r;
  try {
    r = await fetch(API_URL, {
      method: "POST",
      headers: headers(key),
      body: JSON.stringify({
        model: model || getModel(),
        max_tokens: maxTokens,
        system: system || undefined,
        messages,
      }),
    });
  } catch (e) {
    throw new AiError("Keine Verbindung zur Anthropic-API (offline oder blockiert).", "offline");
  }
  if (!r.ok) await throwForStatus(r);

  const data = await r.json();
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  return { text, usage: data.usage || null, stopReason: data.stop_reason };
}

/**
 * Schlüssel testen + Modellfähigkeiten prüfen (Models-API).
 * Gibt { ok, vision } zurück oder wirft AiError.
 */
export async function testKey(key, modelId) {
  let r;
  try {
    r = await fetch(`https://api.anthropic.com/v1/models/${encodeURIComponent(modelId || getModel())}`, {
      headers: headers(key || getKey()),
    });
  } catch (e) {
    throw new AiError("Keine Verbindung zur Anthropic-API.", "offline");
  }
  if (!r.ok) await throwForStatus(r);
  const m = await r.json();
  const vision = !!(m.capabilities && m.capabilities.image_input && m.capabilities.image_input.supported);
  return { ok: true, vision, displayName: m.display_name || m.id };
}
