// drive.js — Google-Auth (GIS) + Drive-Datei-I/O. Einzige Stelle mit Google-APIs.
// Regeln (SCHEMA.md / 01_ARCHITECTURE §5):
//  - Scope drive.file, bestehende rezepte.json wird IN PLACE aktualisiert (PATCH).
//  - Bekannte Datei-ID zuerst, Namenssuche als Fallback. NIE Duplikate anlegen,
//    außer es existiert wirklich keine Datei (Erstlauf eines neuen Kontos).
//  - Anmeldung ist OPTIONAL: ohne Token läuft die App rein lokal weiter.

const GOOGLE_CLIENT_ID = "977952120262-lht1tbbinnj8kmehmvqe1dpu5gp7k8d8.apps.googleusercontent.com";
const SCOPE = "https://www.googleapis.com/auth/drive.file";
const FILE_NAME = "rezepte.json";
export const KNOWN_FILE_ID = "1t6KRviicPspYVj9oFjsUTJ6n8kZLHP1y";
const TOKEN_KEY = "kochv2_token";
const CONNECTED_KEY = "kochv2_connected"; // Gerät war schon mal verbunden → lautlose Erneuerung ok

let TOKEN = null;
let tokenClient = null;
let gisLoaded = null;
const listeners = new Set();

export function onAuthChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { for (const fn of listeners) fn(isSignedIn()); }

export function isSignedIn() { return !!TOKEN; }

/* ---------- Token-Persistenz (v1-Parität: kurzlebiges Access-Token + Ablauf) ---------- */

function saveToken(resp) {
  TOKEN = resp.access_token;
  const ttl = (resp.expires_in ? resp.expires_in * 1000 : 3600000) - 60000; // 60s Puffer
  try {
    localStorage.setItem(TOKEN_KEY, JSON.stringify({ t: TOKEN, e: Date.now() + ttl }));
    localStorage.setItem(CONNECTED_KEY, "1");
  } catch (e) { /* egal */ }
  emit();
}

function wasConnectedBefore() {
  try { return localStorage.getItem(CONNECTED_KEY) === "1"; } catch (e) { return false; }
}

function loadStoredToken() {
  try {
    const s = JSON.parse(localStorage.getItem(TOKEN_KEY) || "null");
    if (s && s.t && s.e > Date.now()) { TOKEN = s.t; return true; }
  } catch (e) { /* egal */ }
  return false;
}

export function clearToken() {
  TOKEN = null;
  try { localStorage.removeItem(TOKEN_KEY); } catch (e) { /* egal */ }
  emit();
}

/** Bewusst trennen (Settings): Token weg + keine lautlosen Erneuerungen mehr. */
export function logout() {
  clearToken();
  try { localStorage.removeItem(CONNECTED_KEY); } catch (e) { /* egal */ }
}

/* ---------- GIS laden & initialisieren (offline-sicher) ---------- */

function loadGis() {
  if (gisLoaded) return gisLoaded;
  gisLoaded = new Promise((resolve, reject) => {
    if (typeof google !== "undefined" && google.accounts) return resolve();
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { gisLoaded = null; reject(new Error("GIS nicht ladbar (offline?)")); };
    document.head.appendChild(s);
  });
  return gisLoaded;
}

/**
 * Initialisiert Auth. silent=true versucht eine lautlose Token-Erneuerung,
 * wirft aber nie — ohne Netz/Session bleibt die App einfach lokal.
 */
export async function initAuth({ silent = true } = {}) {
  if (loadStoredToken()) { emit(); }
  try {
    await loadGis();
  } catch (e) {
    return isSignedIn(); // offline: gespeichertes Token reicht ggf. noch
  }
  if (!tokenClient) {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPE,
      callback: (resp) => { if (resp && resp.access_token) saveToken(resp); },
      error_callback: () => { /* lautlos: Login-Button bleibt verfügbar */ },
    });
  }
  // Lautlose Erneuerung nur, wenn dieses Gerät schon mal verbunden war —
  // sonst provoziert GIS einen (geblockten) Popup-Versuch bei jedem App-Start.
  if (!TOKEN && silent && wasConnectedBefore()) {
    try { tokenClient.requestAccessToken({ prompt: "" }); } catch (e) { /* egal */ }
  }
  return isSignedIn();
}

