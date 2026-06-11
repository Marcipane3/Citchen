// settings.js — Einstellungen (#/settings). Frei nutzbar, schaltet Premium frei.
// Abschnitte: 🔑 KI (BYOK-Key, Modellwahl, Test) · 🥫 Vorrat · ☁️ Drive · 🎨 Design.

import { state } from "../../store.js";
import * as gate from "../../ai/gate.js";
import { testKey, AiError } from "../../ai/client.js";
import * as drive from "../../data/drive.js";
import * as sync from "../../data/sync.js";
import { setRecipes } from "../../store.js";
import { getStaples, setStaples, resetStaples, getTheme, setTheme } from "../../data/settings.js";
import { DEFAULT_STAPLES } from "../shopping/logic.js";
import { esc } from "../../ui/helpers.js";
import { openMenu } from "../menu.js";
import { BUILD } from "../../version.js";

export function renderSettings(container) {
  container.innerHTML = `
    <header class="app-header">
      <div class="brand">
        <div class="brand-l"><span style="font-size:24px">⚙️</span><div><h1>Einstellungen</h1></div></div>
        <button class="icon-btn" id="menuBtn" title="Menü">☰</button>
      </div>
    </header>
    <main class="app-main">

      <div class="card set-card">
        <h3>🔑 KI (eigener Anthropic-Schlüssel)</h3>
        <p class="set-note">Bring Your Own Key: Der Schlüssel bleibt <strong>nur auf diesem Gerät</strong> (localStorage),
        wird nie nach Drive synchronisiert und nur direkt an die Anthropic-API gesendet. Kosten laufen über dein Anthropic-Konto.</p>
        <label>API-Schlüssel</label>
        <div style="display:flex;gap:8px">
          <input class="f" id="set-key" type="password" placeholder="sk-ant-…" autocomplete="off" style="flex:1" />
          <button class="btn-sec" id="key-toggle" title="anzeigen">👁</button>
        </div>
        <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
          <button class="btn-primary" id="key-save">Speichern</button>
          <button class="btn-sec" id="key-test">Verbindung testen</button>
          <button class="btn-sec btn-del" id="key-del">Entfernen</button>
        </div>
        <p class="set-note" id="key-status"></p>
        <label style="margin-top:14px">Modell</label>
        ${gate.MODELS.map((m) => `
          <label class="check"><input type="radio" name="set-model" value="${m.id}" ${gate.getModel() === m.id ? "checked" : ""}/> ${esc(m.label)}</label>`).join("")}
      </div>

      <div class="card set-card">
        <h3>🥫 Vorrat (immer im Haus)</h3>
        <p class="set-note">Eine Zutat pro Zeile. Die Einkaufsliste überspringt diese Artikel
        (bei Rezepten ohne 🛒-Marker). Vorbefüllt aus deinem Projektwissen.</p>
        <textarea class="f" id="set-staples" rows="10" spellcheck="false"></textarea>
        <div style="display:flex;gap:8px;margin-top:10px">
          <button class="btn-primary" id="staples-save">Speichern</button>
          <button class="btn-sec" id="staples-reset">Auf Standard zurücksetzen</button>
        </div>
        <p class="set-note" id="staples-status"></p>
      </div>

      <div class="card set-card">
        <h3>☁️ Google Drive</h3>
        <p class="set-note">Optional. Synchronisiert <code>rezepte.json</code> über deine Geräte —
        die App bleibt auch ohne Drive voll nutzbar (lokal).</p>
        <p id="drive-status" style="font-weight:600;margin-bottom:10px"></p>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn-primary" id="drive-connect">Mit Google verbinden</button>
          <button class="btn-sec" id="drive-sync">Jetzt synchronisieren</button>
          <button class="btn-sec btn-del" id="drive-disconnect">Trennen</button>
        </div>
      </div>

      <div class="card set-card">
        <h3>🎨 Design</h3>
        <label class="check"><input type="radio" name="set-theme" value="system"/> 🌗 System folgen</label>
        <label class="check"><input type="radio" name="set-theme" value="light"/> ☀️ Hell</label>
        <label class="check"><input type="radio" name="set-theme" value="dark"/> 🌙 Dunkel</label>
      </div>

      <div class="card set-card">
        <h3>ℹ️ App</h3>
        <p class="set-note">Build ${esc(BUILD)} · ${state.recipes.length} Rezepte · Schema v3 · Datenquelle: ${esc(state.meta?.source === "drive" ? "Google Drive" : "lokal")}</p>
      </div>

    </main>`;

  container.querySelector("#menuBtn").onclick = () => openMenu("settings");

  /* ---------- KI / Key ---------- */
  const keyInput = container.querySelector("#set-key");
  const keyStatus = container.querySelector("#key-status");
  if (gate.isPremium()) {
    keyInput.value = gate.getKey();
    keyStatus.textContent = "✓ Schlüssel hinterlegt — KI-Features aktiv.";
  }
  container.querySelector("#key-toggle").onclick = () => {
    keyInput.type = keyInput.type === "password" ? "text" : "password";
  };
  container.querySelector("#key-save").onclick = () => {
    const k = keyInput.value.trim();
    if (k && !gate.looksLikeKey(k)) {
      if (!confirm("Das sieht nicht wie ein Anthropic-Schlüssel aus (beginnt normalerweise mit sk-ant-). Trotzdem speichern?")) return;
    }
    gate.setKey(k);
    keyStatus.textContent = k ? "✓ Gespeichert — KI-Features aktiv." : "Schlüssel entfernt.";
  };
  container.querySelector("#key-del").onclick = () => {
    gate.clearKey();
    keyInput.value = "";
    keyStatus.textContent = "Schlüssel entfernt — KI-Features deaktiviert. Alles andere läuft weiter.";
  };
  container.querySelector("#key-test").onclick = async (e) => {
    const btn = e.currentTarget;
    const k = keyInput.value.trim() || gate.getKey();
    if (!k) { keyStatus.textContent = "Kein Schlüssel eingegeben."; return; }
    btn.disabled = true;
    keyStatus.textContent = "Teste…";
    try {
      const res = await testKey(k, gate.getModel());
      keyStatus.textContent = `✓ Verbindung ok — ${res.displayName}${res.vision ? " (Vision-fähig)" : ""}.`;
    } catch (err) {
      keyStatus.textContent = "✗ " + (err instanceof AiError ? err.message : err.message);
    }
    btn.disabled = false;
  };
  container.querySelectorAll('input[name="set-model"]').forEach((r) => {
    r.onchange = () => gate.setModel(r.value);
  });

  /* ---------- Vorrat ---------- */
  const staplesArea = container.querySelector("#set-staples");
  const staplesStatus = container.querySelector("#staples-status");
  getStaples().then((list) => { staplesArea.value = list.join("\n"); });
  container.querySelector("#staples-save").onclick = async () => {
    const list = await setStaples(staplesArea.value.split("\n"));
    staplesArea.value = list.join("\n");
    staplesStatus.textContent = `✓ Gespeichert (${list.length} Artikel).`;
  };
  container.querySelector("#staples-reset").onclick = async () => {
    if (!confirm("Vorratsliste auf den Projektwissen-Standard zurücksetzen?")) return;
    await resetStaples();
    staplesArea.value = DEFAULT_STAPLES.join("\n");
    staplesStatus.textContent = "✓ Zurückgesetzt.";
  };

  /* ---------- Drive ---------- */
  const driveStatus = container.querySelector("#drive-status");
  const paintDrive = () => {
    driveStatus.textContent = state.signedIn
      ? `☁️ Verbunden · ${esc(sync.getStatus() || "bereit")}`
      : "Nicht verbunden — Daten nur lokal auf diesem Gerät.";
    container.querySelector("#drive-connect").style.display = state.signedIn ? "none" : "";
    container.querySelector("#drive-sync").style.display = state.signedIn ? "" : "none";
    container.querySelector("#drive-disconnect").style.display = state.signedIn ? "" : "none";
  };
  paintDrive();
  container.querySelector("#drive-connect").onclick = () =>
    drive.login().catch((e) => alert("Anmeldung nicht möglich: " + e.message));
  container.querySelector("#drive-sync").onclick = async (e) => {
    e.currentTarget.disabled = true;
    const res = await sync.syncWithDrive();
    if (res.changed) setRecipes(res.recipes, res.meta);
    e.currentTarget.disabled = false;
    paintDrive();
  };
  container.querySelector("#drive-disconnect").onclick = () => {
    if (!confirm("Drive trennen? Die Rezepte bleiben lokal erhalten; Sync stoppt.")) return;
    drive.logout();
    paintDrive();
  };
  drive.onAuthChange(paintDrive);
  sync.onStatus(paintDrive);

  /* ---------- Theme ---------- */
  getTheme().then((t) => {
    const r = container.querySelector(`input[name="set-theme"][value="${t}"]`);
    if (r) r.checked = true;
  });
  container.querySelectorAll('input[name="set-theme"]').forEach((r) => {
    r.onchange = () => setTheme(r.value);
  });
}
