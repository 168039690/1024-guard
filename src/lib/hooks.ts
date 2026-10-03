import { useCallback, useEffect, useRef, useState } from 'react';
import { EMPTY_MARKET, type MarketSnapshot } from './gate';
import { loadMarket, loadPrice } from './market';
import type { Settings } from './types';

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

const MARKET_REFRESH_MS = 60_000;

export function useMarket(symbol: string, pref: Settings['dataSource']) {
  const [market, setMarket] = useState<MarketSnapshot>({ ...EMPTY_MARKET, loading: Boolean(symbol) });
  const [tick, setTick] = useState(0);
  const lastSymbol = useRef(symbol);

  useEffect(() => {
    if (!symbol) {
      setMarket(EMPTY_MARKET);
      return;
    }
    let cancelled = false;
    const symbolChanged = lastSymbol.current !== symbol;
    lastSymbol.current = symbol;
    setMarket((m) => (symbolChanged ? { ...EMPTY_MARKET, loading: true } : { ...m, loading: true, error: null }));
    const timer = setTimeout(() => {
      loadMarket(symbol, pref)
        .then((d) => {
          if (cancelled) return;
          setMarket({
            loading: false,
            error: null,
            source: d.source,
            btc1d: d.btc1d,
            coin4h: d.coin4h,
            quoteVolume: d.quoteVolume,
            lastPrice: d.lastPrice,
          });
        })
        .catch((e: Error) => {
          if (!cancelled) setMarket({ ...EMPTY_MARKET, error: e.message });
        });
    }, 400);
    const interval = setInterval(() => setTick((t) => t + 1), MARKET_REFRESH_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [symbol, pref, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { market, refresh };
}

export function usePrice(symbol: string, pref: Settings['dataSource'], intervalMs = 15_000): number | null {
  const [price, setPrice] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    const run = () =>
      loadPrice(symbol, pref)
        .then((p) => {
          if (!cancelled) setPrice(p);
        })
        .catch(() => {});
    run();
    const timer = setInterval(run, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [symbol, pref, intervalMs]);
  return price;
}

export function useDraft<T extends object>(key: string, initial: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? { ...initial, ...JSON.parse(raw) } : initial;
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (v: T) => {
      setValue(v);
      localStorage.setItem(key, JSON.stringify(v));
    },
    [key],
  );
  return [value, set];
}
