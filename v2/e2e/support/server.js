// server.js — Mini-Static-Server für die E2E-Tests (keine Abhängigkeiten).
// Dient das Repo-Root aus, damit die App wie auf GitHub Pages unter /v2/ läuft.
// `setRoot(dir)` tauscht das ausgelieferte Verzeichnis zur Laufzeit — so simuliert der
// Update-Test einen Deploy (gleiche Origin, erst alter Build, dann neuer).
// Cache-Control: no-cache, damit Tests nicht von HTTP-Heuristiken abhängen (Pages: max-age=600).
//
// CLI: node support/server.js [--port 4173] [--root <dir>]

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".md": "text/markdown; charset=utf-8",
};

/** Startet den Server. Gibt { url, port, setRoot, setDown, stats, close } zurück. port 0 = freier Port.
 *  onRequest(method, path, down) sieht jede Anfrage (z. B. um „offline“ zu beweisen). */
export async function startServer({ port = 0, root = REPO_ROOT, host = "127.0.0.1", onRequest = null } = {}) {
  let base = resolve(root);
  let down = false; // „Netz weg“: Verbindungen werden sofort gekappt (wirkt auch auf Service-Worker-Fetches)
  const stats = { served: 0, refused: 0 };

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://x");
      if (onRequest) onRequest(req.method, url.pathname, down);
      if (down) { stats.refused++; req.socket.destroy(); return; }
      stats.served++;
      let path = decodeURIComponent(url.pathname);
      const abs = normalize(join(base, path));
      if (abs !== base && !abs.startsWith(base + sep)) { res.writeHead(403).end(); return; }

      let file = abs;
      let st = await stat(file).catch(() => null);
      if (st && st.isDirectory()) {
        if (!path.endsWith("/")) { res.writeHead(301, { Location: path + "/" + url.search }).end(); return; }
        file = join(file, "index.html");
        st = await stat(file).catch(() => null);
      }
      if (!st || !st.isFile()) { res.writeHead(404, { "Content-Type": "text/plain" }).end("not found"); return; }

      const body = await readFile(file);
      res.writeHead(200, {
        "Content-Type": MIME[extname(file).toLowerCase()] || "application/octet-stream",
        "Cache-Control": "no-cache",
      });
      res.end(req.method === "HEAD" ? undefined : body);
    } catch (e) {
      res.writeHead(500, { "Content-Type": "text/plain" }).end(String(e));
    }
  });

  await new Promise((ok, fail) => { server.once("error", fail); server.listen(port, host, ok); });
  const actual = server.address().port;
  return {
    port: actual,
    url: `http://${host}:${actual}`,
    setRoot(dir) { base = resolve(dir); },
    setDown(v) { down = !!v; },
    stats,
    close: () => new Promise((ok) => { server.closeAllConnections?.(); server.close(() => ok()); }),
  };
}

// Direkt gestartet (Playwright webServer / `npm run serve`)
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (name, def) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : def; };
  const s = await startServer({ port: Number(arg("--port", 4173)), root: arg("--root", REPO_ROOT) });
  console.log(`Koch E2E server: ${s.url}/v2/  (root ${arg("--root", REPO_ROOT)})`);
}
