// fake-anthropic.js — Ersatz für api.anthropic.com (BYOK). Kein echter Key, keine Kosten.
// Tests legen die nächste Antwort per `reply(text)` fest; jede Anfrage wird mitgeschnitten,
// damit Tests prüfen können, WAS die App sendet (Header, Modell, Prompt).

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

export class FakeAnthropic {
  constructor() {
    this.requests = [];  // [{ url, headers, body }]
    this.queue = [];     // Antwort-Texte (FIFO); leer → `fallback`
    this.fallback = '{"error":"kein Rezept erkennbar"}';
  }

  /** Nächste Antwort: Text (z.B. JSON.stringify(recipe)) oder { status, error } für Fehler. */
  reply(textOrError) { this.queue.push(textOrError); }

  async handle(route) {
    const req = route.request();
    if (req.method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: { ...CORS, "access-control-allow-headers": req.headers()["access-control-request-headers"] || "*" } });
    }
    const body = req.postData() ? JSON.parse(req.postData()) : null;
    this.requests.push({ url: req.url(), headers: req.headers(), body });

    const next = this.queue.length ? this.queue.shift() : this.fallback;
    if (next && typeof next === "object") {
      return route.fulfill({
        status: next.status, headers: { ...CORS, "content-type": "application/json" },
        body: JSON.stringify({ type: "error", error: { type: "api_error", message: next.error || "fake error" } }),
      });
    }
    return route.fulfill({
      status: 200,
      headers: { ...CORS, "content-type": "application/json" },
      body: JSON.stringify({
        id: "msg_e2e", type: "message", role: "assistant", model: body?.model || "fake",
        content: [{ type: "text", text: next }],
        stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 10 },
      }),
    });
  }
}
