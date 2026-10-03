import { sideSign } from './position';
import type { Trade } from './types';

export interface TradeStats {
  openQty: number;
  avgEntry: number;
  baseQty: number;
  realized: number;
  fees: number;
  net: number;
  r: number;
}

/** 按成交记录逐笔结算：开仓摊薄均价，平仓按当时均价实现盈亏，每笔成交都按吃单费率扣费。 */
export function tradeStats(trade: Trade, takerFee: number): TradeStats {
  const s = sideSign(trade.direction);
  let qty = 0;
  let avg = 0;
  let realized = 0;
  let fees = 0;
  for (const f of trade.fills) {
    fees += f.qty * f.price * takerFee;
    if (f.kind === 'open') {
      avg = (qty * avg + f.qty * f.price) / (qty + f.qty);
      qty += f.qty;
    } else {
      const q = Math.min(f.qty, qty);
      realized += q * s * (f.price - avg);
      qty -= q;
    }
  }
  const baseQty = trade.fills.find((f) => f.kind === 'open')?.qty ?? 0;
  if (qty < baseQty * 1e-9) qty = 0;
  const net = realized - fees;
  return {
    openQty: qty,
    avgEntry: avg,
    baseQty,
    realized,
    fees,
    net,
    r: trade.plan.riskU > 0 ? net / trade.plan.riskU : 0,
  };
}

/** 按现价全部平掉时这笔交易的净盈亏（含预估平仓手续费）。 */
export function markToMarket(trade: Trade, stats: TradeStats, price: number, takerFee: number): number {
  const s = sideSign(trade.direction);
  return stats.net + stats.openQty * (s * (price - stats.avgEntry) - price * takerFee);
}

export function closedTradesByTime(trades: Trade[]): Trade[] {
  return trades
    .filter((t) => t.status === 'closed' && t.closedAt)
    .sort((x, y) => Date.parse(x.closedAt!) - Date.parse(y.closedAt!));
}
