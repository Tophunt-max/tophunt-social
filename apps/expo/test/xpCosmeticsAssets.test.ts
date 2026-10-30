import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.join(__dirname, '..');
const XP = path.join(ROOT, 'assets', 'xp');
const read = (p: string) => fs.readFileSync(path.join(XP, p), 'utf8');
const bin = (p: string) => fs.readFileSync(path.join(XP, p));

const EXPECTED = {
  frames: ['default', 'green-leaf', 'blue-wave', 'pink-heart', 'star-light', 'fire-ring', 'ice-crystal', 'nature', 'purple-aura', 'rainbow'],
  themes: ['default', 'sunny-day', 'cherry-blossom', 'ocean-wave', 'sunset', 'forest', 'night-sky', 'city-lights', 'cloud-fantasy', 'minimal-dark'],
  badges: ['newbie', 'active-user', 'first-post', 'supporter', 'voter', 'commenter', 'social', 'explorer', 'streak', 'dedicated'],
  titles: ['new-member', 'rising-user', 'creative-mind', 'friendly-soul', 'active-user', 'vote-lover', 'comment-pro', 'social-star', 'contest-player', 'community-hero'],
} as const;

const isWebp = (p: string) => {
  const b = bin(p);
  return b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP';
};

describe('XP40 free artwork contract', () => {
  it('has exactly ten source directories in each required category', () => {
    for (const [category, names] of Object.entries(EXPECTED)) {
      const dirs = fs.readdirSync(path.join(XP, category), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
      expect(dirs, category).toEqual([...names].sort());
    }
  });

  it('uses exact source canvases, optimized WebP outputs and text-free badge/title art', () => {
    for (const name of EXPECTED.frames) {
      expect(read(`frames/${name}/source.svg`)).toMatch(/<svg[^>]+viewBox="0 0 512 512"[^>]+width="512"[^>]+height="512"|<svg[^>]+width="512"[^>]+height="512"[^>]+viewBox="0 0 512 512"/);
      expect(isWebp(`frames/${name}/thumb.webp`)).toBe(true);
    }
    for (const name of EXPECTED.themes) {
      expect(read(`themes/${name}/source.svg`)).toMatch(/viewBox="0 0 1920 1080"/);
      expect(isWebp(`themes/${name}/theme.webp`)).toBe(true);
      expect(isWebp(`themes/${name}/thumb.webp`)).toBe(true);
    }
    for (const name of EXPECTED.badges) {
      const source = read(`badges/${name}/source.svg`);
      expect(source).toMatch(/viewBox="0 0 512 512"/);
      expect(source).not.toMatch(/<text\b/i);
      expect(isWebp(`badges/${name}/badge.webp`)).toBe(true);
      expect(isWebp(`badges/${name}/thumb.webp`)).toBe(true);
    }
    for (const name of EXPECTED.titles) {
      const source = read(`titles/${name}/source.svg`);
      expect(source).toMatch(/viewBox="0 0 800 240"/);
      expect(source).not.toMatch(/<text\b/i);
      expect(isWebp(`titles/${name}/thumb.webp`)).toBe(true);
    }
  });

  it('registers exactly 40 statically referenced XP40 items, 10 per type', () => {
    const source = read('index.ts');
    const block = source.slice(source.indexOf('export const XP40_ART'), source.indexOf('} satisfies Record<string, Xp40Entry>'));
    const keys = [...block.matchAll(/'xp40\.(frame|theme|badge|title)_[a-z_]+':/g)].map((m) => ({ key: m[0], type: m[1] }));
    expect(keys).toHaveLength(40);
    for (const type of ['frame', 'theme', 'badge', 'title']) expect(keys.filter((x) => x.type === type), type).toHaveLength(10);
    expect(new Set(keys.map((x) => x.key)).size).toBe(40);
    expect(source).not.toMatch(/require\([^'"].*\)/); // no computed require paths
    const migration = fs.readFileSync(path.join(ROOT, '..', 'worker', 'migrations', '0078_free_xp_cosmetics.sql'), 'utf8');
    const migrationKeys = [...migration.matchAll(/"key":"(xp40\.(?:frame|theme|badge|title)_[a-z_]+)"/g)].map((m) => `'${m[1]}':`).sort();
    expect(migrationKeys).toEqual(keys.map((x) => x.key).sort());
  });

  it('ships lightweight shared effects and the real contact sheet', () => {
    for (const file of [
      'animations/frame-effects/gentle-glow.svg',
      'animations/frame-effects/particles.svg',
      'animations/frame-effects/rotating-ornaments.svg',
      'animations/badge-effects/shine.svg',
      'animations/unlock-effects/burst.svg',
      'animations/unlock-effects/confetti.svg',
      'animations/unlock-effects/reveal.svg',
    ]) expect(read(file).length, file).toBeGreaterThan(150);
    expect(isWebp('previews/xp40-contact-sheet.webp')).toBe(true);
    expect(bin('previews/xp40-contact-sheet.webp').length).toBeGreaterThan(50_000);
  });

  it('uses one foreground-aware clock and virtualized cards for animation performance', () => {
    const clock = fs.readFileSync(path.join(ROOT, 'src/lib/fxClock.ts'), 'utf8');
    const fx = fs.readFileSync(path.join(ROOT, 'src/components/gamification/CosmeticFx.tsx'), 'utf8');
    const screen = fs.readFileSync(path.join(ROOT, 'app/rewards/xp-cosmetics.tsx'), 'utf8');
    expect(clock.match(/makeMutable\(/g)).toHaveLength(1);
    expect(clock).toContain("AppState.addEventListener('change'");
    expect(clock).toContain('subscribers === 0');
    expect(fx).toContain('useReducedMotion()');
    expect(fx).toContain('useScreenActive()');
    expect(screen).toContain('<FlatList');
  });

  it('keeps frame rendering wired across profile, feed, VS cards, comments and leaderboards', () => {
    for (const [file, renderer] of [
      ['src/components/profile/ProfileHeader.tsx', 'ProfileFrame'],
      ['src/components/home/PostCard.tsx', 'FramedAvatar'],
      ['src/components/explore/OpenBattleCard.tsx', 'FramedAvatar'],
      ['src/components/comments/CommentSheet.tsx', 'FramedAvatar'],
      ['app/explore/leaderboard.tsx', 'FramedAvatar'],
      ['app/rewards/leaderboard.tsx', 'FramedAvatar'],
    ]) {
      const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
      expect(source, file).toContain(renderer);
    }
  });

  it('keeps free assets out of the Premium registry and DP coin store migration', () => {
    const premium = fs.readFileSync(path.join(ROOT, 'assets', 'shop', 'digital', 'index.ts'), 'utf8');
    const migration = fs.readFileSync(path.join(ROOT, '..', 'worker', 'migrations', '0078_free_xp_cosmetics.sql'), 'utf8');
    expect(premium).not.toContain('xp40.');
    expect(migration).not.toMatch(/INSERT[^;]+INTO store_listings/is);
  });
});
