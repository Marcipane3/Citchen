// match.js — Koch-Match (Tinder-artige Swipe-Entdeckung). v1-Parität P9.1–P9.6.
// Matches liegen in IndexedDB (kv "matches"), beim Laden gegen vorhandene IDs validiert.

import { state } from "../../store.js";
import * as db from "../../data/db.js";
import * as sync from "../../data/sync.js";
import { getTotalMinutes } from "../../data/derive.js";
import { esc, hydrateHeroes } from "../../ui/helpers.js";
import { openSheet } from "../../ui/sheet.js";
import { openDetail } from "../cookbook/detail.js";
import { openMenu } from "../menu.js";
import { BUILD } from "../../version.js";

const MATCH_KEY = "matches";
const WEEKEND_CATS = ["Wochenend-Gerichte", "Backen: Süßes & Kuchen", "Sourdough & Sauerteig", "Backen: Brot & Herzhaftes"];

let swipeOrder = [], swipeIdx = 0, swipeMatches = [], swipeHistory = [];

function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function loadMatches() {
  const ids = await db.kvGet(MATCH_KEY, []);
  return (Array.isArray(ids) ? ids : []).filter((id) => state.recipes.some((r) => r.id === id));
}
function saveMatches() { db.kvSet(MATCH_KEY, swipeMatches).catch(() => {}); }

/** Wochentags- vs. Wochenend-Gericht fürs Karten-Badge (v1-Logik, totalTime-bewusst). */
export function dishKind(r) {
  const m = getTotalMinutes(r);
  if (WEEKEND_CATS.includes(r.category) || (m !== null && m > 40)) return { label: "Wochenende", icon: "🍷" };
  return { label: "Wochentags", icon: "⚡" };
}

function scardHTML(r, behind) {
  const k = dishKind(r);
  const hasImg = (r.photos && r.photos.length) || r.image;
  return `<div class="scard ${behind ? "behind" : ""}" data-id="${esc(r.id)}">
    <div class="scard-img ${hasImg ? "has-img" : ""}" data-hero="${esc(r.id)}">${hasImg ? "" : "🍽"}</div>
    <div class="scard-grad"></div>
    <div class="scard-badges">
      <span class="sb">${esc(r.category)}</span>
      <span class="sb kind">${k.icon} ${k.label}</span>
    </div>
    <div class="scard-info">
      <div class="scard-name">${esc(r.name)}</div>
      <div class="scard-meta">
        ${r.time ? `<span>⏱ ${esc(r.time)}</span>` : ""}
        ${r.rating ? `<span class="st">${"★".repeat(r.rating)}</span>` : ""}
        <span>🥗 ${(r.ingredients || []).length} Zutaten</span>
      </div>
    </div>
    <div class="scard-stamp like">Lecker</div>
    <div class="scard-stamp nope">Nö</div>
  </div>`;
}

export function renderMatch(container) {
  container.innerHTML = `
    <header class="app-header">
      <div class="brand">
        <div class="brand-l">
          <span style="font-size:24px">🔥</span>
          <div><h1>Koch-Match</h1><div class="sub">Swipe dich durch deine Rezepte</div></div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="match-stack" id="matchStack" title="Deine Matches">🔥 <span class="ms-count">0</span></button>
          <button class="icon-btn" id="menuBtn" title="Menü">☰</button>
        </div>
      </div>
    </header>
    <main class="swipe-wrap">
      <div class="swipe-deck" id="deck"></div>
      <div class="swipe-actions" id="swipeActions">
        <button class="sw-btn undo" id="swUndo" title="Zurück">↩︎</button>
        <button class="sw-btn nope" id="swNope" title="Nö">✕</button>
        <button class="sw-btn like" id="swLike" title="Lecker!">🔥</button>
      </div>
      <div class="swipe-hint">Nach rechts wischen = Match · nach links = weiter</div>
    </main>
    <div class="sync-line">${esc(sync.getStatus())}</div>
    <div class="build-line">Build ${esc(BUILD)}</div>`;

  container.querySelector("#menuBtn").onclick = () => openMenu("match");
  container.querySelector("#matchStack").onclick = openMatches;

  loadMatches().then((m) => {
    swipeMatches = m;
    swipeHistory = [];
    swipeOrder = shuffle(state.recipes.filter((r) => !swipeMatches.includes(r.id)).map((r) => r.id));
    swipeIdx = 0;
    paintSwipe(container);
  });
}

function updateStackBadge() {
  const c = document.querySelector(".ms-count");
  if (c) c.textContent = swipeMatches.length;
}

function paintSwipe(container) {
  const deck = container.querySelector("#deck");
  if (!deck) return;
  updateStackBadge();
  const sa = container.querySelector("#swipeActions");

  if (swipeIdx >= swipeOrder.length) {
    if (sa) sa.style.display = "none";
    deck.innerHTML = `<div class="swipe-empty">
      <h3>Alles durchgeswipt! 🎉</h3>
      <p>${swipeMatches.length} Match${swipeMatches.length === 1 ? "" : "es"} in deinem Stapel.</p>
      <button class="btn-primary" id="swShowMatches" style="margin-top:16px">🔥 Matches ansehen</button>
      <button class="btn-sec" id="swRestart" style="margin-top:10px">↻ Nochmal von vorn</button>
    </div>`;
    const sm = deck.querySelector("#swShowMatches");
    if (sm) sm.onclick = openMatches;
    const sr = deck.querySelector("#swRestart");
    if (sr) sr.onclick = () => {
      swipeOrder = shuffle(state.recipes.map((r) => r.id));
      swipeIdx = 0;
      swipeHistory = [];
      paintSwipe(container);
    };
    return;
  }

  if (sa) sa.style.display = "";
  const cur = state.recipes.find((x) => x.id === swipeOrder[swipeIdx]);
  const nextId = swipeOrder[swipeIdx + 1];
  const next = nextId ? state.recipes.find((x) => x.id === nextId) : null;
  deck.innerHTML = (next ? scardHTML(next, true) : "") + (cur ? scardHTML(cur, false) : "");
  hydrateHeroes(deck, state.recipes);

  const top = deck.querySelector(".scard:not(.behind)");
  if (top) attachDrag(top, container);
  container.querySelector("#swUndo").onclick = () => undoSwipe(container);
  container.querySelector("#swNope").onclick = () => buttonSwipe("nope", container);
  container.querySelector("#swLike").onclick = () => buttonSwipe("like", container);
}

