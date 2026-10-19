// fake-google.js — In-Memory-Ersatz für alles, was die App von Google braucht:
//  - Google Identity Services (accounts.google.com/gsi/client) → vergibt sofort ein Token
//    für den Testnutzer der Seite (window.__E2E_USER), kein Popup.
//  - Drive REST v3 (www.googleapis.com) → FakeDrive, EIN Objekt pro Test, das sich mehrere
//    Browser-Kontexte (Geräte / Partner) teilen. Token "e2e-<user>" identifiziert den Nutzer.
//  - Google Picker (apis.google.com/js/api.js) → wählt sofort die erste für den Nutzer
//    freigegebene einkaufsliste.json und erteilt der App Zugriff (wie drive.file + Picker).
// Bildet die drive.file-Regel nach: eine App sieht nur Dateien, die sie selbst angelegt hat
// oder die der Nutzer im Picker geöffnet hat.

export const GIS_SCRIPT = `(() => {
  window.google = window.google || {};
  window.google.accounts = { oauth2: { initTokenClient(cfg) {
    return { requestAccessToken() {
      setTimeout(() => {
        const user = window.__E2E_USER;
        if (!user) { if (cfg.error_callback) cfg.error_callback({ type: "popup_closed" }); return; }
        cfg.callback({ access_token: "e2e-" + user, expires_in: 3600, scope: cfg.scope });
      }, 0);
    } };
  } } };
})();`;

export const GAPI_SCRIPT = `(() => {
  window.gapi = { load(name, opts) { setTimeout(() => (opts.callback || opts)(), 0); } };
  window.google = window.google || {};
  class DocsView { setMimeTypes() { return this; } setOwnedByMe() { return this; } setMode() { return this; } }
  class PickerBuilder {
    setOAuthToken(t) { this.t = t; return this; }
    setAppId() { return this; } addView() { return this; } setDeveloperKey() { return this; }
    setCallback(cb) { this.cb = cb; return this; }
    build() {
      const b = this;
      return { setVisible(v) {
        if (!v) return;
        fetch("https://www.googleapis.com/__e2e/picker", { headers: { Authorization: "Bearer " + b.t } })
          .then((r) => r.json())
          .then((doc) => b.cb(doc && doc.id ? { action: "picked", docs: [doc] } : { action: "cancel" }));
      } };
    }
  }
  window.google.picker = {
    ViewId: { DOCS: "all" }, DocsViewMode: { LIST: "list" },
    Action: { PICKED: "picked", CANCEL: "cancel" }, Response: { DOCUMENTS: "docs" },
    Document: { ID: "id", NAME: "name" }, DocsView, PickerBuilder,
  };
})();`;

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "access-control-expose-headers": "*",
};

function json(route, status, body) {
  return route.fulfill({ status, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify(body) });
}

/** multipart/related|form-data → [{ headers, body }] (Drive-Upload: Metadaten + Inhalt). */
function parseMultipart(buf, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || "");
  if (!m) return [];
  const boundary = "--" + (m[1] || m[2]);
  return buf.toString("utf8").split(boundary).slice(1, -1).map((chunk) => {
    const part = chunk.replace(/^\r\n/, "").replace(/\r\n$/, "");
    const i = part.indexOf("\r\n\r\n");
    return { headers: part.slice(0, i), body: part.slice(i + 4) };
  });
}

export class FakeDrive {
  constructor() {
    this.files = new Map(); // id → { id, name, mimeType, owner, content, createdTime, sharedWith:Set, granted:Set }
    this.seq = 0;
    this.writes = [];       // [{ user, id, name, method }] — für Assertions ("schreibt nur bei Änderung")
    this.latency = 0;       // ms pro Anfrage — simuliert ein langsames Netz (Race-Tests)
    this.pending = 0;       // Anfragen gerade „unterwegs“
  }

