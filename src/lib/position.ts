import type { Direction, Settings } from './types';

export type PositionSettings = Pick<
  Settings,
  'takerFee' | 'slippage' | 'mmrMajor' | 'mmrAlt' | 'levCapMajor' | 'levCapAlt' | 'liqSafety'
>;

export interface PositionInput {
  direction: Direction;
  entry: number;
  stop: number;
  target: number;
  riskU: number;
  marginBudget: number;
  major: boolean;
  settings: PositionSettings;
}

export interface KeyPrices {
  breakeven: number;
  r1: number;
  r2: number;
  r3: number;
}

export interface PositionResult {
  ok: boolean;
  error: string | null;
  priceError: string | null;
  stopPct: number;
  rewardPct: number;
  costPct: number;
  rr: number;
  notional: number;
  qty: number;
  levCap: number;
  mmr: number;
  minLev: number;
  safeMaxLev: number;
  leverage: number | null;
  margin: number | null;
  liq: number | null;
  liqPct: number | null;
  prices: KeyPrices;
}

export function sideSign(direction: Direction): 1 | -1 {
  return direction === 'long' ? 1 : -1;
}

/** 逐仓强平价估算（不含阶梯维持保证金速算额，以币安显示为准）。 */
export function liqPrice(direction: Direction, entry: number, leverage: number, mmr: number): number {
  return direction === 'long'
    ? (entry * (1 - 1 / leverage)) / (1 - mmr)
    : (entry * (1 + 1 / leverage)) / (1 + mmr);
}

export function liqDistance(direction: Direction, leverage: number, mmr: number): number {
  return direction === 'long'
    ? 1 - (1 - 1 / leverage) / (1 - mmr)
    : (1 + 1 / leverage) / (1 + mmr) - 1;
}

export function validatePrices(direction: Direction, entry: number, stop: number, target: number): string | null {
  if (!(entry > 0) || !(stop > 0) || !(target > 0)) return '填写入场价、止损价和目标价';
  if (direction === 'long') {
    if (stop >= entry) return '做多时止损价必须低于入场价';
    if (target <= entry) return '做多时目标价必须高于入场价';
  } else {
    if (stop <= entry) return '做空时止损价必须高于入场价';
    if (target >= entry) return '做空时目标价必须低于入场价';
  }
  return null;
}

export function keyPrices(direction: Direction, entry: number, stop: number, takerFee: number): KeyPrices {
  const s = sideSign(direction);
  const dist = Math.abs(entry - stop);
  return {
    breakeven: entry * (1 + s * 2 * takerFee),
    r1: entry + s * dist,
    r2: entry + s * 2 * dist,
    r3: entry + s * 3 * dist,
  };
}

export function calcPosition(input: PositionInput): PositionResult {
  const { direction, entry, stop, target, riskU, marginBudget, major, settings } = input;
  const levCap = major ? settings.levCapMajor : settings.levCapAlt;
  const mmr = major ? settings.mmrMajor : settings.mmrAlt;
  const costPct = 2 * settings.takerFee + settings.slippage;
  const priceError = validatePrices(direction, entry, stop, target);
  const prices = keyPrices(direction, entry, stop, settings.takerFee);

  if (priceError) {
    return {
      ok: false, error: priceError, priceError, stopPct: 0, rewardPct: 0, costPct, rr: 0,
      notional: 0, qty: 0, levCap, mmr, minLev: 0, safeMaxLev: 0,
      leverage: null, margin: null, liq: null, liqPct: null, prices,
    };
  }

  const stopPct = Math.abs(entry - stop) / entry;
  const rewardPct = Math.abs(target - entry) / entry;
  const rr = (rewardPct - costPct) / (stopPct + costPct);
  const notional = riskU / (stopPct + costPct);
  const qty = notional / entry;

  let safeMaxLev = 0;
  for (let lev = levCap; lev >= 1; lev--) {
    if (liqDistance(direction, lev, mmr) >= settings.liqSafety * stopPct) {
      safeMaxLev = lev;
      break;
    }
  }

  let error: string | null = null;
  let minLev = 0;
  if (!(marginBudget > 0)) {
    error = '先在「资金」页填写 A 账户余额';
  } else {
    minLev = Math.max(1, Math.ceil(notional / marginBudget - 1e-9));
    if (minLev > levCap) {
      error = `止损太窄：这笔仓位至少要 ${minLev} 倍杠杆才放得进作战金，超过 ${levCap} 倍红线`;
    } else if (safeMaxLev < minLev) {
      error =
        safeMaxLev === 0
          ? '止损太宽：任何杠杆下强平价都会先于止损'
          : `止损太宽：要让强平价落在止损外面最多只能用 ${safeMaxLev} 倍，但作战金需要 ${minLev} 倍才放得下`;
    }
  }

  const leverage = error ? null : safeMaxLev;
  return {
    ok: !error,
    error,
    priceError: null,
    stopPct,
    rewardPct,
    costPct,
    rr,
    notional,
    qty,
    levCap,
    mmr,
    minLev,
    safeMaxLev,
    leverage,
    margin: leverage ? notional / leverage : null,
    liq: leverage ? liqPrice(direction, entry, leverage, mmr) : null,
    liqPct: leverage ? liqDistance(direction, leverage, mmr) : null,
    prices,
  };
}
