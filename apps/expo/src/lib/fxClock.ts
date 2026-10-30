/**
 * One clock for every premium cosmetic animation on screen.
 *
 * A feed can show 20–30 framed avatars at once. Giving each its own looping
 * animation means 30 timers; here there is ONE shared value running 0 → 1 on
 * the UI thread, and every overlay derives its transform/opacity from it in
 * its own animated style. Adding an avatar costs one style worklet, not one
 * more animation.
 *
 * The clock only runs while something is subscribed AND the app is in the
 * foreground, so an idle or backgrounded app does no animation work at all.
 */
import { useEffect } from 'react';
import { AppState, type NativeEventSubscription } from 'react-native';
import { Easing, cancelAnimation, makeMutable, withRepeat, withTiming } from 'react-native-reanimated';

/** One lap. Every fx motion uses whole multiples of it, so the loop is seamless. */
export const FX_PERIOD_MS = 6000;

export const fxClock = makeMutable(0);

let subscribers = 0;
let running = false;
let appState: NativeEventSubscription | null = null;

function start() {
  if (running) return;
  running = true;
  fxClock.value = 0;
  fxClock.value = withRepeat(withTiming(1, { duration: FX_PERIOD_MS, easing: Easing.linear }), -1, false);
}

function stop() {
  if (!running) return;
  running = false;
  cancelAnimation(fxClock);
}

function retain(): () => void {
  subscribers += 1;
  if (subscribers === 1) {
    appState = AppState.addEventListener('change', (s) => (s === 'active' ? start() : stop()));
    if (AppState.currentState !== 'background' && AppState.currentState !== 'inactive') start();
  }
  return () => {
    subscribers -= 1;
    if (subscribers === 0) {
      appState?.remove();
      appState = null;
      stop();
    }
  };
}

/** Subscribe to the shared clock while `enabled`. */
export function useFxClock(enabled: boolean) {
  useEffect(() => (enabled ? retain() : undefined), [enabled]);
}
