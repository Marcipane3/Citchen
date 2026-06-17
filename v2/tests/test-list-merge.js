// Tests: features/shopping/listMerge.js — Item-level Last-Writer-Wins-Merge (I2 + I3A).
// Ausführbare Spezifikation der Merge-Regel, bevor listSync.js den vollen Sync-Pfad
// um einkaufsliste.json ergänzt. Kritischster Fall: zwei Autoren fügen je einen eigenen
// Artikel hinzu — beide müssen nach dem Merge erhalten bleiben (REQ-I3A).
import { test, assertEqual } from "./runner.js";
import { mergeList } from "../src/features/shopping/listMerge.js";

// 1. Beide leer
test("mergeList: beide leer → leeres Array", () => {
  assertEqual(JSON.stringify(mergeList([], [])), "[]");
});

// 2. Remote-Item neuer → remote gewinnt
test("mergeList: remote item neuer → remote gewinnt", () => {
  const local  = [{ id: "li-1", name: "Feta", updated: "2026-06-17T10:00:00.000Z" }];
  const remote = [{ id: "li-1", name: "Feta XL", updated: "2026-06-17T11:00:00.000Z" }];
  const merged = mergeList(local, remote);
  assertEqual(merged[0].name, "Feta XL");
});

// 3. Lokales Item neuer → lokal gewinnt
test("mergeList: lokales item neuer → lokal gewinnt", () => {
  const local  = [{ id: "li-1", name: "Milch", updated: "2026-06-17T12:00:00.000Z" }];
  const remote = [{ id: "li-1", name: "Milch alt", updated: "2026-06-17T09:00:00.000Z" }];
  const merged = mergeList(local, remote);
  assertEqual(merged[0].name, "Milch");
});

// 4. Tombstone deleted:true propagiert Löschung
test("mergeList: deleted:true tombstone bleibt erhalten (propagiert Löschung)", () => {
  const local  = [{ id: "li-1", name: "Ei", deleted: false, updated: "T1" }];
  const remote = [{ id: "li-1", name: "Ei", deleted: true,  updated: "T2" }];
  const merged = mergeList(local, remote);
  assertEqual(merged[0].deleted, true);
});

// 5. Zwei Autoren, verschiedene IDs → beide bleiben (REQ-I3A)
test("mergeList: zwei Autoren fügen verschiedene Artikel hinzu → beide bleiben", () => {
  const local  = [{ id: "li-1", name: "Käse",  author: "marcel",  updated: "T1" }];
  const remote = [{ id: "li-2", name: "Wasser", author: "partner", updated: "T1" }];
  const merged = mergeList(local, remote);
  assertEqual(merged.length, 2);
});

// 6. Idempotent: mergeList(merged, merged) ist stabil
test("mergeList: idempotent — mergeList(merged, merged) ist stabil", () => {
  const items  = [{ id: "li-1", name: "Tomate", updated: "T1" }];
  const merged = mergeList(items, items);
  assertEqual(merged.length, 1);
  assertEqual(merged[0].id, "li-1");
});

// 7. Gleichzeitige Adds beider Seiten — merged length === 2 (REQ-I3A multi-party)
test("mergeList: gleichzeitige Adds beider Seiten → beide Artikel im Ergebnis", () => {
  const local  = [{ id: "li-a", name: "Brot",   author: "marcel",  updated: "2026-06-17T08:00:00.000Z" }];
  const remote = [{ id: "li-b", name: "Butter", author: "partner", updated: "2026-06-17T08:01:00.000Z" }];
  const merged = mergeList(local, remote);
  assertEqual(merged.length, 2);
});
