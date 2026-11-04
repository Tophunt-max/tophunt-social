#!/usr/bin/env node
/**
 * Renders the Rewards Center artwork the app ships: every SVG source in
 * apps/expo/design/earning/ (made by gen-earning-assets.py) becomes a
 * transparent WebP at the same relative path under apps/expo/assets/earning/.
 *
 * The raster finish is what the SVGs can't carry on every platform
 * (react-native-svg has no blur filters):
 *   1. the art is rendered at high density, scaled to 88% of the canvas so the
 *      effects have room and are never clipped;
 *   2. a soft outer glow in the art's own dominant colour;
 *   3. a soft drop shadow below it;
 *   4. a light top-left sheen clipped to the art;
 *   5. a small saturation lift.
 * Output: 256x256 (illustrations 384x384), lossy WebP with full-quality alpha.
 * This covers the largest slot (92 pt) at 3x on phones.
 *
 * Needs sharp (with librsvg), which is not an app dependency:
 *   npm i --no-save sharp@0.34 && node apps/expo/scripts/gen-earning-webp.mjs
 * Deterministic for a given sharp/libvips version; the output is committed.
 */
import { Buffer } from 'node:buffer';
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
const SRC = path.join(HERE, '..', 'design', 'earning');
const OUT = path.join(HERE, '..', 'assets', 'earning');
const SIZE = { default: 256, illustrations: 384 };

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));

async function render(file) {
  const rel = path.relative(SRC, file);
  const S = SIZE[rel.split(path.sep)[0]] ?? SIZE.default;
  const inner = Math.round(S * 0.88);
  const off = Math.round((S - inner) / 2);
  const svg = fs.readFileSync(file);

  // 1. Art, rendered from vector at high density (no upscaling blur).
  const art = await sharp(svg, { density: Math.ceil((72 * inner) / 64) * 2 })
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .modulate({ saturation: 1.08 })
    .png()
    .toBuffer();
  const alpha = await sharp(art).extractChannel(3).toBuffer();
  const { dominant } = await sharp(art).stats();

  const tinted = async (color, opacity) =>
    sharp({ create: { width: inner, height: inner, channels: 3, background: color } })
      .joinChannel(await sharp(alpha).linear(opacity, 0).toBuffer())
      .png()
      .toBuffer();
  // sharp always composites last in a pipeline, so place first, then blur.
  const blurred = async (buf, sigma, dy = 0) => {
    const placed = await sharp({ create: { width: S, height: S, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: buf, left: off, top: off + dy }])
      .png()
      .toBuffer();
    return sharp(placed).blur(sigma).png().toBuffer();
  };

  // 2. Outer glow (dominant colour) and 3. drop shadow (deep purple, offset down).
  const glow = await blurred(await tinted(dominant, 0.55), S * 0.035);
  const shadow = await blurred(await tinted({ r: 20, g: 6, b: 40 }, 0.5), S * 0.022, Math.round(S * 0.025));

  // 4. Sheen: a white radial highlight, kept only where the art is.
  const sheenSvg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${inner}" height="${inner}"><defs><radialGradient id="g" cx="0.32" cy="0.22" r="0.6">` +
      `<stop offset="0" stop-color="#fff" stop-opacity="0.32"/><stop offset="0.6" stop-color="#fff" stop-opacity="0.06"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>` +
      `</radialGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`,
  );
  const lit = await sharp(art).composite([{ input: sheenSvg, blend: 'atop' }]).png().toBuffer();

  const out = path.join(OUT, rel.replace(/\.svg$/, '.webp'));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await sharp({ create: { width: S, height: S, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: glow }, { input: shadow }, { input: lit, left: off, top: off }])
    .webp({ quality: 92, alphaQuality: 100, effort: 6, smartSubsample: true })
    .toFile(out);
  return { rel: path.relative(OUT, out), size: S, bytes: fs.statSync(out).size };
}

const files = walk(SRC).filter((f) => f.endsWith('.svg')).sort();
let total = 0;
for (const f of files) {
  const r = await render(f);
  total += r.bytes;
  console.log(`${r.rel.padEnd(42)} ${r.size}px ${(r.bytes / 1024).toFixed(1)} KB`);
}
console.log(`wrote ${files.length} webp, ${(total / 1024).toFixed(0)} KB total`);
