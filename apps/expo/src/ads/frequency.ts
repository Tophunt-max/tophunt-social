/**
 * Frequency caps per ad slot: per session (memory), per day and the minimum gap
 * between two full-screen ads (persisted, so an app restart does not reset the
 * day). Fail-open: if storage cannot be read, the session caps still apply.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AdSlotKey, PlacementRules } from './placements';

const KEY = 'ads:freq:v1';
const today = () => new Date().toISOString().slice(0, 10);

interface Stored {
  day: string;
  counts: Partial<Record<AdSlotKey, number>>;
  last: Partial<Record<AdSlotKey, number>>;
}

const session: Partial<Record<AdSlotKey, number>> = {};
let stored: Stored = { day: today(), counts: {}, last: {} };
let loaded: Promise<void> | null = null;

function load(): Promise<void> {
  if (!loaded) {
    loaded = AsyncStorage.getItem(KEY)
      .then((raw) => {
        const s = raw ? (JSON.parse(raw) as Stored) : null;
        if (s && typeof s === 'object') stored = { day: s.day, counts: s.counts ?? {}, last: s.last ?? {} };
      })
      .catch(() => undefined);
  }
  return loaded;
}
void load();

function rollDay() {
  const d = today();
  if (stored.day !== d) stored = { day: d, counts: {}, last: stored.last };
}

/** True when one more ad from `slot` fits its caps right now. */
export function canShowAd(slot: AdSlotKey, rules: PlacementRules, now = Date.now()): boolean {
  rollDay();
  if (rules.maxPerSession <= 0) return false;
  if ((session[slot] ?? 0) >= rules.maxPerSession) return false;
  if (rules.maxPerDay > 0 && (stored.counts[slot] ?? 0) >= rules.maxPerDay) return false;
  const last = stored.last[slot];
  if (rules.minIntervalSec > 0 && last && now - last < rules.minIntervalSec * 1000) return false;
  return true;
}

/** Count one shown ad from `slot`. */
export function recordAdShown(slot: AdSlotKey, now = Date.now()): void {
  rollDay();
  session[slot] = (session[slot] ?? 0) + 1;
  stored.counts[slot] = (stored.counts[slot] ?? 0) + 1;
  stored.last[slot] = now;
  void load().then(() => AsyncStorage.setItem(KEY, JSON.stringify(stored)).catch(() => undefined));
}

/** Test hook. */
export function __resetAdFrequency(): void {
  for (const k of Object.keys(session)) delete session[k as AdSlotKey];
  stored = { day: today(), counts: {}, last: {} };
}
