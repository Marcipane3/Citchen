// router.js — Hash-Router (#/cookbook, #/cook/:id, …). Funktioniert offline
// und auf GitHub-Pages-Unterpfaden ohne Server-Konfiguration.

const routes = []; // { pattern: ["cook", ":id"], handler }
let notFoundHandler = null;
let current = null;

export function register(path, handler) {
  routes.push({ pattern: path.replace(/^#?\//, "").split("/"), handler });
}

export function setNotFound(handler) { notFoundHandler = handler; }

export function navigate(path) {
  const target = path.startsWith("#") ? path : "#/" + path.replace(/^\//, "");
  if (location.hash === target) resolve();
  else location.hash = target;
}

export function currentRoute() { return current; }

function match(segments) {
  for (const r of routes) {
    if (r.pattern.length !== segments.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < r.pattern.length; i++) {
      const p = r.pattern[i];
      if (p.startsWith(":")) params[p.slice(1)] = decodeURIComponent(segments[i]);
      else if (p !== segments[i]) { ok = false; break; }
    }
    if (ok) return { handler: r.handler, params };
  }
  return null;
}

function resolve() {
  const hash = location.hash.replace(/^#\/?/, "");
  const segments = hash === "" ? ["cookbook"] : hash.split("/");
  const hit = match(segments);
  current = { path: "/" + segments.join("/"), segments };
  if (hit) hit.handler(hit.params);
  else if (notFoundHandler) notFoundHandler(segments);
}

export function start() {
  window.addEventListener("hashchange", resolve);
  resolve();
}
