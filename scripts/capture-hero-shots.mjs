// Capture clipped hero screenshots from the running Dell dev app.
// Output → /public/images/hero-*.png at @2x retina for crisp display
// at the landing's intended ~600px hero width.
//
// This script is run manually when the app UI changes substantially
// enough that the landing hero needs refreshing. Output is committed
// to the repo so the build never depends on the dev app being up.
//
// Usage:
//   1. Make sure the Dell dev app is up at http://word-master.local
//      and you have a freshly signed-in user with at least one
//      processed word + an active streak (the e2e-mastery user we
//      built up across recent sessions is fine).
//   2. node scripts/capture-hero-shots.mjs
//
// Requires: npx playwright (Playwright is bundled with Astro's dev
// chain on this repo's host but for safety the script uses npx in
// the runner spec).

import { chromium } from 'playwright';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outDir = join(root, 'public', 'images');

// Tokens for the e2e-mastery user we exercise across sessions. These
// are long-lived signin tokens against the Dell dev backend. If
// expired, re-sign-in via /signup or paste a fresh token here.
const AUTH_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImUyZS1tYXN0ZXJ5LTE3Nzg5OTQ0MTRAbWFpbGluYXRvci5jb20iLCJuYW1lIjoiRTJFIE1hc3RlcnkgVGVzdGVyIiwicGNhIjoxNzc4OTk0NDE1NTAzLCJzdWIiOiIzOTg1YzJlNS1lMWU5LTRlMzgtOTdhNS0yMWQzNTYxY2IxZDYiLCJpYXQiOjE3Nzg5OTQ0MTUsImV4cCI6MTc3OTU5OTIxNSwiYXVkIjoid29yZC1tYXN0ZXItYXBwIiwiaXNzIjoid29yZC1tYXN0ZXIifQ.Qtq-go9a5FZq6RGVwZovJ0O7lwL1Bq9Mopqm5nE8OQo';
const REFRESH_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJwY2EiOjE3Nzg5OTQ0MTU1MDMsInN1YiI6IjM5ODVjMmU1LWUxZTktNGUzOC05N2E1LTIxZDM1NjFjYjFkNiIsImlhdCI6MTc3ODk5NDQxNSwiZXhwIjoxNzg2NzcwNDE1LCJhdWQiOiJ3b3JkLW1hc3Rlci1hcHAiLCJpc3MiOiJ3b3JkLW1hc3RlciJ9.ia0GQoNpX2ntg5jIjPIS4AVUwD5loqEZRgGVtYT1Tbw';

const WORD_DETAIL_URL =
  'http://word-master.local/words/7923be1c-b013-43cf-b9e0-1708e25fe518'; // ephemeral

// Retina capture: render at 2x for crisp <img> rendering on hi-DPI.
const VIEWPORT = { width: 1280, height: 900, deviceScaleFactor: 2 };

async function main() {
  // Isolated profile so we don't collide with the MCP browser
  // user-data-dir that's currently holding a lockfile.
  const userDataDir = mkdtempSync(join(tmpdir(), 'vocabmine-shot-'));
  const browser = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
    viewport: VIEWPORT.width ? { width: VIEWPORT.width, height: VIEWPORT.height } : undefined,
    deviceScaleFactor: VIEWPORT.deviceScaleFactor,
  });

  const page = await browser.newPage();

  // Inject auth tokens so the SPA boots straight into authed routes.
  // localStorage has to be seeded against the SAME origin we'll then
  // navigate to, so do a no-op visit first.
  await page.goto('http://word-master.local/');
  await page.evaluate(
    ({ a, r }) => {
      localStorage.setItem('authToken', a);
      localStorage.setItem('refreshToken', r);
    },
    { a: AUTH_TOKEN, r: REFRESH_TOKEN },
  );

  // ---- Shot 1: word detail (hero) ----
  await page.goto(WORD_DETAIL_URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('main', { timeout: 10_000 });
  // Give MUI a beat to settle skeletons / fade-in transitions.
  await page.waitForTimeout(800);

  // Capture the <main> region — drops the AppBar so the visual is the
  // pure content, which composes better in the landing hero card.
  const main = await page.$('main');
  if (!main) throw new Error('main element not found on word detail');
  const heroPath = join(outDir, 'hero-word-detail.png');
  await main.screenshot({ path: heroPath, type: 'png' });
  console.log(`Wrote ${heroPath}`);

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
