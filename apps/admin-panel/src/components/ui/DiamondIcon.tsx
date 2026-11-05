import diamondUrl from "../../../../expo/assets/images/currency/diamond.webp?url";
import dpCoinUrl from "../../../../expo/assets/images/currency/dp-coin.webp?url";
import xpUrl from "../../../../expo/assets/images/currency/xp.webp?url";

/**
 * The app-wide currency artwork, the same WebPs the app draws
 * (apps/expo/assets/images/currency, built by apps/expo/scripts/gen-currency-webp.mjs):
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

type Props = { size?: number; color?: string; className?: string };

function art(src: string, alt: string) {
  return function CurrencyIcon({ size = 16, className }: Props) {
    return (
      <img
        src={src}
        width={size}
        height={size}
        alt={alt}
        draggable={false}
        className={className}
        style={{ width: size, height: size, objectFit: "contain", flexShrink: 0, display: "inline-block" }}
      />
    );
  };
}

export const DiamondIcon = art(diamondUrl, "Diamond");
export const CoinIcon = art(dpCoinUrl, "DP coin");
export const XpIcon = art(xpUrl, "XP");

export default DiamondIcon;
