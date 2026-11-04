import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'assets', 'earning');
const registry = fs.readFileSync(path.join(DIR, 'index.ts'), 'utf8');
const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));

describe('Rewards Center artwork', () => {
  const imports = [...registry.matchAll(/from '\.\/([^']+\.svg)'/g)].map((m) => m[1]);
  const svgs = walk(DIR).filter((f) => f.endsWith('.svg')).map((f) => path.relative(DIR, f));

  it('every registry import exists, and every SVG in the folder is registered', () => {
    expect(imports.length).toBeGreaterThan(40);
    for (const rel of imports) expect(fs.existsSync(path.join(DIR, rel)), rel).toBe(true);
    expect([...svgs].sort()).toEqual([...new Set(imports)].sort());
  });

  it('SVGs are self-contained, with gradient ids unique across files (safe to inline together on web)', () => {
    const seen = new Map<string, string>();
    for (const rel of svgs) {
      const s = fs.readFileSync(path.join(DIR, rel), 'utf8');
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

  it('the Worker override list (Earning Management → Assets) has exactly these keys and files', () => {
    const worker = fs.readFileSync(path.join(ROOT, '..', 'worker', 'src', 'lib', 'earningAssets.ts'), 'utf8');
    const listed = [...worker.matchAll(/^\s+\["(\w+)", "([^"]+\.svg)"\],$/gm)].map((m) => [m[1], m[2]]);
    const importName = Object.fromEntries([...registry.matchAll(/import (\w+) from '\.\/([^']+\.svg)'/g)].map((m) => [m[1], m[2]]));
    const body = registry.slice(registry.indexOf('export const EARNING_ART = {'), registry.indexOf('} satisfies'));
    const app = [...body.matchAll(/^\s+(\w+): (\w+),$/gm)].map((m) => [m[1], importName[m[2]]]);
    expect(app.length).toBe(48);
    expect(listed).toEqual(app);
  });
});

