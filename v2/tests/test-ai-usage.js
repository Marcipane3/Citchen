// Tests: v2.16 — KI-Aufräumen. Q1 Modell-IDs an einer Stelle (Risiko R9), Q2 Prompt-Cache für den
// Assistenten, Q3 echter Token-Verbrauch pro Aktion. Ohne Netz: fetch wird pro Test ersetzt.
// Die Ansicht (Einstellungen → Verbrauch) und den echten Request-Weg prüft e2e 04.
import { test, assert, assertEqual, assertDeepEqual } from "./runner.js";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import * as gate from "../src/ai/gate.js";
import { CHAT_MODELS, DEFAULT_CHAT_MODEL, TASKS, VISION_MODEL, PRICES, FALLBACK_BETA } from "../src/ai/models.js";
import { buildRequest, complete, AiError } from "../src/ai/client.js";
import { normalizeUsage, addUsage, costOf, recordUsage, getUsageLog, clearUsage, summarizeUsage, MAX_ENTRIES } from "../src/ai/usage.js";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

/* ---------- Q1: eine Konfiguration ---------- */

test("Q1: Erfassung + Kühlschrank auf Sonnet 5.5 mit wenig Denkaufwand; jedes Modell hat einen Preis", () => {
  assertEqual(TASKS.capture.model, "claude-sonnet-5-5");
  assertEqual(TASKS.fridge.model, "claude-sonnet-5-5");
  assertEqual(VISION_MODEL, TASKS.capture.model);
  for (const t of Object.values(TASKS)) {
    assertEqual(t.effort, "low");
    assert(t.maxTokens >= 4000, "Denken zählt ins Limit → nicht zu knapp");
  }
  assert(CHAT_MODELS.some((m) => m.id === DEFAULT_CHAT_MODEL));
  for (const id of [...CHAT_MODELS.map((m) => m.id), ...Object.values(TASKS).map((t) => t.model)]) {
    assert(PRICES[id], `Preis fehlt für ${id}`);
  }
  assertEqual(gate.MODELS, CHAT_MODELS, "gate liest die Liste aus models.js");
});

test("Q1 / R9: keine Modell-ID außerhalb von ai/models.js (ein Wechsel = eine Datei)", () => {
  const files = [];
  const walk = (d) => readdirSync(d).forEach((f) => {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p); else if (p.endsWith(".js")) files.push(p);
  });
  walk(SRC);
  const hits = files
    .filter((p) => relative(SRC, p) !== join("ai", "models.js"))
    .filter((p) => /claude-(haiku|sonnet|opus|fable)-\d/.test(readFileSync(p, "utf8")))
    .map((p) => relative(SRC, p));
  assertDeepEqual(hits, []);
});

/* ---------- Anfrage-Body (Q1 + Q2) ---------- */

test("buildRequest: Aufgabe „capture“ → Sonnet 5.5, effort low, Fallback mit Beta-Header", () => {
  const { body, beta } = buildRequest({ messages: [{ role: "user", content: "x" }], task: "capture", maxTokens: 50 });
  assertEqual(body.model, "claude-sonnet-5-5");
  assertEqual(body.max_tokens, TASKS.capture.maxTokens, "Aufgabe gewinnt gegen maxTokens des Aufrufers");
  assertDeepEqual(body.output_config, { effort: "low" });
  assertEqual(body.fallbacks, "default");
  assertEqual(beta, FALLBACK_BETA);
  assert(!("thinking" in body), "kein thinking-Feld: disabled wäre auf Sonnet 5.5 ein 400");
});

test("buildRequest: ohne Aufgabe → gewähltes Textmodell, kein effort/fallback (Haiku 4.5 kennt beides nicht)", () => {
  gate.setModel("claude-sonnet-4-6");
  const { body, beta } = buildRequest({ system: "S", messages: [], maxTokens: 4000 });
  assertEqual(body.model, "claude-sonnet-4-6");
  assertEqual(body.max_tokens, 4000);
  assertEqual(body.system, "S", "ohne cacheSystem bleibt der System-Prompt ein String");
  assert(!("output_config" in body) && !("fallbacks" in body));
  assertEqual(beta, "");
  gate.setModel(DEFAULT_CHAT_MODEL);
  assertEqual(buildRequest({ messages: [] }).body.model, DEFAULT_CHAT_MODEL);
});

test("Q2: cacheSystem → System-Prompt als EIN Block mit cache_control (ephemeral)", () => {
  const { body } = buildRequest({ system: "Profil + Vorrat + Kochbuch", messages: [], cacheSystem: true });
  assertDeepEqual(body.system, [{ type: "text", text: "Profil + Vorrat + Kochbuch", cache_control: { type: "ephemeral" } }]);
  assertEqual(buildRequest({ messages: [], cacheSystem: true }).body.system, undefined, "ohne System-Prompt nichts zu cachen");
});

