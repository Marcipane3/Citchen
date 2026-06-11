// sheet.js — Bottom-Sheet/Overlay-Helfer mit Geister-Klick-Schutz (v1 "armSheet"):
// Auf Touch-Geräten feuert ~300ms nach einem Tap ein synthetischer Klick an derselben
// Stelle — der würde sonst Buttons im frisch geöffneten Sheet auslösen. Wir sperren
// das Sheet 450ms und akzeptieren Backdrop-Schließen erst danach.

const openSheets = new Set();

export function openSheet(html, { onClose } = {}) {
  const ov = document.createElement("div");
  ov.className = "overlay";
  ov.innerHTML = `<div class="sheet">${html}</div>`;
  document.body.appendChild(ov);

  const sheet = ov.querySelector(".sheet");
  sheet.style.pointerEvents = "none";
  let armed = false;
  setTimeout(() => { armed = true; sheet.style.pointerEvents = ""; }, 450);

  const close = () => {
    ov.remove();
    openSheets.delete(close);
    if (onClose) onClose();
  };
  openSheets.add(close);

  ov.addEventListener("click", (e) => { if (armed && e.target === ov) close(); });
  const x = ov.querySelector(".icon-btn.close");
  if (x) x.onclick = close;

  return { el: sheet, ov, close };
}

/** Alle offenen Sheets schließen (z.B. vor einem Routenwechsel in den Kochmodus). */
export function closeAllSheets() {
  for (const close of [...openSheets]) close();
}
