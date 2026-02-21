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
        const robotsTxt = allowIndexing
          ? 'User-agent: *\nDisallow:\n'
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
  integrations: [seoIntegration()],
});
