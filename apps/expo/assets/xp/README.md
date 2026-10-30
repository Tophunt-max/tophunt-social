# XP40 free cosmetic artwork

XP40 is TopHunt's colorful **FREE/NORMAL** cosmetic collection. Players earn these items through server-authoritative XP levels and community activity. The collection uses friendly shapes, bright color, and lightweight glow/particle motion. It deliberately avoids diamonds, luxury materials, paid-currency symbols, and the richer layered premium look used by `assets/shop/digital`.

## Layout and source dimensions

| Category | Source | Runtime/card raster | Safe area |
| --- | --- | --- | --- |
| Frame | `512 × 512` SVG | `thumb.webp` at `160 × 160` | The center is transparent through radius 166. The visible ring and ornaments sit outside the avatar crop. |
| Theme | `1920 × 1080` SVG | `theme.webp` at `1920 × 1080`; `thumb.webp` at `320 × 180` | A dark translucent rounded panel from `(300, 210)` to `(1620, 870)` keeps profile text readable. |
| Badge | `512 × 512` SVG | `badge.webp` at `512 × 512`; `thumb.webp` at `128 × 128` | The canvas outside the shield is transparent. Icons contain no text. |
| Title | `800 × 240` SVG | `thumb.webp` at `320 × 96` | The horizontal nameplate and icon float on a transparent canvas. The plate contains no embedded title text. |

All SVGs declare fixed `width`, `height`, and matching `viewBox` values. Definition IDs include an XP40/item prefix to avoid collisions when several imported SVG components render together.

## WebP output

Full theme images use WebP quality 82. Thumbnails use quality 80–84 with alpha quality 92 for transparent art. Files are generated directly at their required dimensions rather than relying on runtime resizing. `previews/xp40-contact-sheet.webp` is a `1500 × 1760` optimized overview of all 40 items.

## Static imports and registry

`index.ts` contains literal SVG imports and literal `require()` calls so Metro can include every asset at build time.

- Frames, badges, and titles expose an SVG `Art` component and a static `preview` image.
- Badges also expose the full `512 × 512` static `image`.
- Themes expose the optimized full-size `image` and card `preview`; their editable `source.svg` remains beside those files but is not bundled as the main runtime background.
- `XP40_ART` contains exactly 40 XP40 entries. `XP_ART` combines those entries with the 18 legacy keys used by migration 0077.
- `XP40_FRAMES`, `XP40_THEMES`, `XP40_BADGES`, `XP40_TITLES`, and `XP40_BY_TYPE` provide category access without computed asset paths.

Every XP40 entry includes `id`, `kind`, `type`, `name`, `description`, `unlockLevel`, `source`, `collection`, `rarity`, a static artwork reference, `preview`, and `animation`.

## Shared animations

Animations are transparent SVG overlays. They are separate from the base art so screens can choose when to animate and can respect reduced-motion settings.

- `frame-gentle-glow`: slow opacity pulse around the frame edge.
- `frame-particles`: small floating points around the avatar opening.
- `frame-rotating-ornaments`: slow rotation of lightweight outer ornaments.
- `badge-shine`: clipped highlight sweep across a badge.
- `unlock-burst`: one-shot radial celebration.
- `unlock-confetti`: one-shot colorful falling pieces.
- `unlock-reveal`: one-shot expanding translucent reveal.

The registry stores the overlay component, duration, and loop behavior. `src/lib/cosmeticArt.ts` resolves the configuration and `CosmeticFx.tsx` drives it from one shared UI-thread clock. Motion pauses while the screen/app is hidden and under reduced-motion settings.

## Adding an item

1. Create a kebab-case item directory under the correct category.
2. Add an original `source.svg` at the category dimensions and honor its transparent/text safe area.
3. Export the required WebP files at the exact dimensions above.
4. Give all SVG gradients, masks, filters, and clip paths a globally unique ID prefix.
5. Add literal imports or `require()` calls and a complete registry entry in `index.ts`. Use an underscore in the key, for example `xp40.frame_green_leaf`, while keeping the folder kebab-cased.
6. Add the item to its category array and the contact sheet.
7. Parse every SVG as XML, inspect every WebP with an image decoder, verify dimensions and alpha where required, then run Expo TypeScript checks.

Do not place premium assets or premium aliases in this collection. Existing migration-0077 legacy keys must remain in `LEGACY_XP_ART` and `XP_ART`.