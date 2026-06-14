// sheet.js — Bottom-Sheet/Overlay-Helfer mit Geister-Klick-Schutz (v1 "armSheet"):
// Auf Touch-Geräten feuert ~300ms nach einem Tap ein synthetischer Klick an derselben
// Stelle — der würde sonst Buttons im frisch geöffneten Sheet auslösen. Wir sperren
// das Sheet 450ms und akzeptieren Backdrop-Schließen erst danach.
// K3 a11y: Tastatur-Bedienung — Escape schließt, Tab bleibt im Sheet gefangen
// (Fokus-Falle), und beim Schließen kehrt der Fokus zum Auslöser zurück.

const openSheets = new Set();

/** Sichtbare, fokussierbare Elemente innerhalb des Sheets (für die Fokus-Falle). */
function focusables(root) {
  const sel = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  return Array.from(root.querySelectorAll(sel))
    .filter((el) => !el.disabled && el.offsetParent !== null);
}

export function openSheet(html, { onClose } = {}) {
  const prevFocus = document.activeElement; // Fokus beim Schließen wiederherstellen.
  const ov = document.createElement("div");
  ov.className = "overlay";
  ov.innerHTML = `<div class="sheet" tabindex="-1" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(ov);

  const sheet = ov.querySelector(".sheet");
  sheet.style.pointerEvents = "none";
  let armed = false;
  setTimeout(() => { armed = true; sheet.style.pointerEvents = ""; }, 450);

  const close = () => {
    document.removeEventListener("keydown", onKey, true);
    ov.remove();
    openSheets.delete(close);
    if (prevFocus && typeof prevFocus.focus === "function") {
      try { prevFocus.focus(); } catch (e) { /* Auslöser ist weg — egal */ }
    }
    if (onClose) onClose();
  };
  openSheets.add(close);

  ov.addEventListener("click", (e) => { if (armed && e.target === ov) close(); });
  const x = ov.querySelector(".icon-btn.close");
  if (x) x.onclick = close;

  function onKey(e) {
    // Nur das oberste Sheet reagiert, falls mehrere gestapelt sind.
    if (ov !== document.querySelector(".overlay:last-of-type")) return;
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key !== "Tab") return;
    const f = focusables(sheet);
    if (!f.length) { e.preventDefault(); return; }
    const first = f[0], last = f[f.length - 1];
    const active = document.activeElement;
    if (e.shiftKey) {
      if (active === first || !sheet.contains(active)) { e.preventDefault(); last.focus(); }
    } else if (active === last || !sheet.contains(active)) {
      e.preventDefault(); first.focus();
    }
  }
  document.addEventListener("keydown", onKey, true);

  // Fokus ins Sheet holen — Schließen-Button bevorzugt (sonst der Container).
  (x || sheet).focus();

  return { el: sheet, ov, close };
}

/** Alle offenen Sheets schließen (z.B. vor einem Routenwechsel in den Kochmodus). */
export function closeAllSheets() {
  for (const close of [...openSheets]) close();
}
