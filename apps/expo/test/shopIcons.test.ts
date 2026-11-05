/**
 * Shop artwork (assets/icons/shop): every registered file exists and is a
 * valid transparent WebP with the registered aspect ratio, nothing on disk is
 * left unregistered, each WebP has its SVG source in design/shop, and the
 * Worker override list (Shop → Shop Assets) has exactly the same keys, files,
 * sizes and tint flags in the same order.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'assets', 'icons', 'shop');
const DESIGN = path.join(ROOT, 'design', 'shop');
const registry = fs.readFileSync(path.join(DIR, 'index.ts'), 'utf8');
const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const rel = (base: string, f: string) => path.relative(base, f).split(path.sep).join('/');

/** [key, file, w, h, tint] parsed from the registry source. */
function appList(): [string, string, number, number, boolean][] {
  const body = registry.slice(registry.indexOf('export const SHOP_ICONS = {'), registry.indexOf('} satisfies'));
  const out: [string, string, number, number, boolean][] = [];
  for (const line of body.split('\n')) {
    let m = /^\s+(\w+): tile\(require\('\.\/([^']+)'\)\),$/.exec(line);
    if (m) { out.push([m[1], m[2], 48, 40, false]); continue; }
    m = /^\s+(\w+): icon\(require\('\.\/([^']+)'\)\),$/.exec(line);
    if (m) { out.push([m[1], m[2], 24, 24, false]); continue; }
    m = /^\s+(\w+): glyph\(require\('\.\/([^']+)'\)(?:, (\d+), (\d+))?\),$/.exec(line);
    if (m) { out.push([m[1], m[2], Number(m[3] ?? 24), Number(m[4] ?? 24), true]); continue; }
    m = /^\s+(\w+): \{ source: require\('\.\/([^']+)'\), w: (\d+), h: (\d+) \},$/.exec(line);
    if (m) { out.push([m[1], m[2], Number(m[3]), Number(m[4]), false]); continue; }
    if (/require\(/.test(line)) throw new Error(`Unparsed registry line: ${line}`);
  }
  return out;
}

function webpInfo(b: Buffer) {
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') return null;
  const chunk = b.toString('ascii', 12, 16);
  const u24 = (o: number) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);
  if (chunk === 'VP8X') return { w: 1 + u24(24), h: 1 + u24(27), alpha: (b[20] & 0x10) !== 0 };
  if (chunk === 'VP8L') {
    const v = b.readUInt32LE(21);
    return { w: 1 + (v & 0x3fff), h: 1 + ((v >>> 14) & 0x3fff), alpha: ((v >>> 28) & 1) === 1 };
  }
  return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff, alpha: false };
}

