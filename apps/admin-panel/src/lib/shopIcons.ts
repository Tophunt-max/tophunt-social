/**
 * The app's bundled Shop artwork (apps/expo/assets/icons/shop), read straight
 * from the app's files so the admin preview shows exactly what ships.
 */
const files = import.meta.glob("../../../expo/assets/icons/shop/**/*.webp", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
const BY_FILE: Record<string, string> = {};
for (const [p, url] of Object.entries(files)) BY_FILE[p.slice(p.indexOf("/assets/icons/shop/") + "/assets/icons/shop/".length)] = url;

/** URL of the bundled WebP for a registry file such as `icons/flame.webp`, or null. */
export const defaultShopIcon = (file: string): string | null => BY_FILE[file] ?? null;
