import { describe, expect, it } from 'vitest';
import { markToMarket, tradeStats } from './trade';
import type { Trade } from './types';

const plan = { entry: 100, stop: 97, target: 110, leverage: 10, qty: 1, notional: 100, margin: 10, riskU: 3, liq: 90, rr: 3 };

function trade(fills: Trade['fills'], direction: Trade['direction'] = 'long'): Trade {
  return {
    id: 't', symbol: 'BTCUSDT', direction, createdAt: '2026-01-01T00:00:00Z', viaGate: true, level: 0,
    plan, fills, currentStop: 97, status: 'open',
  };
}

const at = '2026-01-01T00:00:00Z';

describe('交易结算', () => {
  it('分批平仓按均价实现盈亏，每笔成交扣手续费', () => {
    const s = tradeStats(trade([
      { kind: 'open', qty: 1, price: 100, at },
      { kind: 'close', qty: 0.5, price: 109, at },
      { kind: 'close', qty: 0.5, price: 103, at },
    ]), 0.0005);
    expect(s.realized).toBeCloseTo(6, 10);
    expect(s.fees).toBeCloseTo((100 + 54.5 + 51.5) * 0.0005, 10);
    expect(s.net).toBeCloseTo(6 - 0.103, 10);
    expect(s.r).toBeCloseTo((6 - 0.103) / 3, 10);
    expect(s.openQty).toBe(0);
  });

  it('加仓摊薄均价', () => {
    const s = tradeStats(trade([
      { kind: 'open', qty: 1, price: 100, at },
      { kind: 'open', qty: 0.5, price: 110, at },
    ]), 0);
    expect(s.avgEntry).toBeCloseTo(103.3333333, 6);
    expect(s.baseQty).toBe(1);
    expect(s.openQty).toBe(1.5);
  });

  it('做空盈亏方向相反', () => {
    const s = tradeStats(trade([
      { kind: 'open', qty: 2, price: 100, at },
      { kind: 'close', qty: 2, price: 94, at },
    ], 'short'), 0);
    expect(s.realized).toBeCloseTo(12, 10);
  });

  it('按现价估算浮动盈亏（含平仓手续费）', () => {
    const t = trade([{ kind: 'open', qty: 1, price: 100, at }]);
    const s = tradeStats(t, 0.0005);
    expect(markToMarket(t, s, 106, 0.0005)).toBeCloseTo(6 - 0.05 - 0.053, 10);
  });
});
