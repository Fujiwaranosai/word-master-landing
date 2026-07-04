// Site-wide constants — change these to update branding everywhere.
// APP_URL is env-driven so the same blog markdown links to dev in dev and
// prod in prod without per-environment edits. The dev domain is used as a
// fallback only when PUBLIC_APP_URL isn't set during build.
export const SITE_NAME = 'Vocab Mine';
export const SITE_TAGLINE = 'Master words, not just memorize them.';
export const SITE_DESCRIPTION = `${SITE_TAGLINE} AI-powered vocabulary learning for serious learners.`;
export const SITE_URL = 'https://vocabmine.com';
export const APP_URL = (import.meta.env.PUBLIC_APP_URL || 'https://word-master-app.dev.nhatbui.link').replace(/\/$/, '');
export const SUPPORT_EMAIL = import.meta.env.PUBLIC_SUPPORT_EMAIL || 'support@word-master-app.dev.nhatbui.link';
export const TEAM_NAME = 'Vocab Mine Team';
export const APP_REGISTER_URL = `${APP_URL}/signup`;
export const APP_REGISTER_PRO_URL = `${APP_URL}/signup?plan=pro`;
export const APP_REGISTER_PREMIUM_URL = `${APP_URL}/signup?plan=premium`;

// Current legal-document versions. Canonical definitions + the full per-version
// registry (with `requiresReacceptance` flags) live in `./legal.ts`, which
// wraps the plain-ESM source of truth `./legal-registry.mjs`. Re-exported here
// so the version constants are discoverable alongside the other site consts.
export { CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION } from './legal';
