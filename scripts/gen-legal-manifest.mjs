// Build-time generator for the legal-version hash manifest.
//
// Emits `public/legal/versions.json` — the SOURCE OF TRUTH the backend later
// reads to stamp consent records against the exact text a user agreed to. It
// runs before `astro build` (see the "build" script in package.json) so Astro
// copies the fresh manifest from public/ into dist/, served at
// /legal/versions.json.
//
// For each registered version it computes a sha256 over the NORMALIZED SOURCE
// TEXT of that version's component, so the hash tracks meaning rather than
// markup and is reproducible (same content -> same hash across builds/machines).
//
// NORMALIZATION (deterministic, order matters):
//   1. Strip the Astro frontmatter block (the leading `---` ... `---`).
//   2. Remove HTML/Astro tags (`<...>`), replacing each with a space.
//   3. Decode a small set of common HTML entities (&amp; &lt; &gt; &quot;
//      &#39; &nbsp;) so escaped punctuation hashes as its real character.
//   4. Normalize line endings and collapse every run of whitespace to a single
//      space, then trim.
// Interpolation expressions like `{SITE_NAME}` are intentionally left as
// literal tokens: they are NOT resolved. Resolving them would fold in
// env-driven values (e.g. SUPPORT_EMAIL) and make the hash differ per
// environment. Treating them as stable placeholders keeps the hash purely a
// function of the committed source text.
//
// Manifest shape:
//   { "terms":   { "current": "<date>", "versions": { "<date>": { "sha256": "…", "requiresReacceptance": bool } } },
//     "privacy": { "current": "<date>", "versions": { "<date>": { … } } } }
//
// Usage: node scripts/gen-legal-manifest.mjs

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEGAL_DOCS, LEGAL_DOC_KEYS } from '../src/legal-registry.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

/** Extract normalized, tag-free source text from a legal version component. */
function normalizeSource(raw) {
  let text = raw;
  // 1. Strip leading Astro frontmatter (--- ... ---).
  text = text.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
  // 2. Remove tags.
  text = text.replace(/<[^>]+>/g, ' ');
  // 3. Decode common HTML entities.
  const entities = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&nbsp;': ' ',
  };
  text = text.replace(/&amp;|&lt;|&gt;|&quot;|&#39;|&nbsp;/g, (m) => entities[m]);
  // 4. Normalize line endings + collapse whitespace.
  text = text.replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim();
  return text;
}

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

const manifest = {};

for (const doc of LEGAL_DOC_KEYS) {
  const { current, versions } = LEGAL_DOCS[doc];
  const versionEntries = {};

  // Sort keys so the emitted JSON is byte-stable regardless of insertion order.
  for (const version of Object.keys(versions).sort()) {
    const componentPath = join(
      root,
      'src',
      'components',
      'legal',
      doc,
      `${version}.astro`,
    );
    let raw;
    try {
      raw = readFileSync(componentPath, 'utf8');
    } catch {
      throw new Error(
        `Legal version "${doc}/${version}" is registered but its component is ` +
          `missing: ${componentPath}`,
      );
    }
    versionEntries[version] = {
      sha256: sha256(normalizeSource(raw)),
      requiresReacceptance: versions[version].requiresReacceptance === true,
    };
  }

  manifest[doc] = { current, versions: versionEntries };
}

const outDir = join(root, 'public', 'legal');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'versions.json');
// Trailing newline keeps the file POSIX-clean and diff-friendly.
writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

const count = LEGAL_DOC_KEYS.reduce(
  (n, d) => n + Object.keys(manifest[d].versions).length,
  0,
);
console.log(
  `legal manifest generated: ${count} version(s) across ${LEGAL_DOC_KEYS.length} document(s) -> public/legal/versions.json`,
);
