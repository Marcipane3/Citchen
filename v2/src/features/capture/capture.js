// capture.js — 📸 Rezept erfassen (#/capture, Phase-4-SCAFFOLD).
// Route, Eingabe-UI und Review-vor-Speichern sind fertig verdrahtet
// (Review = openForm im Draft-Modus → addRecipe). Nur der Vision-Parse
// ist per Flag deaktiviert; bis dahin führt alles in die manuelle Erfassung.

import * as gate from "../../ai/gate.js";
import { FLAGS } from "../../flags.js";
import { parseCapture, draftFromInput, CaptureDisabledError } from "./parse.js";
import { esc } from "../../ui/helpers.js";
import { openForm } from "../cookbook/form.js";
import { openMenu } from "../menu.js";
import { BUILD } from "../../version.js";

export function renderCapture(container) {
  const hasKey = gate.isPremium();
  container.innerHTML = `
    <header class="app-header">
      <div class="brand">
        <div class="brand-l"><span style="font-size:24px">📸</span><div><h1>Rezept erfassen</h1><div class="sub">Foto oder URL → Kochbuch</div></div></div>
        <button class="icon-btn" id="menuBtn" title="Menü">☰</button>
      </div>
    </header>
    <main class="app-main">

      <div class="card set-card">
        <h3>So wird's funktionieren</h3>
        <p class="set-note">Ein Foto (Kochbuchseite, Screenshot) oder eine Rezept-URL wird von einem
        Vision-Modell gelesen und in dein Schema übersetzt — Zutaten mit 🛒-Markern, Schritte,
        Tipps, Kategorie. <strong>Vor dem Speichern prüfst du immer das Review-Formular</strong> —
        nichts landet ungeprüft im Kochbuch.</p>
        <p class="set-note">
          ${FLAGS.captureParse ? "🟢 Analyse aktiv" : "🟡 Die automatische Analyse ist noch deaktiviert (kommt mit einem Update)"}
          · ${hasKey ? "🔑 API-Schlüssel vorhanden" : `🔒 braucht deinen API-Schlüssel (<a href="#/settings">Einstellungen</a>)`}
          · Modell: ${esc(gate.getModel())} (Vision-fähig)
        </p>
      </div>

      <div class="card set-card">
        <h3>📷 Foto</h3>
        <button class="photo-add" id="cap-photo">📷 Foto aufnehmen oder hochladen</button>
      </div>

      <div class="card set-card">
        <h3>🔗 URL</h3>
        <div style="display:flex;gap:8px">
          <input class="f" id="cap-url" type="url" placeholder="https://… (Rezeptseite)" style="flex:1" />
          <button class="btn-primary" id="cap-parse">Analysieren</button>
        </div>
        <p class="set-note" id="cap-status" style="margin-top:8px"></p>
      </div>

      <div class="card set-card">
        <h3>✍️ Oder direkt manuell</h3>
        <p class="set-note">Das Review-Formular geht jederzeit auch ohne Analyse.</p>
        <button class="btn-sec" id="cap-manual" style="width:100%">Rezept manuell erfassen</button>
      </div>

    </main>
    <div class="build-line">Build ${esc(BUILD)}</div>`;

  container.querySelector("#menuBtn").onclick = () => openMenu("capture");
  const status = container.querySelector("#cap-status");

  /** Gemeinsamer Pfad: Parse versuchen → bei Scaffold-Flag in den manuellen Entwurf. */
  async function tryParse(input) {
    status.textContent = "Analysiere…";
    try {
      const draft = await parseCapture(input);
      openForm(draft, { draft: true }); // Review-vor-Speichern — IMMER
      status.textContent = "";
    } catch (e) {
      if (e instanceof CaptureDisabledError) {
        status.innerHTML = `🟡 ${esc(e.message)}<br>Du kannst den Entwurf trotzdem von Hand füllen:`;
        const btn = document.createElement("button");
        btn.className = "btn-sec";
        btn.style.cssText = "margin-top:8px";
        btn.textContent = "✍️ Entwurf manuell ausfüllen";
        btn.onclick = () => openForm(draftFromInput(input), { draft: true });
        status.appendChild(document.createElement("br"));
        status.appendChild(btn);
      } else {
        status.textContent = "⚠️ " + e.message;
      }
    }
  }

  container.querySelector("#cap-photo").onclick = () => {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "image/*";
    inp.style.cssText = "position:fixed;left:-9999px;opacity:0";
    document.body.appendChild(inp);
    inp.onchange = () => {
      const f = inp.files && inp.files[0];
      inp.remove();
      if (f) tryParse({ photoBlob: f, note: "Foto: " + f.name });
    };
    inp.click();
  };

  container.querySelector("#cap-parse").onclick = () => {
    const url = container.querySelector("#cap-url").value.trim();
    if (!url) { status.textContent = "Bitte zuerst eine URL eingeben."; return; }
    tryParse({ url });
  };

  container.querySelector("#cap-manual").onclick = () =>
    openForm(draftFromInput({}), { draft: true });
}