  /** Warten, bis keine Drive-Anfrage mehr unterwegs ist (z. B. gebündelte Pushes). */
  async idle({ quietMs = 300, timeout = 10_000 } = {}) {
    const end = Date.now() + timeout;
    let quietSince = Date.now();
    while (Date.now() < end) {
      if (this.pending > 0) quietSince = Date.now();
      else if (Date.now() - quietSince >= quietMs) return;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error("FakeDrive: Anfragen hören nicht auf");
  }

  /* ---------- Test-Helfer (Node-Seite) ---------- */

  /** Dateien eines Namens (optional nur eines Besitzers). */
  find(name, owner) {
    return [...this.files.values()].filter((f) => f.name === name && (!owner || f.owner === owner));
  }
  /** Inhalt als JSON. */
  read(id) { return JSON.parse(this.files.get(id).content); }
  /** Besitzer gibt die Datei in Drive für einen anderen Nutzer frei (wie „Freigeben“ in Drive). */
  share(id, user) { this.files.get(id).sharedWith.add(user); }

  /* ---------- Route-Handler (Browser-Seite) ---------- */

  canAccess(f, user) { return f && (f.owner === user || f.granted.has(user)); }

  async handle(route) {
    this.pending++;
    try {
      if (this.latency) await new Promise((r) => setTimeout(r, this.latency));
      return await this.respond(route);
    } finally {
      this.pending--;
    }
  }

  async respond(route) {
    const req = route.request();
    const method = req.method();
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: { ...CORS, "access-control-allow-headers": req.headers()["access-control-request-headers"] || "*" } });

    const auth = /^Bearer e2e-(.+)$/.exec(req.headers()["authorization"] || "");
    if (!auth) return json(route, 401, { error: { code: 401, message: "Invalid Credentials" } });
    const user = auth[1];
    const url = new URL(req.url());
    const p = url.pathname;

    // Fake-Picker: erste freigegebene einkaufsliste.json, die noch nicht dem Nutzer gehört.
    if (p === "/__e2e/picker") {
      const f = [...this.files.values()].find((x) => x.sharedWith.has(user) && x.owner !== user && /einkaufsliste/.test(x.name));
      if (!f) return json(route, 200, null);
      f.granted.add(user); // drive.file: im Picker geöffnet → App darf lesen/schreiben
      return json(route, 200, { id: f.id, name: f.name });
    }

    // Anlegen (multipart)
    if (method === "POST" && p === "/upload/drive/v3/files") {
      const parts = parseMultipart(await req.postDataBuffer(), req.headers()["content-type"]);
      const meta = JSON.parse(parts[0]?.body || "{}");
      const id = `fake-${++this.seq}`;
      this.files.set(id, {
        id, name: meta.name, mimeType: meta.mimeType, owner: user, content: parts[1]?.body ?? "",
        createdTime: new Date(Date.now() + this.seq).toISOString(), sharedWith: new Set(), granted: new Set(),
      });
      this.writes.push({ user, id, name: meta.name, method });
      return json(route, 200, { id });
    }

    // In-place-Update
    let m = /^\/upload\/drive\/v3\/files\/([^/]+)$/.exec(p);
    if (method === "PATCH" && m) {
      const f = this.files.get(m[1]);
      if (!this.canAccess(f, user)) return json(route, 404, { error: { code: 404, message: "File not found" } });
      f.content = req.postData() || "";
      this.writes.push({ user, id: f.id, name: f.name, method });
      return json(route, 200, { id: f.id });
    }

    // Suche
    if (method === "GET" && p === "/drive/v3/files") {
      const q = url.searchParams.get("q") || "";
      const name = (/name='([^']+)'/.exec(q) || [])[1];
      const mineOnly = /'me' in owners/.test(q);
      const files = [...this.files.values()]
        .filter((f) => (!name || f.name === name) && (mineOnly ? f.owner === user : this.canAccess(f, user)))
        .sort((a, b) => a.createdTime.localeCompare(b.createdTime))
        .map((f) => ({ id: f.id, name: f.name }));
      return json(route, 200, { files });
    }

    m = /^\/drive\/v3\/files\/([^/]+)$/.exec(p);
    if (m) {
      const f = this.files.get(m[1]);
      if (!this.canAccess(f, user)) return json(route, 404, { error: { code: 404, message: "File not found" } });
      if (method === "DELETE") { this.files.delete(f.id); return route.fulfill({ status: 204, headers: CORS }); }
      if (url.searchParams.get("alt") === "media") {
        return route.fulfill({ status: 200, headers: { ...CORS, "content-type": f.mimeType || "application/json" }, body: f.content });
      }
      return json(route, 200, { id: f.id, name: f.name, trashed: false });
    }

    return json(route, 400, { error: { code: 400, message: `FakeDrive: unbekannt ${method} ${p}` } });
  }
}