function attachDrag(card, container) {
  let startX = 0, dx = 0, dragging = false;
  const like = card.querySelector(".scard-stamp.like"), nope = card.querySelector(".scard-stamp.nope");
  card.onpointerdown = (e) => {
    dragging = true; startX = e.clientX; dx = 0;
    try { card.setPointerCapture(e.pointerId); } catch (_) {}
    card.style.transition = "none";
  };
  card.onpointermove = (e) => {
    if (!dragging) return;
    dx = e.clientX - startX;
    card.style.transform = `translate(${dx}px, ${Math.abs(dx) * 0.06}px) rotate(${dx / 18}deg)`;
    const o = Math.min(Math.abs(dx) / 120, 1);
    if (dx > 0) { like.style.opacity = o; nope.style.opacity = 0; }
    else { nope.style.opacity = o; like.style.opacity = 0; }
  };
  const end = () => {
    if (!dragging) return;
    dragging = false;
    card.style.transition = "transform .32s cubic-bezier(.16,1,.3,1), opacity .32s ease-out";
    if (Math.abs(dx) > 110) flyOut(card, dx > 0 ? "like" : "nope", container);
    else { card.style.transform = ""; like.style.opacity = 0; nope.style.opacity = 0; }
    dx = 0;
  };
  card.onpointerup = end;
  card.onpointercancel = end;
}

function flyOut(card, dir, container) {
  card.style.transition = "transform .3s ease-out, opacity .3s ease-out";
  const x = (dir === "like" ? 1 : -1) * ((window.innerWidth || 420) + 200);
  card.style.transform = `translate(${x}px, -40px) rotate(${dir === "like" ? 26 : -26}deg)`;
  card.style.opacity = "0";
  setTimeout(() => commitSwipe(dir, container), 250);
}

function buttonSwipe(dir, container) {
  const deck = container.querySelector("#deck");
  if (!deck) return;
  const top = deck.querySelector(".scard:not(.behind)");
  if (!top) { commitSwipe(dir, container); return; }
  flyOut(top, dir, container);
}

function commitSwipe(dir, container) {
  const id = swipeOrder[swipeIdx];
  if (dir === "like" && id && !swipeMatches.includes(id)) {
    swipeMatches.push(id);
    saveMatches();
  }
  swipeHistory.push({ id, dir });
  swipeIdx++;
  paintSwipe(container);
}

function undoSwipe(container) {
  const last = swipeHistory.pop();
  if (!last) return;
  swipeIdx = Math.max(0, swipeIdx - 1);
  if (last.dir === "like") {
    swipeMatches = swipeMatches.filter((x) => x !== last.id);
    saveMatches();
  }
  paintSwipe(container);
}

/** Goldener Stapel: Matches-Liste; Tippen öffnet das volle Rezept. */
function openMatches() {
  const list = swipeMatches.map((id) => state.recipes.find((r) => r.id === id)).filter(Boolean);
  const html = `
    <div class="sheet-head"><span class="cat-label">🔥 Deine Matches (${list.length})</span><button class="icon-btn close">✕</button></div>
    ${list.length ? list.map((r) => {
      const hasImg = (r.photos && r.photos.length) || r.image;
      const k = dishKind(r);
      return `<div class="match-row" data-id="${esc(r.id)}">
        <div class="match-thumb ${hasImg ? "has-img" : ""}" data-hero="${esc(r.id)}">${hasImg ? "" : "🍽"}</div>
        <div class="match-info"><div class="mn">${esc(r.name)}</div>
          <div class="mm">${esc(r.category)} · ${k.icon} ${k.label}${r.time ? ` · ⏱ ${esc(r.time)}` : ""}${r.rating ? ` · ${"★".repeat(r.rating)}` : ""}</div></div>
        <button class="match-rm" data-rm="${esc(r.id)}" title="Entfernen">✕</button>
      </div>`;
    }).join("") : `<p class="empty" style="margin-top:30px">Noch keine Matches.<br>Swipe Rezepte nach rechts.</p>`}
  `;
  const { el, close } = openSheet(html);
  hydrateHeroes(el, state.recipes);
  el.querySelectorAll(".match-row").forEach((row) => {
    row.onclick = (e) => {
      if (e.target.closest(".match-rm")) return;
      close();
      openDetail(row.dataset.id);
    };
  });
  el.querySelectorAll(".match-rm").forEach((b) => {
    b.onclick = (e) => {
      e.stopPropagation();
      swipeMatches = swipeMatches.filter((x) => x !== b.dataset.rm);
      saveMatches();
      close();
      updateStackBadge();
      openMatches();
    };
  });
}
