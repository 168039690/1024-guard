import type { AppState, Settings } from './types';

export const DEFAULT_SETTINGS: Settings = {
  baseCapital: 1000,
  takerFee: 0.0005,
  slippage: 0.0005,
  mmrMajor: 0.005,
  mmrAlt: 0.02,
  levCapMajor: 10,
  levCapAlt: 5,
  liqSafety: 1.5,
  minQuoteVolume: 50_000_000,
  minRR: 3,
  coolMinutes: 10,
  usdtCny: 7.2,
  lossCapCny: null,
  dataSource: 'auto',
};

export const MAJORS = ['BTCUSDT', 'ETHUSDT'];

export function isMajor(symbol: string): boolean {
  return MAJORS.includes(symbol);
}

export function initialState(): AppState {
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS },
    level: 0,
    balances: { a: 0, b: 0, c: 0, updatedAt: null },
    trades: [],
    events: [],
    ledger: [],
    pending: null,
  };
}
