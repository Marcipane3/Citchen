// decideSync.js — Reine Last-Write-Wins-Entscheidung, herausgelöst aus sync.js (K2).
// Keine I/O, keine Imports — nur die Vorrang-/Konfliktregel als testbare Spezifikation.
// Genau dieser Seam wird in Epic I2 (geteilte Einkaufsliste) wiederverwendet, damit der
// Sync „collection-agnostisch" wird, ohne die Regel ein zweites Mal von Hand zu schreiben.
//
// Eingaben (alle bereits gelesen, nichts wird hier geholt):
//   hasRemote     — existiert eine Drive-Datei? false → Erstlauf dieses Kontos.
//   localUpdated  — `updated`-Marke lokal  (ISO-String oder "").
//   remoteUpdated — `updated`-Marke auf Drive (ISO-String oder "").
//   dirty         — gibt es eine lokale, noch nicht gepushte Änderung?
//   source        — Herkunft der lokalen Daten ("drive" | "snapshot" | "empty" | …).
//
// Ergebnis — eine Aktion:
//   "create"   — keine Remote-Datei → lokale Sammlung hochladen.
//   "push"     — lokale Änderung ist die jüngste → Drive überschreiben.
//   "pull"     — Remote gewinnt → lokale Sammlung ersetzen (nur bei SAUBEREN lokalen Daten).
//   "conflict" — lokale ungepushte Änderung UND Remote ist gleich/neuer → NICHT still
//                überschreiben. Bewusste Entscheidung (K2): die lokale Änderung wird
//                bewahrt statt klammheimlich verworfen. Echte Auflösung kommt mit I2.
//   "noop"     — alles im Gleichstand, nichts zu tun.
export function decideSync({ hasRemote = false, localUpdated = "", remoteUpdated = "", dirty = false, source = "" } = {}) {
  if (!hasRemote) return "create";

  const local = localUpdated || "";
  const remote = remoteUpdated || "";

  if (dirty) {
    // Lokale, ungepushte Änderung. Nur pushen, wenn sie nachweislich die jüngste ist.
    if (local > remote) return "push";
    // Remote ist gleich alt oder neuer → echter Konflikt. Früher (sync.js:101-119) fiel
    // dieser Fall stillschweigend auf „pull" durch und löschte die lokale Änderung.
    return "conflict";
  }

  // Saubere lokale Daten: Remote darf gefahrlos gewinnen.
  // `source !== "drive"` deckt das erste echte Drive-Laden ab (Snapshot/leer → Drive).
  if (remote !== local || source !== "drive") return "pull";
  return "noop";
}