test("buildRequest: unbekannte Aufgabe ist ein Programmierfehler", () => {
  let err = null;
  try { buildRequest({ messages: [], task: "gibtsnicht" }); } catch (e) { err = e; }
  assert(err && /gibtsnicht/.test(err.message));
});

/* ---------- Q3: Verbrauch ---------- */

test("Q3: normalizeUsage — fehlende Felder = 0, Cache + web_fetch werden mitgezählt", () => {
  assertDeepEqual(normalizeUsage(null), { in: 0, out: 0, cr: 0, cw: 0, wf: 0 });
  assertDeepEqual(normalizeUsage({ input_tokens: 12, output_tokens: 3 }), { in: 12, out: 3, cr: 0, cw: 0, wf: 0 });
  assertDeepEqual(
    normalizeUsage({ input_tokens: 5, output_tokens: 7, cache_read_input_tokens: 4000, cache_creation_input_tokens: 0, server_tool_use: { web_fetch_requests: 2 } }),
    { in: 5, out: 7, cr: 4000, cw: 0, wf: 2 });
  assertDeepEqual(normalizeUsage({ input_tokens: -3, output_tokens: "9" }), { in: 0, out: 0, cr: 0, cw: 0, wf: 0 }, "Unsinn → 0");
  assertDeepEqual(addUsage({ in: 1, out: 2, cr: 3, cw: 4, wf: 5 }, { in: 10, out: 20, cr: 30, cw: 40, wf: 50 }), { in: 11, out: 22, cr: 33, cw: 44, wf: 55 });
});

test("Q3: costOf — Listenpreis inkl. Cache-Schreiben/-Lesen; unbekanntes Modell → null", () => {
  // Haiku 4.5: 1 Mio rein ($1) + 1 Mio raus ($5) + 1 Mio Cache gelesen ($0.10) + 1 Mio geschrieben ($1.25)
  const c = costOf("claude-haiku-4-5", { in: 1e6, out: 1e6, cr: 1e6, cw: 1e6, wf: 0 });
  assert(Math.abs(c - 7.35) < 1e-9, String(c));
  assert(Math.abs(costOf("claude-sonnet-5-5", { in: 2500, out: 800, cr: 0, cw: 0, wf: 0 }) - 0.013) < 1e-9);
  assertEqual(costOf("gpt-9000", { in: 1, out: 1, cr: 0, cw: 0, wf: 0 }), null);
});

test("Q3: summarizeUsage — pro Aktion, meiste Aufrufe zuerst; Ø-Eingabe zählt den Cache-Anteil mit", () => {
  const log = [
    { t: "2026-10-26T10:00:00Z", a: "assistant", m: "claude-haiku-4-5", in: 5000, out: 400, cr: 0, cw: 0, wf: 0 },
    { t: "2026-10-26T10:01:00Z", a: "assistant", m: "claude-haiku-4-5", in: 100, out: 600, cr: 4900, cw: 0, wf: 0 },
    { t: "2026-10-26T10:02:00Z", a: "capture.url", m: "claude-sonnet-5-5", in: 15000, out: 800, cr: 0, cw: 0, wf: 1 },
    { t: "2026-10-26T10:03:00Z", a: "other", m: "unbekannt", in: 10, out: 10 },
  ];
  const s = summarizeUsage(log);
  assertDeepEqual(s.rows.map((r) => r.action), ["assistant", "capture.url", "other"]);
  const a = s.rows[0];
  assertEqual(a.calls, 2);
  assertEqual(a.avgIn, 5000, "(5000 + 100 + 4900) / 2");
  assertEqual(a.avgOut, 500);
  assertEqual(a.cr, 4900);
  assertEqual(s.rows[2].unpriced, 1);
  assertEqual(s.rows[2].cost, 0);
  assertEqual(s.total.calls, 4);
  assertEqual(s.total.wf, 1);
  assertEqual(s.since, "2026-10-26T10:00:00Z");
  assertDeepEqual(summarizeUsage([]).total.calls, 0);
});

test("Q3: Protokoll — nur Zahlen, älteste fallen nach MAX_ENTRIES raus, Zurücksetzen leert", () => {
  clearUsage();
  const e = recordUsage({ action: "planner", model: "claude-haiku-4-5", usage: { in: 1, out: 2, cr: 0, cw: 0, wf: 0 }, now: "2026-10-26T00:00:00Z" });
  assertDeepEqual(e, { t: "2026-10-26T00:00:00Z", a: "planner", m: "claude-haiku-4-5", in: 1, out: 2, cr: 0, cw: 0, wf: 0 });
  for (let i = 0; i < MAX_ENTRIES + 5; i++) recordUsage({ action: "assistant", model: "claude-haiku-4-5", usage: normalizeUsage({ input_tokens: i }) });
  const log = getUsageLog();
  assertEqual(log.length, MAX_ENTRIES);
  assertEqual(log[0].a, "assistant", "der erste (planner) ist rausgefallen");
  assertEqual(log[log.length - 1].in, MAX_ENTRIES + 4);
  clearUsage();
  assertDeepEqual(getUsageLog(), []);
});

