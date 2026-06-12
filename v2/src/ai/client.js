// client.js — Einzige Stelle, die die Anthropic-API aufruft (BYOK, direkt
// aus dem Browser; kein SDK, kein Backend). Schlüssel kommt aus gate.js und
// wird ausschließlich als x-api-key-Header an api.anthropic.com gesendet.
// Browser-Direktzugriff erfordert den Header
// "anthropic-dangerous-direct-browser-access: true" (CORS-Opt-in der API).

import { getKey, getModel } from "./gate.js";

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

// Vision-Aufgaben (Foto-/Kühlschrank-Scan) laufen immer auf einem vision-fähigen
// Modell, unabhängig von der Textmodell-Wahl des Nutzers.
export const VISION_MODEL = "claude-sonnet-4-6";
// Server-Tool für URL-Import: Anthropic holt die Seite serverseitig (kein CORS).
export const WEB_FETCH_TOOL = { type: "web_fetch_20260209", name: "web_fetch", max_uses: 3 };

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
 * Eine Messages-Anfrage. messages = [{role, content}], system optional,
 * tools optional (z.B. WEB_FETCH_TOOL). Bei Server-Tools wird pause_turn
 * automatisch fortgesetzt (max. 4 Runden). Gibt den finalen Text zurück.
 */
export async function complete({ system, messages, maxTokens = 4096, model = null, tools = null }) {
  const key = getKey();
  if (!key) throw new AiError("Kein API-Schlüssel hinterlegt (Einstellungen → KI).", "nokey");
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new AiError("Offline — KI braucht eine Internetverbindung.", "offline");
  }

  const convo = messages.slice();
  let data = null;
  for (let round = 0; round < 4; round++) {
    let r;
    try {
      r = await fetch(API_URL, {
        method: "POST",
        headers: headers(key),
        body: JSON.stringify({
          model: model || getModel(),
          max_tokens: maxTokens,
          system: system || undefined,
          messages: convo,
          tools: tools || undefined,
        }),
      });
    } catch (e) {
      throw new AiError("Keine Verbindung zur Anthropic-API (offline oder blockiert).", "offline");
    }
    if (!r.ok) await throwForStatus(r);
    data = await r.json();

    // Server-Tool (web_fetch) hat das Iterationslimit erreicht → fortsetzen.
    if (data.stop_reason === "pause_turn") {
      convo.push({ role: "assistant", content: data.content });
      continue;
    }
    break;
  }

  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  return { text, usage: data.usage || null, stopReason: data.stop_reason };
}

/** Baut einen User-Turn mit Bild-Blöcken + Text (Vision). images = [base64Jpeg]. */
export function visionMessage(images, text) {
  const content = images.map((b64) => ({
    type: "image",
    source: { type: "base64", media_type: "image/jpeg", data: b64 },
  }));
  content.push({ type: "text", text });
  return { role: "user", content };
}

/** Blob → reiner base64-String (ohne data:-Präfix). */
export function blobToBase64(blob) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = rej;
    fr.onload = () => res(String(fr.result).split(",")[1] || "");
    fr.readAsDataURL(blob);
  });
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
