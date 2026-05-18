// One-shot generator for the default OG / Twitter-card image.
// Renders a 1200x630 PNG from an inline SVG into /public/og-image.png.
// Re-run only when the tagline or visual identity changes — output is
// committed so the build doesn't depend on this script at all.
//
// Usage: node scripts/generate-og-image.mjs

import sharp from 'sharp';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outPath = join(root, 'public', 'og-image.png');

// Read the brand colour off the existing logo PNG so a future palette
// change to the logo file alone keeps the OG card in sync.
const logoPath = join(root, 'public', 'images', 'logo-light.png');
const hasLogo = existsSync(logoPath);

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
    <radialGradient id="glow" cx="80%" cy="20%" r="70%">
      <stop offset="0%" stop-color="#2563eb" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#2563eb" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>

  <!-- subtle bottom-left grid hint, low-opacity -->
  <g stroke="#334155" stroke-width="1" opacity="0.25">
    <line x1="0"  y1="540" x2="1200" y2="540"/>
    <line x1="0"  y1="580" x2="1200" y2="580"/>
  </g>

  <!-- title block -->
  <g transform="translate(80, 200)">
    <text x="0" y="0" font-family="-apple-system, BlinkMacSystemFont, Inter, 'Segoe UI', Roboto, sans-serif"
          font-size="84" font-weight="800" fill="#f8fafc" letter-spacing="-1">Vocab Mine</text>
    <text x="0" y="100" font-family="-apple-system, BlinkMacSystemFont, Inter, 'Segoe UI', Roboto, sans-serif"
          font-size="40" font-weight="600" fill="#e2e8f0">Master words, not just memorize them.</text>
    <text x="0" y="170" font-family="-apple-system, BlinkMacSystemFont, Inter, 'Segoe UI', Roboto, sans-serif"
          font-size="28" font-weight="400" fill="#94a3b8">AI-powered nuance, context, and real-usage learning.</text>
  </g>

  <!-- pill -->
  <g transform="translate(80, 480)">
    <rect x="0" y="0" rx="26" ry="26" width="320" height="52" fill="#2563eb"/>
    <text x="28" y="34" font-family="-apple-system, BlinkMacSystemFont, Inter, 'Segoe UI', Roboto, sans-serif"
          font-size="22" font-weight="700" fill="#ffffff">Start free at vocabmine</text>
  </g>
</svg>
`;

async function main() {
  let img = sharp(Buffer.from(svg));

  if (hasLogo) {
    // Composite the logo into the top-right. Reading once into memory
    // is fine for a one-shot script.
    const logoBuf = readFileSync(logoPath);
    const logo = await sharp(logoBuf).resize({ width: 140, height: 140, fit: 'contain' }).toBuffer();
    img = img.composite([{ input: logo, top: 70, left: 1200 - 140 - 80 }]);
  }

  const png = await img.png({ compressionLevel: 9 }).toBuffer();
  writeFileSync(outPath, png);
  console.log(`Wrote ${outPath} (${png.length.toLocaleString()} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
