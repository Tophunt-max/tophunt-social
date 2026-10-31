/**
 * Web / PWA display ads: Google Ad Manager (GPT, which also carries AdX demand)
 * and AdSense. Both render nothing outside the web build.
 *
 * Each reports exactly once: onLoad when an ad filled the slot, onFail when it
 * did not (no fill, blocked, error). The caller moves to the next network.
 */
import React, { useEffect, useId } from 'react';
import { View } from 'react-native';
import { ensureWebConsent, googletag, loadGpt, webAdsSupported } from '@/src/services/ads/gpt';
import type { AdFormat } from '../placements';

interface WebAdProps {
  unit: string;
  format: AdFormat;
  testMode: boolean;
  /** One-line banner (320×50 / 320×100). */
  compact?: boolean;
  onLoad: () => void;
  onFail: (reason: string) => void;
}

/** Google's published GPT sample unit, used in test mode. */
const GAM_TEST_UNIT = '/6355419/Travel/Europe/France/Paris';
const GAM_SIZES: any[] = [[300, 250], [336, 280], [320, 100], [320, 50], 'fluid'];
const GAM_SIZES_COMPACT: any[] = [[320, 50], [300, 50], [320, 100]];

const domId = (prefix: string, raw: string) => `${prefix}-${raw.replace(/[^a-zA-Z0-9_-]/g, '')}`;

export function GamDisplay({ unit, testMode, compact, onLoad, onFail, refreshSec = 0, onRefreshed }: WebAdProps & { refreshSec?: number; onRefreshed?: () => void }) {
  const id = domId('gpt', useId());
  useEffect(() => {
    if (!webAdsSupported()) {
      onFail('unsupported');
      return;
    }
    let alive = true;
    let slot: any = null;
    let onRender: ((e: any) => void) | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let io: IntersectionObserver | null = null;
    let visible = false;
    let renders = 0;
    void loadGpt().then((ok) => {
      if (!alive) return;
      if (!ok) return onFail('blocked');
      const gt = googletag();
      gt.cmd.push(() => {
        if (!alive || !document.getElementById(id)) return;
        slot = gt.defineSlot(testMode ? GAM_TEST_UNIT : unit, compact ? GAM_SIZES_COMPACT : GAM_SIZES, id);
        if (!slot) return onFail('error');
        slot.addService(gt.pubads());
        onRender = (e: any) => {
          if (e.slot !== slot || !alive) return;
          renders++;
          if (renders === 1) {
            if (e.isEmpty) onFail('no_fill');
            else onLoad();
          } else if (!e.isEmpty) onRefreshed?.();
        };
        gt.pubads().addEventListener('slotRenderEnded', onRender);
        gt.enableServices();
        gt.display(id);
        // Viewable refresh: only while the tab is visible and half the slot is on screen.
        if (refreshSec >= 30 && typeof IntersectionObserver !== 'undefined') {
          const el = document.getElementById(id);
          if (el) {
            io = new IntersectionObserver((es) => (visible = es.some((x) => x.intersectionRatio >= 0.5)), { threshold: [0, 0.5, 1] });
            io.observe(el);
          }
          timer = setInterval(() => {
            if (alive && visible && document.visibilityState === 'visible') gt.pubads().refresh([slot]);
          }, refreshSec * 1000);
        }
      });
    });
    return () => {
      alive = false;
      if (timer) clearInterval(timer);
      io?.disconnect();
      const gt = googletag();
      if (gt?.cmd && (slot || onRender)) {
        gt.cmd.push(() => {
          if (onRender) gt.pubads().removeEventListener('slotRenderEnded', onRender);
          if (slot) gt.destroySlots([slot]);
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unit, testMode, compact, refreshSec, id]);
  return <View nativeID={id} style={{ width: '100%', alignItems: 'center', minHeight: 50 }} />;
}

// ------------------------------------------------------------------ AdSense

const adsenseLoading = new Map<string, Promise<boolean>>();

function loadAdSense(client: string): Promise<boolean> {
  if (!webAdsSupported()) return Promise.resolve(false);
  const existing = adsenseLoading.get(client);
  if (existing) return existing;
  ensureWebConsent();
  const p = new Promise<boolean>((resolve) => {
    const s = document.createElement('script');
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.onload = () => resolve(true);
    s.onerror = () => {
      adsenseLoading.delete(client);
      resolve(false);
    };
    document.head.appendChild(s);
  });
  adsenseLoading.set(client, p);
  return p;
}

/**
 * AdSense has no load callback, but it marks the `<ins>` with
 * `data-ad-status="filled" | "unfilled"` once it has decided; that is watched.
 */
export function AdSenseDisplay({ unit, format, testMode, compact, onLoad, onFail, client }: WebAdProps & { client: string }) {
  const id = domId('ads', useId());
  useEffect(() => {
    if (!webAdsSupported() || !client) {
      onFail('unsupported');
      return;
    }
    let alive = true;
    let observer: MutationObserver | null = null;
    void loadAdSense(client).then((ok) => {
      if (!alive) return;
      if (!ok) return onFail('blocked');
      const host = document.getElementById(id);
      if (!host) return;
      const ins = document.createElement('ins');
      ins.className = 'adsbygoogle';
      ins.style.display = 'block';
      ins.style.width = '100%';
      ins.setAttribute('data-ad-client', client);
      ins.setAttribute('data-ad-slot', unit);
      ins.setAttribute('data-ad-format', compact ? 'horizontal' : format === 'native' ? 'fluid' : 'auto');
      if (compact) ins.style.height = '50px';
      if (format === 'native') ins.setAttribute('data-ad-layout', 'in-article');
      ins.setAttribute('data-full-width-responsive', compact ? 'false' : 'true');
      if (testMode) ins.setAttribute('data-adtest', 'on');
      host.appendChild(ins);
      const check = () => {
        const st = ins.getAttribute('data-ad-status');
        if (st === 'filled') {
          observer?.disconnect();
          if (alive) onLoad();
        } else if (st === 'unfilled') {
          observer?.disconnect();
          if (alive) onFail('no_fill');
        }
      };
      observer = new MutationObserver(check);
      observer.observe(ins, { attributes: true, attributeFilter: ['data-ad-status'] });
      try {
        ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
      } catch {
        onFail('error');
      }
    });
    return () => {
      alive = false;
      observer?.disconnect();
      const host = document.getElementById(id);
      if (host) host.innerHTML = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unit, client, testMode, compact, id]);
  return <View nativeID={id} style={{ width: '100%', minHeight: 50 }} />;
}
