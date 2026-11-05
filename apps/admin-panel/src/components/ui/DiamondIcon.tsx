import { Children, Fragment, type ReactNode } from "react";
import diamondUrl from "../../../../expo/assets/images/currency/diamond.webp?url";
import dpCoinUrl from "../../../../expo/assets/images/currency/dp-coin.webp?url";
import xpUrl from "../../../../expo/assets/images/currency/xp.webp?url";

/**
 * The app-wide currency artwork, the same WebPs the app draws
 * (apps/expo/assets/images/currency):
 *
 *   DiamondIcon  Diamond, the play-only balance (users.locked_coins): contest entry fees, earned free.
 *   CoinIcon     DP coin (dpcoin − locked_coins): won in contests, spent in the shop.
 *   XpIcon       XP.
 *
 * They take the lucide icon props they are used with (size, className), so they
 * can stand in for a lucide icon, e.g. on a StatCard. The artwork is full colour,
 * so `color` and text-colour classes don't tint it.
 */
export const DIAMOND_COLOR = "#22D3EE";

type Kind = "diamond" | "dpCoin" | "xp";
const SRC: Record<Kind, string> = { diamond: diamondUrl, dpCoin: dpCoinUrl, xp: xpUrl };
const NAME: Record<Kind, string> = { diamond: "Diamond", dpCoin: "DP coin", xp: "XP" };

type Props = {
  /** Pixels, or any CSS length (e.g. "1.15em" to follow the text size). */
  size?: number | string;
  color?: string;
  className?: string;
  /** Alt text. Defaults to the currency name; pass "" when nearby text already names it. */
  alt?: string;
};

function CurrencyImg({ kind, size = 16, className, alt }: Props & { kind: Kind }) {
  const label = alt ?? NAME[kind];
  return (
    <img
      src={SRC[kind]}
      width={typeof size === "number" ? size : undefined}
      height={typeof size === "number" ? size : undefined}
      alt={label}
      aria-hidden={label ? undefined : true}
      draggable={false}
      decoding="async"
      className={className}
      style={{ width: size, height: size, objectFit: "contain", flexShrink: 0, display: "inline-block" }}
    />
  );
}

export function DiamondIcon(props: Props) {
  return <CurrencyImg kind="diamond" {...props} />;
}
export function CoinIcon(props: Props) {
  return <CurrencyImg kind="dpCoin" {...props} />;
}
export function XpIcon(props: Props) {
  return <CurrencyImg kind="xp" {...props} />;
}

/** 💎 / 🪙 / ⚡ (with or without the U+FE0F variation selector). */
const GLYPH = /(💎|🪙|⚡)\uFE0F?/u;
const GLYPH_SPLIT = /((?:💎|🪙|⚡)\uFE0F?)/u;
const GLYPH_KIND: Record<string, Kind> = { "💎": "diamond", "🪙": "dpCoin", "⚡": "xp" };

/**
 * Draws the currency emojis in its text children as the currency artwork. The
 * labels stay plain strings in code, so CSV exports, <option>, toasts and
 * tooltips are unchanged; only the on-screen rendering changes. Element
 * children pass through untouched. The icon follows the text size and sits on
 * its baseline.
 */
export function CurrencyText({ children }: { children?: ReactNode }) {
  const parts = Children.toArray(children);
  if (!parts.some((p) => typeof p === "string" && GLYPH.test(p))) return <>{children}</>;
  // Alt text is dropped when the label already names the currency ("💎 Diamond").
  const text = parts.filter((p): p is string => typeof p === "string").join("").toLowerCase();
  return (
    <>
      {parts.map((node, n) =>
        typeof node !== "string" ? (
          node
        ) : (
          <Fragment key={`t${n}`}>
            {node.split(GLYPH_SPLIT).map((part, i) => {
              const kind = GLYPH_KIND[part.replace("\uFE0F", "")];
              if (!kind) return part ? <Fragment key={i}>{part}</Fragment> : null;
              return (
                <span key={i} style={{ display: "inline-flex", verticalAlign: "-0.2em" }}>
                  <CurrencyImg kind={kind} size="1.15em" alt={text.includes(NAME[kind].toLowerCase()) ? "" : NAME[kind]} />
                </span>
              );
            })}
          </Fragment>
        ),
      )}
    </>
  );
}

export default DiamondIcon;
