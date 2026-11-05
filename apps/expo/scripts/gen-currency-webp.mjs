#!/usr/bin/env node
/**
 * Builds the app-wide currency icons (💎 Diamond, 🪙 DP coin, ⚡ XP) from the
 * source PNGs in apps/expo/assets/images:
 *   Diamond.png → currency/diamond.webp
 *   DP Coin.png → currency/dp-coin.webp
 *   XP.png      → currency/xp.webp
 * Each is trimmed of transparent margin, centred on a square transparent canvas
 * (SIZE px, enough for the largest slot, ~60 pt, at 3x) and saved as lossy WebP
 * with full-quality alpha. DiamondIcon, CoinIcon and XpIcon draw these files.
 *
 * Needs sharp, which is not an app dependency:
 *   npm i --no-save sharp@0.34 && node apps/expo/scripts/gen-currency-webp.mjs
 * The output is committed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let sharp;
try {
  sharp = require(process.env.SHARP_PATH || 'sharp');
} catch {
  console.error('sharp is not installed. Run: npm i --no-save sharp@0.34 (or set SHARP_PATH).');
  process.exit(1);
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, '..', 'assets', 'images');
const OUT = path.join(HERE, '..', 'assets', 'images', 'currency');
const SIZE = 192;
const JOBS = [
  ['Diamond.png', 'diamond.webp'],
  ['DP Coin.png', 'dp-coin.webp'],
  ['XP.png', 'xp.webp'],
];

fs.mkdirSync(OUT, { recursive: true });
for (const [src, out] of JOBS) {
  const trimmed = await sharp(path.join(SRC, src)).trim({ threshold: 1 }).png().toBuffer();
  await sharp(trimmed)
    .resize(SIZE, SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: 'lanczos3' })
    .webp({ quality: 82, alphaQuality: 100, effort: 6, smartSubsample: true })
    .toFile(path.join(OUT, out));
  const before = fs.statSync(path.join(SRC, src)).size;
  const after = fs.statSync(path.join(OUT, out)).size;
  console.log(`${src} (${(before / 1024).toFixed(0)} KB) → currency/${out} (${(after / 1024).toFixed(1)} KB)`);
}
