import { assetColors, shopArtFor } from "@/lib/shopArt";

/**
 * The item as users see it: a frame on a placeholder avatar, a theme as a
 * banner, a badge next to a name, a title as its chip, stickers / collectibles
 * / effects as the artwork itself. Uploaded WebP artwork (asset.imageUrl) wins
 * over bundled artwork, as in the app.
 */
export function ItemPreview({ r, height = 144 }: { r: any; height?: number }) {
  const art = shopArtFor(r.asset, r.type);
  const [c0, c1] = assetColors(r.asset);
  const bg = { background: `linear-gradient(135deg, ${c0}33, ${c1}55)` };
  const motion = fxClass(r.asset?.fx);
  const ratio = Number(r.asset?.avatarRatio);
  const hole = ratio >= 0.5 && ratio <= 0.95 ? ratio : 100 / 120;
  if (art?.kind === "theme") {
    return (
      <div className="relative w-full overflow-hidden" style={{ height }}>
        <img src={art.url} alt={r.name} className="absolute inset-0 w-full h-full object-cover" />
        {art.fxUrl ? <img src={art.fxUrl} alt="" className={`absolute inset-0 w-full h-full object-cover ${motion ?? "th-fx-drift"}`} /> : null}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="rounded-full bg-white p-1 shadow"><div className="w-14 h-14 rounded-full bg-gradient-to-br from-slate-300 to-slate-500" /></div>
        </div>
      </div>
    );
  }
  if (art?.kind === "frame") {
    return (
      <div className="w-full flex items-center justify-center" style={{ height, ...bg }}>
        <div className="relative" style={{ width: height * 0.8, height: height * 0.8 }}>
          <div className="absolute rounded-full bg-gradient-to-br from-slate-300 to-slate-500" style={{ inset: `${((1 - hole) / 2) * 100}%` }} />
          <img src={art.url} alt={r.name} className="absolute inset-0 w-full h-full object-contain" />
          {art.fxUrl ? <img src={art.fxUrl} alt="" className={`absolute inset-0 w-full h-full object-contain ${motion ?? "th-fx-pulse"}`} /> : null}
        </div>
      </div>
    );
  }
  if (art) {
    const big = art.kind === "sticker" || art.kind === "collectible" || art.kind === "effect";
    const box = height * (big ? 0.7 : 0.42);
    return (
      <div className="w-full flex flex-col items-center justify-center gap-2" style={{ height, ...bg }}>
        <span className="relative" style={{ width: box, height: box }}>
          <img src={art.url} alt={r.name} className="absolute inset-0 w-full h-full object-contain" />
          {art.fxUrl ? <img src={art.fxUrl} alt="" className={`absolute inset-0 w-full h-full object-contain ${motion ?? "th-fx-pulse"}`} /> : null}
        </span>
        {r.type === "title" ? (
          <span className="text-xs font-bold px-2.5 py-0.5 rounded-full border" style={{ color: c1, borderColor: c1 }}>{String(r.asset?.text || r.name)}</span>
        ) : r.type === "badge" ? (
          <span className="text-xs font-semibold bg-black/50 text-white px-2 py-0.5 rounded-full inline-flex items-center gap-1">Asha <img src={art.url} alt="" className="w-3.5 h-3.5 object-contain" /></span>
        ) : null}
      </div>
    );
  }
  // Items without artwork: their colours, and the title text if any.
  return (
    <div className="w-full flex items-center justify-center" style={{ height, ...bg }}>
      {r.type === "title" ? (
        <span className="text-sm font-bold px-3 py-1 rounded-full border" style={{ color: c1, borderColor: c1 }}>{String(r.asset?.text || r.name)}</span>
      ) : (
        <div className="w-16 h-16 rounded-full" style={{ background: `linear-gradient(135deg, ${c0}, ${c1})` }} />
      )}
    </div>
  );
}

/** The CSS class that approximates the app's overlay motion (index.css th-fx-*). */
function fxClass(fx: unknown): string | null {
  return fx === "drift" ? "th-fx-drift" : fx === "spin" ? "th-fx-spin" : fx === "pulse" || fx === "twinkle" || fx === "flicker" ? "th-fx-pulse" : null;
}
