import type { AppState } from './types';

export interface TruthSummary {
  depositCny: number;
  withdrawCny: number;
  balanceU: number;
  balanceCny: number;
  netLossCny: number;
}

export function truthSummary(state: AppState): TruthSummary {
  let depositCny = 0;
  let withdrawCny = 0;
  for (const e of state.ledger) {
    if (e.type === 'deposit') depositCny += e.cny;
    else withdrawCny += e.cny;
  }
  const { a, b, c } = state.balances;
  const balanceU = a + b + c;
  const balanceCny = balanceU * state.settings.usdtCny;
  return {
    depositCny,
    withdrawCny,
    balanceU,
    balanceCny,
    netLossCny: depositCny - withdrawCny - balanceCny,
  };
}
