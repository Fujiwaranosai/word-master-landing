// Legal-document version registry — SINGLE SOURCE OF TRUTH for which
// Terms/Privacy versions exist, which is current, and whether each version
// forces users to re-accept.
//
// This is a plain ESM module (NOT TypeScript) on purpose: it is imported by
// BOTH the Astro site (src/legal.ts wraps it with types) AND the Node build
// script (scripts/gen-legal-manifest.mjs) that computes content hashes. Node
// cannot import .ts directly, so the raw data lives here.
//
// APPEND-ONLY MODEL: publishing a new legal version means
//   1. create src/components/legal/<doc>/<YYYY-MM-DD>.astro (never edit an old one)
//   2. add a `<YYYY-MM-DD>` entry to `versions` below
//   3. bump `current` to the new date
//   4. set `requiresReacceptance: true` on the new version IF the change is
//      material enough that existing users must actively re-consent.
// Each entry's `<YYYY-MM-DD>` key MUST match a component filename exactly; it
// is the permanent, immutable URL slug (e.g. /terms/2026-04-12).

/**
 * @typedef {Object} LegalVersionMeta
 * @property {boolean} requiresReacceptance  Whether existing users must actively
 *   re-consent to this version (default false for the seed versions — there is
 *   nothing to re-consent to yet).
 */

/**
 * @typedef {Object} LegalDocRegistry
 * @property {string} current  The version date string that /terms or /privacy renders.
 * @property {Record<string, LegalVersionMeta>} versions  All published versions.
 */

/** @type {Record<'terms' | 'privacy', LegalDocRegistry>} */
export const LEGAL_DOCS = {
  terms: {
    current: '2026-04-12',
    versions: {
      '2026-04-12': { requiresReacceptance: false },
    },
  },
  privacy: {
    current: '2026-04-12',
    versions: {
      '2026-04-12': { requiresReacceptance: false },
    },
  },
};

/** Document keys, handy for iterating in both the site and the build script. */
export const LEGAL_DOC_KEYS = /** @type {Array<'terms' | 'privacy'>} */ (
  Object.keys(LEGAL_DOCS)
);
