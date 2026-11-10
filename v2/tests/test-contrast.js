// Tests: Kontrast kleiner Schrift auf Akzent-Flächen (#39, QA UX-18). WCAG AA verlangt ≥ 4,5:1.
// Rechnet mit den echten Werten aus styles/tokens.css und den Regeln in styles/app.css — in beiden
// Themes. Reiner Node-Test (fs), kein DOM.
import { test, assert } from "./runner.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const styles = join(dirname(fileURLToPath(import.meta.url)), "..", "styles");
const tokensCss = readFileSync(join(styles, "tokens.css"), "utf8");
const appCss = readFileSync(join(styles, "app.css"), "utf8");

/** Alle --token: wert; eines Blocks, der mit `selector {` beginnt. */
function tokensOf(selector) {
  const start = tokensCss.indexOf(selector);
  assert(start >= 0, "Block fehlt in tokens.css: " + selector);
  const open = tokensCss.indexOf("{", start), close = tokensCss.indexOf("}", open);
  const out = {};
  for (const m of tokensCss.slice(open, close).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const light = tokensOf(":root {");
const themes = {
  hell: light,
  "dunkel (System)": { ...light, ...tokensOf(':root:not([data-theme="light"])') },
  "dunkel (gewählt)": { ...light, ...tokensOf(':root[data-theme="dark"]') },
};

function hex(value, tokens) {
  const v = value.trim().replace(/^var\((--[\w-]+)\)$/, (_, name) => tokens[name] ?? "");
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
  assert(m, `kein Hex-Farbwert: „${value}“ → „${v}“`);
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}

function luminance(rgb) {
  const [r, g, b] = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** background + color der ersten Regel mit genau diesem Selektor in app.css. */
function ruleColors(selector) {
  const re = new RegExp("(^|\\n)" + selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\{([^}]*)\\}");
  const m = re.exec(appCss);
  assert(m, "Regel fehlt in app.css: " + selector);
  const bg = /background:\s*([^;]+);/.exec(m[2]), fg = /(?:^|[;\s])color:\s*([^;]+);/.exec(m[2]);
  assert(bg && fg, selector + " braucht background und color");
  return { bg: bg[1], fg: fg[1] };
}

test("Kontrast-Rechner: Schwarz auf Weiß = 21:1, Weiß auf altem Akzent < 4,5:1", () => {
  assert(Math.abs(contrast([0, 0, 0], [1, 1, 1]) - 21) < 0.01);
  assert(contrast(hex("#fff", {}), hex("#c8632e", {})) < 4.5, "der alte Wert war der Befund (UX-18)");
});

for (const selector of [".sl-undo-btn", ".tab-badge"]) {
  for (const [name, tokens] of Object.entries(themes)) {
    test(`#39: ${selector} erreicht ≥ 4,5:1 im Theme ${name}`, () => {
      const { bg, fg } = ruleColors(selector);
      const ratio = contrast(hex(fg, tokens), hex(bg, tokens));
      assert(ratio >= 4.5, `${selector} (${name}): ${fg} auf ${bg} = ${ratio.toFixed(2)}:1`);
    });
  }
}
