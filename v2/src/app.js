// app.js — Bootstrap: Service Worker, Datenladung (IndexedDB-first), Routen.
// Views leben in /features; Zustand in store.js; jede Route darf eine
// cleanup()-Funktion zurückgeben (Timer/Wake-Lock im Kochmodus).

import * as router from "./router.js";
import * as sync from "./data/sync.js";
import * as drive from "./data/drive.js";
import { state, onState, setRecipes, setSignedIn } from "./store.js";
import { renderCookbook } from "./features/cookbook/cookbook.js";
import { renderMatch } from "./features/match/match.js";
import { renderCook } from "./features/cooking/cooking.js";
import { renderShopping } from "./features/shopping/shopping.js";
import { renderPlanner } from "./features/planner/planner.js";
import { renderAssistant } from "./features/assistant/assistant.js";
import { renderSettings } from "./features/settings/settings.js";
import { renderCapture } from "./features/capture/capture.js";
import { initTheme } from "./data/settings.js";
import { closeAllSheets } from "./ui/sheet.js";
import { esc } from "./ui/helpers.js";
import { BUILD } from "./version.js";

const app = () => document.getElementById("app");

let currentCleanup = null;
let currentRouteName = null;

function mount(name, renderFn) {
  if (currentCleanup) { try { currentCleanup(); } catch (e) { /* egal */ } currentCleanup = null; }
  closeAllSheets();
  currentRouteName = name;
  const maybeCleanup = renderFn(app());
  if (typeof maybeCleanup === "function") currentCleanup = maybeCleanup;
}

async function boot() {
  console.log("Koch v2 — Build", BUILD);

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register(new URL("../sw.js", import.meta.url)).catch(() => {});
  }

  initTheme(); // Theme früh anwenden (kein Flackern)

  // 1. Lokal laden (instant, offline)
  const { recipes, meta } = await sync.loadLocal();
  setRecipes(recipes, meta);

  // 2. Routen
  router.register("cookbook", () => mount("cookbook", renderCookbook));
  router.register("match", () => mount("match", renderMatch));
  router.register("cook/:id", ({ id }) => mount("cook", (c) => renderCook(c, id)));
  router.register("shopping", () => mount("shopping", renderShopping));
  router.register("planner", () => mount("planner", renderPlanner));
  router.register("assistant", () => mount("assistant", renderAssistant));
  router.register("capture", () => mount("capture", renderCapture));
  router.register("settings", () => mount("settings", renderSettings));
  router.setNotFound(() => router.navigate("cookbook"));
  router.start();

  // 3. Zustand → Listen-Views aktualisieren (Kochmodus NICHT — Timer überleben)
  onState(() => {
    if (currentRouteName === "cookbook") renderCookbook(app());
  });
  sync.onStatus(() => {
    const el = document.querySelector(".sync-line");
    if (el) el.textContent = sync.getStatus();
  });

  // 4. Auth lautlos, dann Hintergrund-Sync
  drive.onAuthChange(async (signedIn) => {
    setSignedIn(signedIn);
    if (signedIn) {
      const res = await sync.syncWithDrive();
      if (res.changed) setRecipes(res.recipes, res.meta);
      else if (res.meta) state.meta = res.meta;
    }
  });
  drive.initAuth({ silent: true });
}

boot();
