// timers.js — Zustand der Schritt-Timer im Kochmodus (QW-8, #64).
// Rein: kein DOM, kein setInterval, keine eigene Uhr — `now` (ms) kommt immer vom Aufrufer.
// Gemerkt wird pro Schritt nur die Endzeit; die Restzeit wird daraus berechnet. So übersteht ein
// laufender Timer jedes Neuzeichnen (Schrittwechsel, Portionen), und nichts kann „pausieren“.
// Ein Timer pro Schritt; nichts wird gespeichert (endet mit dem Kochmodus).

export function createTimers() {
  const byStep = new Map(); // stepIndex → { end: ms, signalled: bool }

  const fired = (stepIndex, now) => {
    const tm = byStep.get(stepIndex);
    return !!tm && now >= tm.end;
  };
  const running = (stepIndex, now) => {
    const tm = byStep.get(stepIndex);
    return !!tm && now < tm.end;
  };

  return {
    /** Startet (oder ersetzt) den Timer eines Schritts. false bei ungültiger Dauer. */
    start(stepIndex, seconds, now) {
      const s = Number(seconds);
      if (!Number.isFinite(s) || s <= 0) return false;
      byStep.set(stepIndex, { end: now + s * 1000, signalled: false });
      return true;
    },
    /** Restzeit in ganzen Sekunden (aufgerundet); 0 ohne Timer oder nach Ablauf. */
    remaining(stepIndex, now) {
      const tm = byStep.get(stepIndex);
      return tm ? Math.max(0, Math.ceil((tm.end - now) / 1000)) : 0;
    },
    running,
    fired,
    stop(stepIndex) { byStep.delete(stepIndex); },
    clear() { byStep.clear(); },
    anyRunning(now) {
      for (const tm of byStep.values()) if (now < tm.end) return true;
      return false;
    },
    /** Schritte, deren Timer seit dem letzten Aufruf abgelaufen ist — jeder genau einmal (für den Alarm). */
    takeFired(now) {
      const out = [];
      for (const [stepIndex, tm] of byStep) {
        if (!tm.signalled && now >= tm.end) { tm.signalled = true; out.push(stepIndex); }
      }
      return out;
    },
  };
}
