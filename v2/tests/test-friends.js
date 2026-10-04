// Tests: I3 Freunde-Link — reine Logik aus friendMerge.js (kein Netz, keine DB).
// Kernfall der Roadmap: Link → Freund fügt hinzu → Besitzer sieht es nach dem Abholen,
// und ein erneutes Abholen vor dem Quittieren (Netzabbruch) zählt nichts doppelt.
import { test, assert, assertEqual, assertDeepEqual } from "./runner.js";
import {
  applyFriendItems, snapshotOf, isListed, inviteUrl, inviteFromHash,
  friendAuthor, friendName, trimSeen,
} from "../src/features/shopping/friendMerge.js";
import { syncStep } from "../src/features/shopping/listMerge.js";

const NOW = "2026-10-04T12:00:00.000Z";
const own = (id, name, extra = {}) => ({ id, name, cat: "Sonstiges", icon: "🛒", qty: 1, done: false, amount: null, unit: null, updated: "2026-10-04T10:00:00.000Z", author: "local", deleted: false, ...extra });

test("I3: Freundes-Vorschlag wird neuer Artikel mit Gang, Symbol und Autor", () => {
  const { items, added } = applyFriendItems([own("a", "Brot")], [{ id: "u1", name: "Hafermilch", author: "Anna" }], { now: NOW });
  assertEqual(added, 1);
  const it = items.find((x) => x.id === "fr-u1");
  assert(it, "Freundes-Artikel fehlt");
  assertEqual(it.author, "friend:Anna");
  assertEqual(it.updated, NOW);
  assert(it.cat !== "Sonstiges" && it.icon !== "📝", "Hafermilch sollte über den Katalog einen Gang bekommen: " + it.cat);
});

test("I3: steht der Artikel schon offen drauf → Menge +1, kein Duplikat, wieder offen", () => {
  const base = [own("a", "Milch", { done: true })];
  const { items } = applyFriendItems(base, [{ id: "u1", name: "  milch " }], { now: NOW });
  assertEqual(items.length, 1);
  assertEqual(items[0].qty, 2);
  assertEqual(items[0].done, false);
  assertEqual(items[0].updated, NOW, "touch() fehlt → Partner würde die Änderung nicht übernehmen");
  assertEqual(base[0].qty, 1, "Eingabe darf nicht mutiert werden");
});

test("I3: erneutes Abholen vor fl_ack (seen) zählt nichts doppelt", () => {
  const pulled = [{ id: "u1", name: "Milch" }, { id: "u2", name: "Eier" }];
  const first = applyFriendItems([own("a", "Milch")], pulled, { now: NOW });
  const again = applyFriendItems(first.items, pulled, { now: NOW, seen: first.seen });
  assertEqual(again.added, 0);
  assertEqual(again.items.find((x) => x.name === "Milch").qty, 2);
  assertEqual(again.items.filter((x) => x.name === "Eier").length, 1);
});

test("I3: leere Namen und gelöschte Artikel — Tombstone wird nicht hochgezählt", () => {
  const { items, added } = applyFriendItems([own("a", "Feta", { deleted: true })], [{ id: "u1", name: "   " }, { id: "u2", name: "Feta" }], { now: NOW });
  assertEqual(added, 1);
  assertEqual(items.filter((x) => !x.deleted && x.name === "Feta").length, 1, "Feta muss als neuer offener Artikel kommen");
  assertEqual(items.find((x) => x.id === "a").deleted, true);
});

test("I3: Freundes-Artikel erreicht den Partner über den normalen Drive-Merge", () => {
  const drive = [own("a", "Brot")];
  const { items } = applyFriendItems(drive.map((x) => ({ ...x })), [{ id: "u1", name: "Äpfel", author: "Ben" }], { now: NOW });
  const { merged, writeRemote } = syncStep(items, drive, NOW);
  assert(writeRemote, "Drive muss geschrieben werden");
  assert(merged.some((x) => x.id === "fr-u1" && x.author === "friend:Ben"));
});

test("I3: Schaufenster = nur offene Artikel, kompakt, nach Gang sortiert", () => {
  const items = [
    own("1", "Zahnpasta"),
    own("2", "Milch", { cat: "Milch & Eier", icon: "🥛", qty: 2 }),
    own("3", "Kichererbsen", { amount: 800, unit: "g", qty: 1 }),
    own("4", "Erledigt", { done: true }),
    own("5", "Weg", { deleted: true }),
  ];
  const snap = snapshotOf(items);
  assertEqual(snap.length, 3);
  assertEqual(snap[snap.length - 1].n, "Zahnpasta", "Sonstiges kommt zuletzt");
  const milk = snap.find((x) => x.n === "Milch");
  assertDeepEqual(milk, { n: "Milch", i: "🥛", c: "Milch & Eier", q: 2 });
  assertEqual(snap.find((x) => x.n.includes("Kichererbsen")).q, 1, "Mengen-Artikel: q=1, Menge steckt im Namen");
  assertEqual(JSON.stringify(snapshotOf(items)), JSON.stringify(snap), "deterministisch → kein unnötiges Veröffentlichen");
});

test("I3: isListed erkennt offene Artikel (auch mit Menge) und Vorschläge", () => {
  const snap = [{ n: "500ml Milch" }, { n: "Brot" }];
  assert(isListed("milch", snap));
  assert(isListed(" Brot ", snap));
  assert(!isListed("Mil", snap));
  assert(isListed("Eier", [], [{ name: "eier" }]));
  assert(!isListed("", snap));
});

test("I3: Einladungslink trägt das Token im #-Teil und lässt sich wieder lesen", () => {
  const url = inviteUrl("https://marcipane3.github.io/Citchen/v2/", "29039ea7d02793687df74994b15c652b");
  assertEqual(url, "https://marcipane3.github.io/Citchen/v2/add.html#k=29039ea7d02793687df74994b15c652b");
  assertEqual(inviteFromHash(new URL(url).hash), "29039ea7d02793687df74994b15c652b");
  assertEqual(inviteFromHash("#k=<script>"), null);
  assertEqual(inviteFromHash(""), null);
});

test("I3: author-Kodierung + seen-Begrenzung", () => {
  assertEqual(friendAuthor(" Anna "), "friend:Anna");
  assertEqual(friendAuthor(""), "friend");
  assertEqual(friendName("friend:Anna"), "Anna");
  assertEqual(friendName("friend"), "");
  assertEqual(friendName("local"), null);
  assertEqual(friendName(undefined), null);
  const seen = Array.from({ length: 350 }, (_, i) => "s" + i);
  const tr = trimSeen(seen);
  assertEqual(tr.length, 300);
  assertEqual(tr[299], "s349", "die neuesten bleiben");
});