describe('Shop artwork', () => {
  const list = appList();

  it('registers every WebP in the folder, and only WebP', () => {
    const onDisk = walk(DIR).map((f) => rel(DIR, f)).filter((f) => f !== 'index.ts').sort();
    expect(onDisk.every((f) => f.endsWith('.webp'))).toBe(true);
    expect(list.map(([, f]) => f).sort()).toEqual(onDisk);
    expect(new Set(list.map(([k]) => k)).size).toBe(list.length);
  });

  it('every file is a transparent WebP with the registered aspect ratio, within budget', () => {
    let total = 0;
    for (const [key, file, w, h, tint] of list) {
      const bytes = fs.readFileSync(path.join(DIR, file));
      total += bytes.length;
      const info = webpInfo(bytes);
      expect(info, file).not.toBeNull();
      expect(info!.alpha, `${file} alpha`).toBe(true);
      expect(Math.abs(info!.w / info!.h - w / h), `${key} aspect`).toBeLessThan((w / h) * 0.02);
      expect(Math.max(info!.w, info!.h), `${file} size`).toBeGreaterThanOrEqual(128);
      expect(bytes.length, `${file} bytes`).toBeLessThan(40 * 1024);
      if (tint) expect(/^(glyphs|ui)\//.test(file), `${key} tint`).toBe(true);
    }
    expect(total).toBeLessThan(400 * 1024);
  });

  it('every WebP has its SVG source in design/shop', () => {
    for (const [, file] of list) expect(fs.existsSync(path.join(DESIGN, file.replace(/\.webp$/, '.svg'))), file).toBe(true);
    const sources = walk(DESIGN).map((f) => rel(DESIGN, f).replace(/\.svg$/, '.webp')).sort();
    expect(sources).toEqual(list.map(([, f]) => f).sort());
  });

  it('the Worker override list (Shop → Shop Assets) matches the registry exactly', () => {
    const worker = fs.readFileSync(path.join(ROOT, '..', 'worker', 'src', 'lib', 'shopAssets.ts'), 'utf8');
    const listed = [...worker.matchAll(/^\s+\["(\w+)", "([^"]+\.webp)", (\d+), (\d+), (true|false)\],$/gm)].map((m) => [m[1], m[2], Number(m[3]), Number(m[4]), m[5] === 'true']);
    expect(listed).toEqual(list);
    expect(listed.length).toBeGreaterThan(30);
  });

  it('Shop screens draw no inline SVG artwork except the procedural overlays', () => {
    const art = fs.readFileSync(path.join(ROOT, 'src', 'components', 'shop', 'premium', 'ShopArt.tsx'), 'utf8');
    const svgs = [...art.matchAll(/<Svg\b/g)].length;
    expect(svgs).toBe(2); // SparkleField, HeroWaves
  });
});

/** Every Shop source file: the routes, the Shop components, and the models that feed them icon names. */
const SHOP_SOURCES = [
  ...walk(path.join(ROOT, 'app', 'shop')),
  ...walk(path.join(ROOT, 'src', 'components', 'shop')),
  ...['shopModel', 'shopItemModel', 'shopListModel', 'digitalHomeModel', 'physicalHomeModel', 'collectionHomeModel'].map((f) => path.join(ROOT, 'src', 'lib', `${f}.ts`)),
].filter((f) => /\.tsx?$/.test(f));
/** Shared components drawn inside the Shop whose icon names go through the Shop's WebP glyphs. */
const SHARED_IN_SHOP = ['src/components/explore/ExploreBits.tsx', 'src/components/gamification/RarityPill.tsx', 'src/components/gamification/CosmeticBits.tsx', 'src/components/gamification/RewardBits.tsx'];
/**
 * Vector drawing a Shop file may still contain, and why: none of these is an
 * icon. Background glows and gradients sized to the screen, and the hero
 * headline text (live text, so it can't be an image).
 */
const SVG_ALLOWED: Record<string, string> = {
  'src/components/shop/premium/ShopArt.tsx': 'SparkleField / HeroWaves banner overlays',
  'app/shop/index.tsx': 'page background glow',
  'src/components/shop/item/ItemHero.tsx': 'item hero glow',
  'src/components/shop/premium/HeroBanner.tsx': 'slide light rays and headline text',
};

function shimMaps() {
  const shim = fs.readFileSync(path.join(ROOT, 'src', 'lib', 'icons.tsx'), 'utf8');
  const block = (name: string) => {
    const s = shim.indexOf(`const ${name}: Record<string, LucideIcon> = {`);
    return shim.slice(s, shim.indexOf('\n};', s));
  };
  const parse = (b: string) => Object.fromEntries([...b.matchAll(/'([\w-]+)': ic\('(\w+)'\)/g)].map((m) => [m[1], m[2]]));
  const g = shim.indexOf('// Gamification (ranks, achievements, cosmetics)');
  return { ion: parse(block('ionicons')), mci: parse(block('mci')), catalog: parse(shim.slice(g, shim.indexOf('\n};', g))) };
}

describe('every Shop icon is a WebP in assets/icons/shop', () => {
  const keys = new Set(appList().map(([k]) => k));
  const { ion, mci, catalog } = shimMaps();

  it('every icon name the Shop can request has its ui/ WebP (including server catalog names)', () => {
    const missing: string[] = [];
    const need = (lucide: string, where: string) => { const k = lucide === 'X' ? 'uiClose' : `ui${lucide}`; if (!keys.has(k)) missing.push(`${k} (${where})`); };
    // ShopGlyphs.tsx is the resolver itself (its strings are request kinds, not icon names).
    for (const f of [...SHOP_SOURCES, ...SHARED_IN_SHOP.map((r) => path.join(ROOT, r))].filter((x) => !x.endsWith('ShopGlyphs.tsx'))) {
      const src = fs.readFileSync(f, 'utf8');
      for (const m of src.matchAll(/['"]([a-z][\w-]*)['"]/g)) {
        if (ion[m[1]]) need(ion[m[1]], `${rel(ROOT, f)}: ${m[1]}`);
        if (/MaterialCommunityIcons/.test(src) && mci[m[1]]) need(mci[m[1]], `${rel(ROOT, f)}: mci ${m[1]}`);
      }
    }
    for (const [name, lucide] of Object.entries(catalog)) need(lucide, `catalog ${name}`);
    for (const k of ['uiCircle', 'uiChevron', 'uiArrow', 'uiClose', 'uiCloseCircle', 'uiHeartFilled']) expect(keys.has(k), k).toBe(true);
    expect([...new Set(missing)]).toEqual([]);
  });

  it('Shop files never draw vector icons directly', () => {
    for (const f of SHOP_SOURCES) {
      const src = fs.readFileSync(f, 'utf8');
      const r = rel(ROOT, f);
      // ShopGlyphs resolves names through the shim (and draws WebP); nothing else may import it.
      if (!r.endsWith('ShopGlyphs.tsx')) expect(src, `${r} imports the vector icon shim`).not.toMatch(/from '@\/src\/lib\/icons'/);
      expect(src, `${r} imports lucide`).not.toMatch(/from 'lucide-react-native/);
      expect(src, `${r} imports raw svg assets`).not.toMatch(/from '@\/assets\/svgs'/);
      expect(src, `${r} uses @expo/vector-icons`).not.toMatch(/@expo\/vector-icons/);
      if (/from 'react-native-svg'/.test(src)) expect(SVG_ALLOWED[r], `${r} draws SVG`).toBeTruthy();
    }
  });

  it('every Shop route is inside ShopIconScope, so shared components use the WebPs too', () => {
    const layout = fs.readFileSync(path.join(ROOT, 'app', 'shop', '_layout.tsx'), 'utf8');
    expect(layout).toMatch(/<ShopIconScope>[\s\S]*<Stack/);
    for (const f of ['src/lib/icons.tsx', 'src/components/ui/ArrowIcon.tsx', 'src/components/ui/CloseIcon.tsx']) {
      expect(fs.readFileSync(path.join(ROOT, f), 'utf8'), f).toMatch(/useContext\(IconOverrideContext\)/);
    }
    // The bottom nav is app-wide and keeps its own icons inside the Shop.
    expect(fs.readFileSync(path.join(ROOT, 'src/components/home/BottomNav.tsx'), 'utf8')).toMatch(/<IconOverrideContext\.Provider value=\{null\}>/);
  });
});
