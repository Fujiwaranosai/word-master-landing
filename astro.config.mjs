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
          ? 'User-agent: *\nDisallow:\n\nSitemap: https://vocabmaster.nhatbui.link/sitemap-index.xml\n'
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
  site: 'https://vocabmaster.nhatbui.link',
  // @astrojs/sitemap runs before seoIntegration so the sitemap file
  // is written first; seoIntegration then finalises robots.txt that
  // references it.
  integrations: [sitemap(), seoIntegration()],
});
