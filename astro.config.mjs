import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

function seoIntegration() {
  return {
    name: 'seo-integration',
    hooks: {
      'astro:build:done': ({ dir }) => {
        const allowIndexing = process.env.PUBLIC_ALLOW_INDEXING === 'true';
        // robots.txt points crawlers at the sitemap when indexing is
        // allowed. The sitemap file is always emitted (cheap); robots
        // is what actually gates crawling.
        const robotsTxt = allowIndexing
          ? 'User-agent: *\nDisallow:\n\nSitemap: https://vocabmine.com/sitemap-index.xml\n'
          : 'User-agent: *\nDisallow: /\n';

        const outDir = fileURLToPath(dir);
        writeFileSync(join(outDir, 'robots.txt'), robotsTxt);
        console.log(`robots.txt generated (indexing ${allowIndexing ? 'allowed' : 'blocked'})`);
      },
    },
  };
}

export default defineConfig({
  output: 'static',
  site: 'https://vocabmine.com',
  // @astrojs/sitemap runs before seoIntegration so the sitemap file
  // is written first; seoIntegration then finalises robots.txt that
  // references it.
  integrations: [
    sitemap({
      // Keep noindex pages out of the sitemap so it only advertises the
      // canonical, indexable URLs. The per-version legal pages
      // (/terms/<date>, /privacy/<date>) and the /legal version index are
      // noindex (see their BaseLayout `noindex` prop) — only the canonical
      // /terms and /privacy should be indexed.
      filter: (page) =>
        !/\/(terms|privacy)\/\d{4}-\d{2}-\d{2}\/?$/.test(page) &&
        !/\/legal\/?$/.test(page),
    }),
    seoIntegration(),
  ],
});
