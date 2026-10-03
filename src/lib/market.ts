import { classifyTrend } from './trend';
import type { Settings, TrendInfo } from './types';

const FUTURES = 'https://fapi.binance.com/fapi/v1';
const SPOT = 'https://data-api.binance.vision/api/v3';

export type Source = 'futures' | 'spot';

export class MarketError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

let futuresUnreachable = false;

async function getJson<T>(url: string, timeoutMs = 5000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const body = (await res.json()) as { msg?: string };
        if (body?.msg) msg = body.msg;
      } catch {
        /* 非 JSON 错误体 */
      }
      throw new MarketError(msg, res.status);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

const root = (source: Source) => (source === 'futures' ? FUTURES : SPOT);

function sourceOrder(pref: Settings['dataSource']): Source[] {
  if (pref === 'futures') return ['futures'];
  if (pref === 'spot') return ['spot'];
  return futuresUnreachable ? ['spot'] : ['futures', 'spot'];
}

async function withFallback<T>(pref: Settings['dataSource'], run: (source: Source) => Promise<T>): Promise<T> {
  let invalidSymbol = false;
  let lastError: unknown = null;
  for (const source of sourceOrder(pref)) {
    try {
      return await run(source);
    } catch (e) {
      lastError = e;
      if (e instanceof MarketError && e.status === 400) invalidSymbol = true;
      else if (source === 'futures') futuresUnreachable = true;
    }
  }
  if (invalidSymbol) throw new MarketError('找不到这个交易对，检查币种名称（例如 PEPE 在合约里叫 1000PEPE）', 400);
  throw new MarketError(lastError instanceof Error && lastError.name === 'AbortError' ? '行情接口超时，检查网络后重试' : '行情接口连不上，检查网络后重试');
}

/** 只取已收盘的 K 线收盘价。 */
async function closes(source: Source, symbol: string, interval: string, limit = 200): Promise<number[]> {
  const rows = await getJson<unknown[][]>(`${root(source)}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
  const now = Date.now();
  return rows.filter((r) => Number(r[6]) < now).map((r) => Number(r[4]));
}

async function ticker(source: Source, symbol: string) {
  const t = await getJson<{ lastPrice: string; quoteVolume: string }>(`${root(source)}/ticker/24hr?symbol=${symbol}`);
  return { lastPrice: Number(t.lastPrice), quoteVolume: Number(t.quoteVolume) };
}

export interface MarketData {
  source: Source;
  btc1d: TrendInfo | null;
  coin4h: TrendInfo | null;
  lastPrice: number;
  quoteVolume: number;
}

export function loadMarket(symbol: string, pref: Settings['dataSource']): Promise<MarketData> {
  return withFallback(pref, async (source) => {
    const [btc, coin, t] = await Promise.all([
      closes(source, 'BTCUSDT', '1d'),
      closes(source, symbol, '4h'),
      ticker(source, symbol),
    ]);
    return { source, btc1d: classifyTrend(btc), coin4h: classifyTrend(coin), ...t };
  });
}

export function loadPrice(symbol: string, pref: Settings['dataSource']): Promise<number> {
  return withFallback(pref, async (source) => {
    const t = await getJson<{ price: string }>(`${root(source)}/ticker/price?symbol=${symbol}`);
    return Number(t.price);
  });
}

export function loadBtcTrend(pref: Settings['dataSource']): Promise<TrendInfo | null> {
  return withFallback(pref, async (source) => classifyTrend(await closes(source, 'BTCUSDT', '1d')));
}

export interface SymbolVolume {
  symbol: string;
  quoteVolume: number;
}

let symbolCache: { at: number; list: SymbolVolume[] } | null = null;

/** 成交额达标的 USDT 交易对，按成交额从高到低。 */
export async function loadLiquidSymbols(pref: Settings['dataSource'], minQuoteVolume: number): Promise<SymbolVolume[]> {
  if (symbolCache && Date.now() - symbolCache.at < 10 * 60_000) {
    return symbolCache.list.filter((s) => s.quoteVolume >= minQuoteVolume);
  }
  const list = await withFallback(pref, async (source) => {
    const path = source === 'futures' ? '/ticker/24hr' : '/ticker/24hr?type=MINI';
    const rows = await getJson<{ symbol: string; quoteVolume: string }[]>(`${root(source)}${path}`, 8000);
    return rows
      .filter((r) => r.symbol.endsWith('USDT'))
      .map((r) => ({ symbol: r.symbol, quoteVolume: Number(r.quoteVolume) }))
      .sort((x, y) => y.quoteVolume - x.quoteVolume);
  });
  symbolCache = { at: Date.now(), list };
  return list.filter((s) => s.quoteVolume >= minQuoteVolume);
}

export function normalizeSymbol(input: string): string {
  const s = input.toUpperCase().replace(/[\s/\-_]/g, '');
  if (!s) return '';
  return s.endsWith('USDT') ? s : `${s}USDT`;
}
