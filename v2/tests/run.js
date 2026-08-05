// run.js — Test-Einstieg: `node v2/tests/run.js`
// Läuft komplett offline, ohne API-Key, ohne Abhängigkeiten.
import "./test-schema.js";
import "./test-derive.js";
import "./test-migrate.js";
import "./test-filter.js";
import "./test-planner.js";
import "./test-shopping.js";
import "./test-ai.js";
import "./test-capture.js";
import "./test-lager.js";
import "./test-i18n.js";
import "./test-baselang.js";
import "./test-sw-shell.js";
import "./test-module-syntax.js";
import "./test-decide-sync.js";
import "./test-list-merge.js";
import "./test-canonical.js";
import { run } from "./runner.js";

const { fail } = await run();
process.exit(fail ? 1 : 0);
