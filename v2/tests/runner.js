// runner.js — Mini-Testframework ohne Abhängigkeiten (läuft in Node ≥ 18).

let tests = [];
let only = [];

export function test(name, fn) { tests.push({ name, fn }); }
test.only = (name, fn) => only.push({ name, fn });

export function assert(cond, msg = "Assertion fehlgeschlagen") {
  if (!cond) throw new Error(msg);
}

export function assertEqual(actual, expected, msg = "") {
  if (actual !== expected) {
    throw new Error(`${msg}\n  erwartet: ${JSON.stringify(expected)}\n  erhalten: ${JSON.stringify(actual)}`);
  }
}

export function assertDeepEqual(actual, expected, msg = "") {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) {
    throw new Error(`${msg}\n  erwartet: ${b}\n  erhalten: ${a}`);
  }
}

export async function run() {
  const list = only.length ? only : tests;
  let pass = 0, fail = 0;
  const failures = [];
  for (const t of list) {
    try {
      await t.fn();
      pass++;
      console.log(`  ✓ ${t.name}`);
    } catch (e) {
      fail++;
      failures.push({ name: t.name, error: e });
      console.error(`  ✗ ${t.name}\n    ${e.message.split("\n").join("\n    ")}`);
    }
  }
  console.log(`\n${pass} bestanden, ${fail} fehlgeschlagen, ${list.length} gesamt`);
  return { pass, fail, failures };
}
