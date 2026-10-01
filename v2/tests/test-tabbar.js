// Tests: J2 Tab-Leiste — Tabs zeigen auf echte Routen, Labels in allen Sprachen, ☰-Menü ohne
// Doppelungen, Badge-Zählung. Rein: tabs.js/listMerge.js + Quelltext-Lesen (kein DOM).
import { test, assert, assertEqual } from "./runner.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { TABS, tabForRoute, hidesTabBar, badgeText } from "../src/ui/tabs.js";
import { countOpen } from "../src/features/shopping/listMerge.js";
import { DICT, LANGS } from "../src/i18n.js";

const v2 = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(v2, p), "utf8");
const get = (obj, key) => key.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);

test("J2: genau 5 Tabs, Reihenfolge wie entschieden (Rezepte · Lager · Einkauf · Plan · KI)", () => {
  assertEqual(TABS.map((x) => x.go).join(), "cookbook,lager,shopping,planner,assistant");
});

test("J2: jeder Tab zeigt auf eine in app.js registrierte Route", () => {
  const app = read("src/app.js");
  for (const tab of TABS) assert(app.includes(`router.register("${tab.go}"`), "Route fehlt: " + tab.go);
});

test("J2: Tab-Labels + Aria-Texte in allen Sprachen vorhanden, ohne gerade Anführungszeichen", () => {
  const keys = [...TABS.map((x) => x.k), "tab.aria", "tab.badgeAria", "nav.guide"];
  for (const { code } of LANGS) {
    for (const k of keys) {
      const v = get(DICT[code], k);
      assert(typeof v === "string" && v.length, `${code}: ${k} fehlt`);
      assert(!v.includes('"'), `${code}: ${k} enthält " (bricht aria-label)`);
    }
    for (const tab of TABS) assert(get(DICT[code], tab.k).length <= 11, `${code}: ${tab.k} zu lang für die Leiste`);
  }
});

test("J2: ☰-Menü führt keinen Hauptbereich doppelt, aber alle Nebenbereiche", () => {
  const menu = read("src/features/menu.js");
  const gos = [...menu.matchAll(/go: "([^"]+)"/g)].map((m) => m[1]);
  for (const tab of TABS) assert(!gos.includes(tab.go), "doppelt im Menü: " + tab.go);
  for (const go of ["match", "capture", "settings", "guide", "__export"]) assert(gos.includes(go), "fehlt im Menü: " + go);
});

test("J2: jede registrierte Route ist per Tab oder ☰ erreichbar (außer Kochmodus)", () => {
  const app = read("src/app.js"), menu = read("src/features/menu.js");
  const routes = [...app.matchAll(/router\.register\("([^"/]+)/g)].map((m) => m[1]);
  const reach = new Set([...TABS.map((x) => x.go), ...[...menu.matchAll(/go: "([^"]+)"/g)].map((m) => m[1])]);
  for (const r of routes) if (r !== "cook") assert(reach.has(r), "nicht erreichbar: " + r);
});

test("J2: aktiver Tab und Ausblenden je Route", () => {
  assertEqual(tabForRoute("shopping"), "shopping");
  assertEqual(tabForRoute("settings"), null);
  assertEqual(tabForRoute("match"), null);
  assert(hidesTabBar("cook"), "Kochmodus blendet die Leiste aus");
  assert(!hidesTabBar("assistant"), "Assistent zeigt die Leiste");
});

test("J2: Badge zählt nur offene Artikel (nicht gelöscht, nicht abgehakt)", () => {
  const items = [
    { id: "1", done: false, deleted: false }, { id: "2", done: true, deleted: false },
    { id: "3", done: false, deleted: true }, { id: "4" },
  ];
  assertEqual(countOpen(items), 2);
  assertEqual(countOpen([]), 0);
});

test("J2: Badge-Text leer bei 0, gekappt ab 100", () => {
  assertEqual(badgeText(0), "");
  assertEqual(badgeText(7), "7");
  assertEqual(badgeText(140), "99+");
});

test("J2: CSS — Leiste unter Sheets (50), über FAB/KI-Eingabe; FAB + KI-Eingabe sitzen darüber", () => {
  const css = read("styles/app.css");
  const z = (sel) => Number((css.match(new RegExp(sel.replace(".", "\\.") + " \\{[^}]*z-index: (\\d+)")) || [])[1]);
  assert(z(".tabbar") < z(".overlay") && z(".tabbar") > z(".fab"), "z-index-Reihenfolge");
  assert(/\.fab \{[^}]*bottom: calc\([^)]*var\(--tabbar-h\)/.test(css), "FAB über der Leiste");
  assert(/\.ai-inputbar \{[^}]*bottom: calc\(var\(--tabbar-h\)/.test(css), "KI-Eingabe über der Leiste");
});
