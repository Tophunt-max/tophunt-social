import { describe, expect, it, vi } from 'vitest';

// Bundled artwork maps use require('*.webp'); stand-ins keep this a pure Node test.
vi.mock('@/assets/shop/digital', () => ({
  SHOP_DIGITAL_ART: {
    'shop.frame_rose_petal': { kind: 'frame', source: 101, Fx: 102, fx: 'twinkle' },
    'shop.title_dragon_lord': { kind: 'title', textOnPlate: true, source: 201 },
    'shop.title_sovereign': { kind: 'title', textOnPlate: true, source: 202 },
    'shop.title_starlight_icon': { kind: 'title', textOnPlate: true, source: 203 },
    'shop.title_hunt_master': { kind: 'title', textOnPlate: false, source: 204 },
    'shop.title_style_icon': { kind: 'title', textOnPlate: false, source: 205 },
    'shop.title_trend_boss': { kind: 'title', textOnPlate: false, source: 206 },
  },
}));
vi.mock('@/assets/xp', () => ({ XP_ART: {} }));

import { cosmeticArt, cosmeticTier, isSafeArtUrl, titlePlateHasText } from '@/src/lib/cosmeticArt';

const ART = 'https://media.tophunt.in/shop-items/2026/11/0b9f3a8e-1c2d-4e5f-8a9b-0c1d2e3f4a5b.webp';
const FX = 'https://media.tophunt.in/shop-items/2026/11/1b9f3a8e-1c2d-4e5f-8a9b-0c1d2e3f4a5b.webp';

describe('admin-uploaded cosmetic artwork', () => {
  it('draws the uploaded WebP (and its overlay) as the item kind', () => {
    const art = cosmeticArt({ asset: { imageUrl: ART, fxUrl: FX, fx: 'spin', artKind: 'sticker' } });
    expect(art).toMatchObject({ kind: 'sticker', tier: 'premium', source: { uri: ART }, Fx: { uri: FX }, fx: 'spin' });
  });

  it('wins over the bundled key, so an admin can replace art without a release', () => {
    const art = cosmeticArt({ asset: { key: 'shop.frame_rose_petal', imageUrl: ART, artKind: 'frame' } }, 'frame');
    expect(art?.source).toEqual({ uri: ART });
    expect(art?.Fx).toBeUndefined();
    // Without an upload the bundled art still resolves.
    expect(cosmeticArt({ asset: { key: 'shop.frame_rose_petal' } }, 'frame')?.source).toBe(101);
  });

  it('falls back to the item type, respects the requested kind and the frame opening', () => {
    expect(cosmeticArt({ type: 'badge', asset: { imageUrl: ART } })?.kind).toBe('badge');
    expect(cosmeticArt({ asset: { imageUrl: ART, artKind: 'badge' } }, 'frame')).toBeNull();
    expect(cosmeticArt({ asset: { imageUrl: ART, artKind: 'frame', avatarRatio: 0.7 } }, 'frame')?.avatarRatio).toBe(0.7);
    expect(cosmeticArt({ asset: { imageUrl: ART, artKind: 'frame', avatarRatio: 3 } }, 'frame')?.avatarRatio).toBeUndefined();
    expect(cosmeticArt({ asset: { imageUrl: ART, artKind: 'hat' } })).toBeNull();
  });

  it('ignores unsafe urls and unknown motions', () => {
    for (const bad of ['http://media.tophunt.in/a.webp', 'javascript:alert(1)', 'https://user:pw@evil.test/a.webp', 'https://evil.test/a b.webp', 42]) {
      expect(isSafeArtUrl(bad)).toBe(false);
      expect(cosmeticArt({ asset: { imageUrl: bad, artKind: 'frame' } })).toBeNull();
    }
    expect(cosmeticArt({ asset: { imageUrl: ART, artKind: 'frame', fx: 'explode', fxUrl: 'http://x/y.webp' } })).toMatchObject({ fx: undefined, Fx: undefined });
  });

  it('uploaded items are Premium unless marked xp', () => {
    expect(cosmeticTier({ asset: { imageUrl: ART } })).toBe('premium');
    expect(cosmeticTier({ asset: { imageUrl: ART, tier: 'xp' } })).toBe('xp');
  });
});

describe('titlePlateHasText', () => {
  const title = (key: string | null) => ({ type: 'title', asset: key ? { key } : {} });
  it('is false only for the bundled plates without baked text', () => {
    expect(titlePlateHasText(title('shop.title_dragon_lord'))).toBe(true);
    expect(titlePlateHasText(title('shop.title_sovereign'))).toBe(true);
    expect(titlePlateHasText(title('shop.title_starlight_icon'))).toBe(true);
    expect(titlePlateHasText(title('shop.title_hunt_master'))).toBe(false);
    expect(titlePlateHasText(title('shop.title_style_icon'))).toBe(false);
    expect(titlePlateHasText(title('shop.title_trend_boss'))).toBe(false);
  });
  it('is true for uploads and unknown items (a complete plate is assumed)', () => {
    expect(titlePlateHasText({ type: 'title', asset: { imageUrl: 'https://cdn.test/plate.webp' } })).toBe(true);
    expect(titlePlateHasText(title(null))).toBe(true);
    expect(titlePlateHasText(title('shop.title_unknown'))).toBe(true);
    expect(titlePlateHasText({ type: 'frame', asset: { key: 'shop.frame_neon_pulse' } })).toBe(true);
  });
});