/** Expliziter Login (mit Popup) — für den Button. Auflösung über onAuthChange. */
export async function login() {
  await loadGis();
  await initAuth({ silent: false });
  tokenClient.requestAccessToken();
}

/* ---------- Drive REST ---------- */

async function driveFetch(url, opts = {}) {
  if (!TOKEN) throw new DriveError("Nicht angemeldet", 401);
  const r = await fetch(url, {
    ...opts,
    headers: { Authorization: "Bearer " + TOKEN, ...(opts.headers || {}) },
  });
  if (r.status === 401) { clearToken(); throw new DriveError("Token abgelaufen", 401); }
  if (!r.ok) throw new DriveError(`Drive ${r.status}: ${url.split("?")[0]}`, r.status);
  return r;
}

export class DriveError extends Error {
  constructor(msg, status) { super(msg); this.status = status; }
}

/** Datei-ID ermitteln: bekannte ID prüfen, sonst Namenssuche. null = existiert nicht. */
export async function findFile() {
  try {
    const r = await driveFetch(`https://www.googleapis.com/drive/v3/files/${KNOWN_FILE_ID}?fields=id,name,trashed`);
    const j = await r.json();
    if (j && j.id && !j.trashed) return j.id;
  } catch (e) {
    if (e.status === 401) throw e; // Auth-Problem nicht als "Datei fehlt" werten
    // 404/403 → Fallback Namenssuche
  }
  const q = encodeURIComponent(`name='${FILE_NAME}' and trashed=false`);
  const r = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&fields=files(id,name)`);
  const j = await r.json();
  return j.files && j.files.length ? j.files[0].id : null;
}

export async function readFile(id) {
  const r = await driveFetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`);
  return r.json();
}

/** IN-PLACE-Update — gleiche Datei-ID, niemals neue Datei. */
export async function updateFile(id, contentString) {
  await driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: contentString,
  });
}

/** Nur für den echten Erstlauf (keine Datei vorhanden). fileName-Parameter erlaubt
 *  listSync.js, eine eigene Datei (einkaufsliste.json) anzulegen, ohne FILE_NAME zu berühren. */
export async function createFile(contentString, fileName = FILE_NAME) {
  const meta = { name: fileName, mimeType: "application/json" };
  const body = new FormData();
  body.append("metadata", new Blob([JSON.stringify(meta)], { type: "application/json" }));
  body.append("file", new Blob([contentString], { type: "application/json" }));
  const r = await driveFetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
    method: "POST", body,
  });
  return (await r.json()).id;
}

/* ---------- Bilddateien (eigene Fotos — Phase 1 nutzt das) ---------- */

const imgCache = new Map(); // fileId -> ObjectURL

export async function uploadImage(blob, name) {
  const meta = { name, mimeType: blob.type || "image/jpeg" };
  const body = new FormData();
  body.append("metadata", new Blob([JSON.stringify(meta)], { type: "application/json" }));
  body.append("file", blob);
  const r = await driveFetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
    method: "POST", body,
  });
  return (await r.json()).id;
}

export async function deleteFile(id) {
  try {
    await driveFetch(`https://www.googleapis.com/drive/v3/files/${id}`, { method: "DELETE" });
  } catch (e) { /* schon weg? egal */ }
  imgCache.delete(id);
}

export async function imageUrl(fileId) {
  if (imgCache.has(fileId)) return imgCache.get(fileId);
  const r = await driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
  const url = URL.createObjectURL(await r.blob());
  imgCache.set(fileId, url);
  return url;
}
