// Typed accessors over the legal-version registry. The raw data lives in
// `legal-registry.mjs` (plain ESM so the Node build script can import it too);
// this module layers TypeScript types + small helpers on top for the Astro
// pages/components. Keep the data itself in the .mjs — do not fork it here.

import { LEGAL_DOCS, LEGAL_DOC_KEYS } from './legal-registry.mjs';

export type LegalDocKey = 'terms' | 'privacy';

export interface LegalVersionMeta {
  /**
   * Whether existing users must actively re-consent to this version. The seed
   * versions default to false (nothing to re-consent to yet). The backend reads
   * this flag (via /legal/versions.json) to decide when to prompt.
   */
  requiresReacceptance: boolean;
}

export interface LegalDocRegistry {
  /** The version date string that the canonical /terms or /privacy renders. */
  current: string;
  /** All published, immutable versions keyed by their `YYYY-MM-DD` date slug. */
  versions: Record<string, LegalVersionMeta>;
}

export const LEGAL: Record<LegalDocKey, LegalDocRegistry> = LEGAL_DOCS;
export const LEGAL_DOCS_KEYS: LegalDocKey[] = LEGAL_DOC_KEYS;

/** The version date the canonical /terms page currently serves. */
export const CURRENT_TERMS_VERSION: string = LEGAL.terms.current;
/** The version date the canonical /privacy page currently serves. */
export const CURRENT_PRIVACY_VERSION: string = LEGAL.privacy.current;

/** Human-facing labels used by the /legal index and page titles. */
export const LEGAL_DOC_LABELS: Record<LegalDocKey, string> = {
  terms: 'Terms of Service',
  privacy: 'Privacy Policy',
};

/**
 * Version date slugs for a document, sorted newest-first. Slugs are
 * `YYYY-MM-DD` so lexical sort == chronological sort.
 */
export function listVersions(doc: LegalDocKey): string[] {
  return Object.keys(LEGAL[doc].versions).sort().reverse();
}

/** Render a `YYYY-MM-DD` slug as a human date, e.g. "April 12, 2026". */
export function formatVersionDate(version: string): string {
  const [y, m, d] = version.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
