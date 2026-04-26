// Site-wide constants — change these to update branding everywhere.
// APP_URL is env-driven so the same blog markdown links to dev in dev and
// prod in prod without per-environment edits. The dev domain is used as a
// fallback only when PUBLIC_APP_URL isn't set during build.
export const SITE_NAME = 'Vocab Mine';
export const SITE_TAGLINE = 'Master words, not just memorize them.';
export const SITE_DESCRIPTION = `${SITE_TAGLINE} AI-powered vocabulary learning for serious learners.`;
export const SITE_URL = 'https://vocabmaster.nhatbui.link';
export const APP_URL = (import.meta.env.PUBLIC_APP_URL || 'https://word-master-app.dev.nhatbui.link').replace(/\/$/, '');
export const SUPPORT_EMAIL = import.meta.env.PUBLIC_SUPPORT_EMAIL || 'support@word-master-app.dev.nhatbui.link';
export const TEAM_NAME = 'Vocab Mine Team';
export const APP_REGISTER_URL = `${APP_URL}/signup`;
export const APP_REGISTER_PRO_URL = `${APP_URL}/signup?plan=pro`;
export const APP_REGISTER_PREMIUM_URL = `${APP_URL}/signup?plan=premium`;
