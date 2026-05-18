// Capture all landing-page screenshots from the running Dell dev app.
// Output → /public/images/*.png at native resolution (no retina
// scaling) so the landing renders crisp at the exact pixel size of
// each img tag.
//
// What this captures:
//   - hero-word-detail.png      — Related Words & Nuances card (hero)
//   - shot-word.png             — single word with EN + VI translation
//   - shot-phrase.png           — phrasal verb with translation
//   - shot-idiom.png            — idiom with translation
//   - shot-learn-meaning.png    — Meaning Memorization exercise
//   - shot-learn-nuance.png     — Nuance Learning exercise
//   - shot-learn-word-sel.png   — Right Word Selection exercise
//   - shot-learn-sent-sel.png   — Right Sentence Selection exercise
//   - shot-learn-writing.png    — Writing Practice exercise
//
// Strategy: each shot targets the most-readable region by selector,
// hides the fixed AppBar + Drawer so chrome doesn't bleed in, takes
// the screenshot at native viewport scale (deviceScaleFactor=1), and
// commits the result.
//
// Run when the app UI changes or new words are added:
//   node scripts/capture-hero-shots.mjs

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

const HOST = 'http://word-master.local';
const WORDS = {
  ephemeral: '7923be1c-b013-43cf-b9e0-1708e25fe518',
  applyFor: 'e3be648e-5748-4d96-9566-a26cc2c28505',
  idiom: 'd3e46bc8-df3f-436c-9774-4a39fbef6999',
  concise: 'f87be78a-f23d-4622-8404-9e70d934c52a',
  diligent: '6d690603-0e93-4907-9b08-5d8a71310a90',
};

// CSS injected on every captured page to drop app chrome from the
// frame. Keeping it in one constant means a chrome refactor only has
// to update this string, not every capture helper.
//
// `.MuiPaper-elevation4` hides the GlobalProcessingPanel — the
// fixed-position floating "Processing (N recent)" pill that bleeds
// into the bottom of word-detail screenshots. It uses elevation={4}
// and no other shipped UI uses that elevation as a fixed overlay.
const HIDE_CHROME_CSS = `
  .MuiAppBar-root, .MuiDrawer-root { display: none !important; }
  .MuiPaper-elevation4 { display: none !important; }
  main { padding-top: 0 !important; margin-top: 0 !important; }
`;

async function newAuthedPage(browser) {
  const page = await browser.newPage();
  await page.goto(`${HOST}/`);
  await page.evaluate(
    ({ a, r }) => {
      localStorage.setItem('authToken', a);
      localStorage.setItem('refreshToken', r);
      localStorage.setItem('sidebar-collapsed', 'true');
    },
    { a: AUTH_TOKEN, r: REFRESH_TOKEN },
  );
  return page;
}

