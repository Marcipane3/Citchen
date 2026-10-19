// syncCore.js — P1: EIN Sync-Kern für alle Drive-Dateien (Rezepte, Einkaufsliste, später z. B.
// ein geteilter Wochenplan). Was sich unterscheidet, ist nur die Merge-Regel (syncRules.js):
//   Rezepte → Drei-Wege-Merge pro Rezept (v2.15.1) · Liste → Merge pro Artikel + Tombstones.
// Der Kern selbst importiert nichts: Drive und der Meta-Speicher werden hineingereicht, damit
// Node-Tests zwei Instanzen („zwei Geräte“) gegen eine Fake-Drive laufen lassen können.
//
// Was der Kern garantiert:
//  - Eine Warteschlange pro Datei: Abgleich, Speichern-Push und Meta-Änderungen (Partner verbinden/
//    trennen) laufen nacheinander, nie verschränkt. Behebt den P2-Fund: „Verbinden“ während eines
//    laufenden Abgleichs ging verloren, weil der alte Lauf die alte Meta zurückschrieb.
//  - Single-Flight: ein Abgleich, der schon läuft oder wartet, wird geteilt statt verdoppelt.
//  - Meta wird nur PATCH-weise geändert (atomar im Speicher), nie als veraltete Kopie überschrieben.
//  - Datei finden oder anlegen, lesen → Regel → schreiben, Fehler → Status — für jede Datei gleich.
//    Seit v2.15.1 schreibt nichts mehr blind: auch Speichern ist ein Abgleich (erst lesen).

/**
 * cfg:
 *  - name        Name fürs Log ("rezepte", "einkaufsliste").
 *  - metaKey     kv-Schlüssel der Sync-Meta ({ fileId, dirty, lastSync, … }).
 *  - fileName    Dateiname beim Anlegen in Drive.
 *  - drive       { isSignedIn(), readFile(id), updateFile(id, s), createFile(s, name) }.
 *  - kv          { get(key, fallback), update(key, fn, fallback) } — update atomar.
 *  - locate      async (meta) → { fileId, meta? } | null — vorhandene Datei suchen, wenn meta.fileId fehlt.
 *  - rule        Merge-Regel (siehe syncRules.js):
 *                  migrateMeta?(meta) → Patch | null
 *                  readLocal() → lokaler Stand
 *                  create({ local, meta, now }) → { content, apply(fileId) }
 *                  merge({ local, remote, meta, now, currentMeta }) → { write: string|null, apply() }
 *                  apply… → { meta: Patch, status, result, after?() }
 *                  errorStatus(e) → Status
 *                  syncing / signedOut — Status während des Abgleichs / ohne Anmeldung (optional)
 *  - online      () → bool (Default: navigator.onLine !== false).
 */
export function createSyncEngine(cfg) {
  const { name, metaKey, fileName, drive, kv, locate, rule } = cfg;
  const isOnline = cfg.online || (() => typeof navigator === "undefined" || navigator.onLine !== false);

  /* ---------- Status ---------- */
  let status = rule.initialStatus ?? "";
  const statusListeners = new Set();
  const onStatus = (fn) => { statusListeners.add(fn); return () => statusListeners.delete(fn); };
  const getStatus = () => status;
  function setStatus(s) {
    if (s === undefined) return;
    status = s;
    for (const fn of statusListeners) {
      try { fn(s); } catch (e) { console.warn(`Sync[${name}]: Status-Listener warf`, e); } // ein Listener darf den Sync nie abbrechen
    }
  }

  /* ---------- Meta (nur als Patch ändern) ---------- */
  const getMeta = () => kv.get(metaKey, {});
  /** patch = Objekt oder fn(meta) → Objekt. Wird atomar über die aktuelle Meta gelegt. */
  const patchMeta = (patch) => kv.update(metaKey, (cur) => {
    const base = cur || {};
    return { ...base, ...(typeof patch === "function" ? patch(base) : patch) };
  }, {});

  /* ---------- Warteschlange + Single-Flight ---------- */
  let tail = Promise.resolve();
  let pendingSync = null;

  /** op(ctx) läuft erst, wenn alles davor fertig ist. ctx.sync() = Abgleich OHNE neu anzustellen. */
  function run(op) {
    const p = tail.then(() => op(ctx));
    tail = p.catch(() => {});
    return p;
  }

  /** Abgleich anstoßen. Läuft oder wartet schon einer, wird er geteilt. label = Statustext währenddessen. */
  function sync({ label } = {}) {
    if (!drive.isSignedIn()) { setStatus(rule.signedOut); return Promise.resolve({ changed: false }); }
    if (pendingSync) return pendingSync;
    pendingSync = run(() => doSync({ label })).finally(() => { pendingSync = null; });
    return pendingSync;
  }

  let timer = null;
  /** Gebündelter Abgleich (schnelle Taps → ein Drive-Schreibvorgang). */
  function schedule(delay) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; sync(); }, delay);
  }

  /* ---------- Der eine Ablauf ---------- */
  async function doSync({ label } = {}) {
    if (!drive.isSignedIn()) { setStatus(rule.signedOut); return { changed: false }; }
    setStatus(label ?? rule.syncing);
    let meta = await getMeta();
    const fix = rule.migrateMeta ? rule.migrateMeta(meta) : null;
    if (fix) meta = await patchMeta(fix);
    try {
      const local = await rule.readLocal();
      const now = new Date().toISOString();
      let fileId = meta.fileId;

      if (!fileId) {
        const found = await locate(meta);
        if (found && found.fileId) {
          fileId = found.fileId;
          meta = await patchMeta({ ...(found.meta || {}), fileId });
        }
      }

      let plan, write;
      if (!fileId) {
        // Echter Erstlauf: Datei mit dem lokalen Stand anlegen.
        plan = rule.create({ local, meta, now });
        fileId = await drive.createFile(plan.content, fileName);
      } else {
        const remote = await drive.readFile(fileId);
        plan = await rule.merge({ local, remote, meta, now, currentMeta: getMeta });
        write = plan.write;
        if (write != null) await drive.updateFile(fileId, write); // in place, gleiche Datei-ID
      }

      const done = await plan.apply(fileId);
      meta = await patchMeta({ ...(done.meta || {}), fileId });
      setStatus(done.status);
      if (done.after) done.after();
      return { changed: false, ...(done.result || {}), meta };
    } catch (e) {
      console.warn(`Sync[${name}] fehlgeschlagen:`, e);
      setStatus(rule.errorStatus(e, { online: isOnline() }));
      return { changed: false, error: e };
    }
  }

  const ctx = { sync: doSync, getMeta, patchMeta, setStatus, isOnline };

  /**
   * Auf eine andere Datei umschalten (z. B. Partner-Liste verbinden/trennen): Meta-Patch + Abgleich
   * als EIN Schritt in der Warteschlange — ein laufender Abgleich kann ihn nicht mehr überschreiben.
   */
  const retarget = (patch) => run(async () => { await patchMeta(patch); return doSync(); });

  return { sync, run, schedule, retarget, getMeta, patchMeta, getStatus, setStatus, onStatus, isOnline };
}
