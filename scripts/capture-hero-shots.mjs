// Capture a clipped, readable hero screenshot from the running Dell
// dev app. Output → /public/images/hero-word-detail.png at native
// resolution (no retina scaling) so the landing renders it crisp
// without forced width/height attributes squishing the aspect ratio.
//
// Strategy: the word-detail page in the app is a vertically-stacked
// single column ~520 logical px wide and several thousand px tall.
// We don't want the whole thing — we want the *most differentiating*
// part: the "Related Words & Nuances" card, which is what no other
// vocab app does. Capture that card specifically using its accessible
// heading as an anchor.
//
// Run this manually when the app UI changes substantially. Output is
// committed; the build never depends on this script being re-run.
//
// Usage:
//   1. Make sure http://word-master.local is up.
//   2. node scripts/capture-hero-shots.mjs

import { chromium } from 'playwright';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outDir = join(root, 'public', 'images');

const AUTH_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImUyZS1tYXN0ZXJ5LTE3Nzg5OTQ0MTRAbWFpbGluYXRvci5jb20iLCJuYW1lIjoiRTJFIE1hc3RlcnkgVGVzdGVyIiwicGNhIjoxNzc4OTk0NDE1NTAzLCJzdWIiOiIzOTg1YzJlNS1lMWU5LTRlMzgtOTdhNS0yMWQzNTYxY2IxZDYiLCJpYXQiOjE3Nzg5OTQ0MTUsImV4cCI6MTc3OTU5OTIxNSwiYXVkIjoid29yZC1tYXN0ZXItYXBwIiwiaXNzIjoid29yZC1tYXN0ZXIifQ.Qtq-go9a5FZq6RGVwZovJ0O7lwL1Bq9Mopqm5nE8OQo';
const REFRESH_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJwY2EiOjE3Nzg5OTQ0MTU1MDMsInN1YiI6IjM5ODVjMmU1LWUxZTktNGUzOC05N2E1LTIxZDM1NjFjYjFkNiIsImlhdCI6MTc3ODk5NDQxNSwiZXhwIjoxNzg2NzcwNDE1LCJhdWQiOiJ3b3JkLW1hc3Rlci1hcHAiLCJpc3MiOiJ3b3JkLW1hc3RlciJ9.ia0GQoNpX2ntg5jIjPIS4AVUwD5loqEZRgGVtYT1Tbw';

const WORD_DETAIL_URL =
  'http://word-master.local/words/7923be1c-b013-43cf-b9e0-1708e25fe518'; // ephemeral

async function captureCardByHeading(page, headingText, outFile, opts = {}) {
  // MUI Typography variant="h5" renders as <h5>. The heading sits
  // inside a CardContent → Card so we walk up to the Card root for
  // a clean clipped screenshot with rounded corners + shadow.
  const heading = page.locator(`h5:has-text("${headingText}")`).first();
  await heading.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);

  const cardRoot = heading.locator('xpath=ancestor::div[contains(@class, "MuiCard-root")][1]');
  await cardRoot.screenshot({ path: outFile, type: 'png', ...opts });
  console.log(`Wrote ${outFile}`);
}

async function main() {
  const userDataDir = mkdtempSync(join(tmpdir(), 'vocabmine-shot-'));
  // Desktop viewport at NATIVE resolution (no retina scaling). This
  // matches what the landing img tag will render: pixel-for-pixel.
  const browser = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
  });

  const page = await browser.newPage();

  // Seed auth on origin first.
  await page.goto('http://word-master.local/');
  await page.evaluate(
    ({ a, r }) => {
      localStorage.setItem('authToken', a);
      localStorage.setItem('refreshToken', r);
    },
    { a: AUTH_TOKEN, r: REFRESH_TOKEN },
  );

  await page.goto(WORD_DETAIL_URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('main', { timeout: 10_000 });
  // Collapse the left sidebar so the word-detail column gets more
  // horizontal room and the screenshot doesn't have a chrome strip.
  // The sidebar uses a localStorage flag.
  await page.evaluate(() => localStorage.setItem('sidebar-collapsed', 'true'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('main', { timeout: 10_000 });

  // Hide the fixed AppBar + Drawer so screenshots don't show app
  // chrome bleeding into the card. Also force the main padding to
  // 0 so cards aren't pushed down by the (now-hidden) AppBar height
  // offset.
  await page.addStyleTag({
    content: `
      .MuiAppBar-root, .MuiDrawer-root { display: none !important; }
      main { padding-top: 0 !important; margin-top: 0 !important; }
    `,
  });
  await page.waitForTimeout(800);

  // ---- Shot: Related Words & Nuances card ----
  // The single most differentiating card in the app: 6+ near-synonyms
  // with explicit nuance explanations (e.g. "fleeting stresses brevity
  // of impression with emotional focus"). No flashcard app does this.
  // Portrait aspect — landing CSS frames it as a phone/tablet-style
  // shot in the hero column.
  await captureCardByHeading(
    page,
    'Related Words & Nuances',
    join(outDir, 'hero-word-detail.png'),
  );

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
