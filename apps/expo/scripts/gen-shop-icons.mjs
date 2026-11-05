#!/usr/bin/env node
/**
 * Renders the Shop artwork the app ships: every SVG source in
 * apps/expo/design/shop/ becomes a transparent WebP at the same relative path
 * under apps/expo/assets/icons/shop/. The registry
 * (assets/icons/shop/index.ts) and the Worker override list
 * (apps/worker/src/lib/shopAssets.ts) name these files.
 *
 * Each file keeps its viewBox aspect ratio. Longest side per group:
 *   tiles 192 px (category / collection tiles, up to ~64 pt at 3x)
 *   art 384 px   (banners: winged crown, shop bag, chest, ornaments)
 *   icons, glyphs, ui 128 px (section and small icons, up to ~42 pt at 3x)
 * `glyphs/` and `ui/` are single-colour white line art the app tints at
 * runtime (ui/ is every functional Shop icon: cart, search, lock, time…),
 * saved lossless so the tint stays clean; the rest are lossy with
 * full-quality alpha.
 *
 * Needs sharp (with librsvg), which is not an app dependency:
 *   npm i --no-save sharp@0.34 && node apps/expo/scripts/gen-shop-icons.mjs
 * Deterministic for a given sharp/libvips version; the output is committed.
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
const SRC = path.join(HERE, '..', 'design', 'shop');
const OUT = path.join(HERE, '..', 'assets', 'icons', 'shop');
const LONG_SIDE = { tiles: 192, art: 384, icons: 128, glyphs: 128, ui: 128 };

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));

for (const file of walk(SRC).filter((f) => f.endsWith('.svg')).sort()) {
  const rel = path.relative(SRC, file);
  const group = rel.split(path.sep)[0];
  const long = LONG_SIDE[group];
  if (!long) throw new Error(`No size for group "${group}" (${rel})`);
  const svg = fs.readFileSync(file);
  const vb = /viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/.exec(svg.toString());
  if (!vb) throw new Error(`${rel}: missing viewBox`);
  const vw = Number(vb[3]);
  const vh = Number(vb[4]);
  const scale = long / Math.max(vw, vh);
  const w = Math.round(vw * scale);
  const h = Math.round(vh * scale);
  // Render well above the target so small strokes stay smooth, then downsample.
  const density = Math.ceil(72 * scale * 4);
  const out = path.join(OUT, rel.replace(/\.svg$/, '.webp'));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const img = sharp(svg, { density }).resize(w, h, { fit: 'fill', kernel: 'lanczos3' });
  await (group === 'glyphs' || group === 'ui'
    ? img.webp({ lossless: true, effort: 6 })
    : img.webp({ quality: 90, alphaQuality: 100, effort: 6, smartSubsample: true })
  ).toFile(out);
  console.log(`${rel} → ${w}x${h} ${(fs.statSync(out).size / 1024).toFixed(1)} KB`);
}