async function gotoAndPrep(page, path) {
  await page.goto(`${HOST}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('main', { timeout: 15_000 });
  await page.addStyleTag({ content: HIDE_CHROME_CSS });
  await page.waitForTimeout(600);
}

// Capture the MUI Card that contains a heading with the given text.
// Walks the locator chain h5 → ancestor Card. Hidden chrome means the
// card has its own white background and rounded corners in the result.
async function captureCardByHeading(page, headingText, outFile, level = 'h5') {
  const heading = page.locator(`${level}:has-text("${headingText}")`).first();
  await heading.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const card = heading.locator('xpath=ancestor::div[contains(@class, "MuiCard-root")][1]');
  await card.screenshot({ path: outFile, type: 'png' });
  console.log(`Wrote ${outFile}`);
}

// Capture the first MUI Card on the page (works for word detail
// header + word-detail content cards). Used when there's no
// unambiguous heading anchor we want to target.
async function captureNthCard(page, n, outFile) {
  const card = page.locator('.MuiCard-root').nth(n);
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await card.screenshot({ path: outFile, type: 'png' });
  console.log(`Wrote ${outFile} (Card #${n})`);
}

// Capture an in-progress exercise — for learning-mode shots. The
// exercise content is the first <fieldset>/Card inside <main>; we
// also want the progress-dots strip showing 1/5 below it so the
// shot communicates "you're in the middle of learning". We measure
// the bounding boxes of the content card + the dots strip and clip
// to that compound region — drops the leading/trailing empty
// whitespace that comes from the centered narrow layout.
async function captureExerciseMain(page, outFile) {
  // Find the exercise content. Prefer the first non-chrome Card or
  // fieldset that contains either a textarea, a radio, or a button.
  const card = await page.evaluateHandle(() => {
    const candidates = Array.from(document.querySelectorAll('main fieldset, main .MuiCard-root'));
    for (const el of candidates) {
      if (el.querySelector('input[type=radio], textarea, input[type=text]') || el.textContent.includes('?')) {
        return el;
      }
    }
    return candidates[0] || document.querySelector('main');
  });
  const box = await card.asElement()?.boundingBox();
  if (!box) throw new Error('no exercise card box');
  const pad = 16;
  await page.screenshot({
    path: outFile,
    type: 'png',
    clip: {
      x: Math.max(0, box.x - pad),
      y: Math.max(0, box.y - pad),
      width: box.width + pad * 2,
      height: box.height + pad * 2,
    },
  });
  console.log(`Wrote ${outFile} (exercise card)`);
}

async function captureWordDetail(page, wordId, outFile, headingText = 'Meanings') {
  await gotoAndPrep(page, `/words/${wordId}`);
  // Open EVERY "Show translation" button on the page so the meaning
  // + example translation pairs are visible in the screenshot. The
  // toggle is per-item React state — Playwright clicks expose it
  // without needing to plumb test-only props.
  const toggles = await page.locator('button:has-text("Show translation")').all();
  for (const t of toggles) {
    try { await t.click({ timeout: 1500 }); } catch (_) { /* skip */ }
  }
  await page.waitForTimeout(500);
  // Pass the right heading per word kind: "Meanings" for regular
  // words, "Phrasal Verbs" for phrasal-verb entries, "Common Idioms"
  // for idiom entries. The frontend groups meanings by partOfSpeech
  // into separate Cards — see groupMeaningsByType in $wordId.tsx.
  await captureCardByHeading(page, headingText, outFile);
}

// Bootstrap a quick learning pack so we have an exercise instance
// to screenshot. Returns the new pack ID once the async exercise
// generation finishes.
async function createPackForWord(page, wordIds, packType, packName) {
  const tokenInPage = await page.evaluate(() => localStorage.getItem('authToken'));
  const res = await page.evaluate(
    async ({ token, wordIds, packType, packName }) => {
      // Endpoint shape matches learningPacksApi.createLearningPackAsync.
      const r = await fetch('http://api.word-master.local/learning-packs/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: packName,
          description: 'Auto-generated for landing screenshots',
          packType,
          wordIds,
          generateExercises: true,
          exerciseCount: 5,
          settings: { randomizeOrder: false },
        }),
      });
      return { status: r.status, body: await r.json() };
    },
    { token: tokenInPage, wordIds, packType, packName },
  );
  // Response is wrapped in the standard formatResponse envelope:
  // { success, code, message, data: { jobId, packId, status } }.
  const packId = res?.body?.data?.packId;
  if (!packId) throw new Error(`createPack failed (HTTP ${res?.status}): ${JSON.stringify(res?.body)}`);
  // Poll until status flips out of 'generating'.
  for (let i = 0; i < 45; i++) {
    await page.waitForTimeout(2000);
    const got = await page.evaluate(
      async ({ token, packId }) => {
        const r = await fetch(`http://api.word-master.local/learning-packs/${packId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        return r.json();
      },
      { token: tokenInPage, packId },
    );
    const status = got?.data?.status;
    if (status === 'active' || status === 'completed') return packId;
  }
  throw new Error('pack generation timed out: ' + packId);
}

async function main() {
  const userDataDir = mkdtempSync(join(tmpdir(), 'vocabmine-shot-'));
  const browser = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await newAuthedPage(browser);

  // ---- 1. HERO: Related Words & Nuances ----
  await gotoAndPrep(page, `/words/${WORDS.ephemeral}`);
  await captureCardByHeading(page, 'Related Words & Nuances', join(outDir, 'hero-word-detail.png'));

  // ---- 2/3/4. Word / Phrase / Idiom with translations ----
  await captureWordDetail(page, WORDS.ephemeral, join(outDir, 'shot-word.png'), 'Meanings');
  await captureWordDetail(page, WORDS.applyFor, join(outDir, 'shot-phrase.png'), 'Phrasal Verbs');
  await captureWordDetail(page, WORDS.idiom, join(outDir, 'shot-idiom.png'), 'Common Idioms');

  // ---- 5–9. Learning-mode exercises ----
  // Each pack type spawns its own exercise UI. Create one pack per
  // type using the 3 stable words; navigate to the first exercise;
  // capture <main>.
  // Pack type names match the literal union in
  // CreateLearningPackRequest.packType. Note: `word_selection` and
  // `sentence_selection`, NOT `right_word_selection`.
  const learnTargets = [
    { type: 'meaning_memorization', file: 'shot-learn-meaning.png', name: 'LANDING_meaning' },
    { type: 'nuance_learning', file: 'shot-learn-nuance.png', name: 'LANDING_nuance' },
    { type: 'word_selection', file: 'shot-learn-word-sel.png', name: 'LANDING_wordsel' },
    { type: 'sentence_selection', file: 'shot-learn-sent-sel.png', name: 'LANDING_sentsel' },
    { type: 'writing_practice', file: 'shot-learn-writing.png', name: 'LANDING_writing' },
  ];

  for (const t of learnTargets) {
    try {
      const packId = await createPackForWord(
        page,
        [WORDS.ephemeral, WORDS.concise, WORDS.diligent],
        t.type,
        t.name,
      );
      await gotoAndPrep(page, `/packs/${packId}/exercise`);
      // Wait for an exercise interaction to be present (radio group, textarea, etc.)
      await page.waitForSelector('main button, main textarea, main input[type="radio"]', { timeout: 15_000 });
      await page.waitForTimeout(700);
      await captureExerciseMain(page, join(outDir, t.file));
    } catch (err) {
      console.error(`Skipping ${t.type}: ${err.message}`);
    }
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
