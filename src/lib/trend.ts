import type { TrendInfo, TrendState } from './types';

/** 以前 period 根的简单均值作种子的标准 EMA，种子之前为 NaN。 */
export function ema(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((sum, v) => sum + v, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export const MIN_CANDLES = 60;

export function classifyTrend(closes: number[]): TrendInfo | null {
  if (closes.length < MIN_CANDLES) return null;
  const i = closes.length - 1;
  const close = closes[i];
  const ema20 = ema(closes, 20)[i];
  const ema50 = ema(closes, 50)[i];
  let state: TrendState = 'unclear';
  if (close > ema50 && ema20 > ema50) state = 'up';
  else if (close < ema50 && ema20 < ema50) state = 'down';
  return { state, close, ema20, ema50 };
}

export const TREND_LABEL: Record<TrendState, string> = {
  up: '上涨',
  down: '下跌',
  unclear: '方向不明',
};
