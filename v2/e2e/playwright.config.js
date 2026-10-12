// playwright.config.js — E2E-Suite für Koch v2. Dev-only: nichts hiervon wird an Nutzer ausgeliefert.
// Start: siehe README.md in diesem Ordner (`npm test`).
import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

const PORT = Number(process.env.E2E_PORT || 4173);
// In der Claude-Code-Cloud liegt Chromium vorinstalliert hier; lokal lädt `npx playwright install chromium` es.
const CHROMIUM = process.env.E2E_CHROMIUM || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0, // Flake = Bug: lieber rot als stillschweigend wiederholt
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 390, height: 844 }, // Handy-Format (Marcels Hauptgerät)
    locale: "de-DE",
    timezoneId: "Europe/Copenhagen",
    serviceWorkers: "block", // deterministisch; Offline-/Update-Tests schalten ihn gezielt an
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: CHROMIUM ? { executablePath: CHROMIUM } : {},
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: {
    command: `node support/server.js --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/v2/`,
    reuseExistingServer: !process.env.CI,
    stdout: "ignore",
  },
});
