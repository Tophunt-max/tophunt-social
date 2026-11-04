import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'assets', 'earning');
const registry = fs.readFileSync(path.join(DIR, 'index.ts'), 'utf8');
const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));

const SRC = path.join(ROOT, 'design', 'earning');

/** Width, height and alpha flag from a WebP header (VP8X, VP8L or VP8), or null when it is not a WebP. */
function webpInfo(buf: Buffer): { width: number; height: number; alpha: boolean } | null {
  if (buf.length < 30 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return null;
  if (buf.readUInt32LE(4) + 8 !== buf.length) return null;
  const chunk = buf.toString('ascii', 12, 16);
  if (chunk === 'VP8X') {
    return { alpha: (buf[20] & 0x10) !== 0, width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
  }
  if (chunk === 'VP8L') {
    const b = buf.readUInt32LE(21);
    return { width: 1 + (b & 0x3fff), height: 1 + ((b >> 14) & 0x3fff), alpha: ((b >> 28) & 1) === 1 };
  }
  if (chunk === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff, alpha: false };
  return null;
}

describe('Rewards Center artwork', () => {
  const requires = [...registry.matchAll(/require\('\.\/([^']+\.webp)'\)/g)].map((m) => m[1]);
  const webps = walk(DIR).filter((f) => f.endsWith('.webp')).map((f) => path.relative(DIR, f));
  const sources = walk(SRC).filter((f) => f.endsWith('.svg')).map((f) => path.relative(SRC, f));

  it('ships WebP only: every registry entry exists, every WebP is registered, no SVG is bundled', () => {
    expect(requires.length).toBe(48);
    for (const rel of requires) expect(fs.existsSync(path.join(DIR, rel)), rel).toBe(true);
    expect([...webps].sort()).toEqual([...new Set(requires)].sort());
    expect(walk(DIR).filter((f) => /\.(svg|png|jpe?g)$/i.test(f))).toEqual([]);
    expect(registry).not.toMatch(/\.svg'/);
  });

  it('every WebP is a valid transparent square at the documented size, and small', () => {
    let total = 0;
    for (const rel of webps) {
      const buf = fs.readFileSync(path.join(DIR, rel));
      const info = webpInfo(buf);
      expect(info, rel).not.toBeNull();
      const want = rel.startsWith('illustrations/') ? 384 : 256;
      expect(info, rel).toMatchObject({ width: want, height: want, alpha: true });
      expect(buf.length, rel).toBeLessThan(40 * 1024);
      total += buf.length;
    }
    expect(total).toBeLessThan(700 * 1024);
  });

  it('each WebP has its SVG source in design/earning (re-render with scripts/gen-earning-webp.mjs)', () => {
    expect([...sources].map((r) => r.replace(/\.svg$/, '.webp')).sort()).toEqual([...webps].sort());
  });

  it('SVG sources are self-contained, with gradient ids unique across files', () => {
    const seen = new Map<string, string>();
    for (const rel of sources) {
      const s = fs.readFileSync(path.join(SRC, rel), 'utf8');
      expect(s.startsWith('<svg'), rel).toBe(true);
      expect(s, rel).toContain('viewBox="0 0 64 64"');
      expect(s, rel).not.toMatch(/xlink:href|<image|https?:\/\/(?!www\.w3\.org)/);
      for (const [, id] of s.matchAll(/id="([^"]+)"/g)) {
        expect(seen.get(id) ?? rel, `${id} in ${rel} and ${seen.get(id)}`).toBe(rel);
        seen.set(id, rel);
      }
      for (const [, ref] of s.matchAll(/url\(#([^)]+)\)/g)) expect(s, `${rel} → #${ref}`).toContain(`id="${ref}"`);
    }
  });

  it('the claim Lottie is valid local JSON', () => {
    const anim = JSON.parse(fs.readFileSync(path.join(DIR, 'animations', 'diamond-claim.json'), 'utf8'));
    expect(anim).toMatchObject({ fr: 60, w: 200, h: 200 });
    expect(anim.layers.length).toBeGreaterThan(5);
    expect(registry).toContain("require('./animations/diamond-claim.json')");
  });

  it('the Worker override list (Earning Management → Assets) has exactly these keys and files', () => {
    const worker = fs.readFileSync(path.join(ROOT, '..', 'worker', 'src', 'lib', 'earningAssets.ts'), 'utf8');
    const listed = [...worker.matchAll(/^\s+\["(\w+)", "([^"]+\.webp)"\],$/gm)].map((m) => [m[1], m[2]]);
    const constFile = Object.fromEntries([...registry.matchAll(/const (\w+): ImageSourcePropType = require\('\.\/([^']+\.webp)'\)/g)].map((m) => [m[1], m[2]]));
    const body = registry.slice(registry.indexOf('export const EARNING_ART = {'), registry.indexOf('} satisfies'));
    const app = [...body.matchAll(/^\s+(\w+): (\w+),$/gm)].map((m) => [m[1], constFile[m[2]]]);
    expect(app.length).toBe(48);
    expect(listed).toEqual(app);
  });
});

describe('Rewards Center screen covers every reference section', () => {
  const screen = fs.readFileSync(path.join(ROOT, 'app', 'earn', 'index.tsx'), 'utf8');
  it.each([
    'Rewards Center', 'Play • Complete Tasks • Earn Rewards', 'Rewards to Claim', 'Rewards review me hain', 'Your Diamonds', 'Your XP',
    "label: 'Check-in'", "label: 'Missions'", "label: 'Weekly'", "label: 'Referral'", "label: 'Watch & Earn'", "label: 'XP Convert'",
    'Daily Streak', "Claim Today's Reward", "Today's Missions", 'Weekly Missions', 'Contest Rewards', 'Participation', 'Winner', 'Runners-up', 'Special',
    'Watch & Earn', 'Daily Limit', 'Watch Now', 'Referral Program', 'Your Code', 'Invite Now', 'XP Convert', 'Convert Now',
    'Special Events', 'LIVE', 'Join Now', 'Achievements', 'Leaderboard', 'Top Earners', 'Reward History', 'All Your Earnings',
  ])('%s', (text) => expect(screen).toContain(text));

  it('has no empty press handlers and no hard-coded balances', () => {
    expect(screen).not.toMatch(/onPress=\{\(\) => \{\s*\}\}/);
    expect(screen).not.toMatch(/2,?450|8,?750/);
  });
});