/* ---------- complete(): Runden summieren, protokollieren, Ablehnung ---------- */

async function withFetch(responses, fn) {
  const prev = globalThis.fetch;
  const sent = [];
  globalThis.fetch = async (url, init) => {
    sent.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    const data = responses.shift();
    return { ok: true, status: 200, json: async () => data };
  };
  gate.setKey("sk-ant-test-usage");
  clearUsage();
  try { return await fn(sent); } finally { globalThis.fetch = prev; gate.clearKey(); clearUsage(); }
}

test("Q3: complete — Verbrauch aller pause_turn-Runden wird summiert und EINMAL mit Aktion protokolliert", async () => {
  await withFetch([
    { model: "claude-sonnet-5-5", stop_reason: "pause_turn", content: [{ type: "thinking", thinking: "" }, { type: "server_tool_use", id: "s1", name: "web_fetch", input: {} }], usage: { input_tokens: 3000, output_tokens: 100, server_tool_use: { web_fetch_requests: 1 } } },
    { model: "claude-sonnet-5-5", stop_reason: "end_turn", content: [{ type: "thinking", thinking: "" }, { type: "text", text: '{"name":"X"}' }], usage: { input_tokens: 9000, output_tokens: 700 } },
  ], async (sent) => {
    const res = await complete({ messages: [{ role: "user", content: "URL" }], task: "capture", action: "capture.url" });
    assertEqual(res.text, '{"name":"X"}', "Text nach Block-Typ gelesen, leere thinking-Blöcke ignoriert");
    assertDeepEqual(res.usage, { in: 12000, out: 800, cr: 0, cw: 0, wf: 1 });
    assertEqual(sent.length, 2);
    assertEqual(sent[0].headers["anthropic-beta"], FALLBACK_BETA);
    assertEqual(sent[1].body.messages.length, 2, "Runde 2 schickt die Assistenten-Blöcke unverändert zurück");
    assertEqual(sent[1].body.messages[1].content[0].type, "thinking");
    const log = getUsageLog();
    assertEqual(log.length, 1);
    assertEqual(log[0].a, "capture.url");
    assertEqual(log[0].m, "claude-sonnet-5-5");
    assertEqual(log[0].in, 12000);
  });
});

test("Q3: complete — bei Fallback zählt das antwortende Modell; ohne action → „other“", async () => {
  await withFetch([
    { model: "claude-sonnet-5", stop_reason: "end_turn", content: [{ type: "text", text: "ok" }], usage: { input_tokens: 10, output_tokens: 5 } },
  ], async () => {
    await complete({ messages: [{ role: "user", content: "x" }], task: "fridge" });
    const [e] = getUsageLog();
    assertEqual(e.m, "claude-sonnet-5");
    assertEqual(e.a, "other");
  });
});

test("complete: Ablehnung (stop_reason refusal) → AiError „refusal“, Verbrauch trotzdem protokolliert", async () => {
  await withFetch([
    { model: "claude-sonnet-5-5", stop_reason: "refusal", stop_details: { type: "refusal", category: "general_harms" }, content: [], usage: { input_tokens: 50, output_tokens: 0 } },
  ], async () => {
    let err = null;
    try { await complete({ messages: [{ role: "user", content: "x" }], task: "capture", action: "capture.photo" }); } catch (e) { err = e; }
    assert(err instanceof AiError, "AiError erwartet");
    assertEqual(err.kind, "refusal");
    assertEqual(getUsageLog()[0].a, "capture.photo");
  });
});

test("Q2: complete — Assistent sendet den System-Prompt mit cache_control, Cache-Lesen landet im Protokoll", async () => {
  await withFetch([
    { model: "claude-haiku-4-5", stop_reason: "end_turn", content: [{ type: "text", text: "{}" }], usage: { input_tokens: 40, output_tokens: 20, cache_read_input_tokens: 4800 } },
  ], async (sent) => {
    await complete({ system: "SYS", messages: [{ role: "user", content: "Hallo" }], cacheSystem: true, action: "assistant" });
    assertEqual(sent[0].body.system[0].cache_control.type, "ephemeral");
    assert(!sent[0].headers["anthropic-beta"], "Textmodell: kein Beta-Header");
    assertEqual(getUsageLog()[0].cr, 4800);
  });
});
