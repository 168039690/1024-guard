import { describe, expect, it } from 'vitest';
import { initialState } from './defaults';
import { envAllows, evaluateGate, type GateInput, type MarketSnapshot } from './gate';
import { activeLocks, HOUR } from './locks';
import type { AppState, Trade } from './types';

const NOW = Date.parse('2026-10-03T12:00:00Z');

function stateWith(patch: Partial<AppState> = {}): AppState {
  return { ...initialState(), balances: { a: 300, b: 600, c: 100, updatedAt: null }, ...patch };
}

const goodMarket: MarketSnapshot = {
  loading: false,
  error: null,
  source: 'futures',
  btc1d: { state: 'up', close: 100000, ema20: 98000, ema50: 95000 },
  coin4h: { state: 'up', close: 100000, ema20: 99000, ema50: 97000 },
  quoteVolume: 5e9,
  lastPrice: 100000,
};

function input(patch: Partial<GateInput> = {}): GateInput {
  return {
    symbol: 'BTCUSDT',
    direction: 'long',
    entry: 100000,
    stop: 97000,
    target: 110000,
    checklist: [true, true, true, true],
    market: goodMarket,
    state: stateWith(),
    now: NOW,
    phone: false,
    ...patch,
  };
}

function closed(id: string, hoursAgo: number, exit: number): Trade {
  return {
    id, symbol: 'BTCUSDT', direction: 'long', createdAt: new Date(NOW - 48 * HOUR).toISOString(), viaGate: true, level: 0,
    plan: { entry: 100, stop: 97, target: 110, leverage: 10, qty: 10, notional: 1000, margin: 100, riskU: 30, liq: 90, rr: 3 },
    fills: [
      { kind: 'open', qty: 10, price: 100, at: new Date(NOW - 48 * HOUR).toISOString() },
      { kind: 'close', qty: 10, price: exit, at: new Date(NOW - hoursAgo * HOUR).toISOString() },
    ],
    currentStop: 97, status: 'closed', closedAt: new Date(NOW - hoursAgo * HOUR).toISOString(),
  };
}

const failed = (r: ReturnType<typeof evaluateGate>) => r.checks.filter((c) => c.status !== 'pass').map((c) => c.id);

describe('闸门', () => {
  it('全部满足时放行', () => {
    const r = evaluateGate(input());
    expect(failed(r)).toEqual([]);
    expect(r.pass).toBe(true);
  });

  it('手机禁止开仓', () => {
    expect(failed(evaluateGate(input({ phone: true })))).toEqual(['device']);
  });

  it('BTC 方向不明时禁止做多山寨，但不影响做多 BTC', () => {
    const market = { ...goodMarket, btc1d: { ...goodMarket.btc1d!, state: 'unclear' as const } };
    expect(failed(evaluateGate(input({ market, symbol: 'SOLUSDT' })))).toContain('env');
    expect(failed(evaluateGate(input({ market })))).not.toContain('env');
  });

  it('环境规则矩阵', () => {
    expect(envAllows('long', false, 'up').ok).toBe(true);
    expect(envAllows('long', false, 'down').ok).toBe(false);
    expect(envAllows('short', false, 'up').ok).toBe(false);
    expect(envAllows('short', false, 'unclear').ok).toBe(false);
    expect(envAllows('short', false, 'down').ok).toBe(true);
    expect(envAllows('long', true, 'down').ok).toBe(false);
    expect(envAllows('short', true, 'up').ok).toBe(false);
    expect(envAllows('short', true, 'unclear').ok).toBe(true);
  });

  it('币种 4H 方向不一致就不是右侧', () => {
    const market = { ...goodMarket, coin4h: { ...goodMarket.coin4h!, state: 'unclear' as const } };
    expect(failed(evaluateGate(input({ market })))).toEqual(['right']);
  });

  it('成交额不足 5000 万不碰', () => {
    expect(failed(evaluateGate(input({ market: { ...goodMarket, quoteVolume: 3e7 } })))).toEqual(['volume']);
  });

  it('盈亏比不足 3 不开', () => {
    expect(failed(evaluateGate(input({ target: 105000 })))).toEqual(['rr']);
  });

  it('入场价偏离现价超过 1% 要求用现价', () => {
    expect(failed(evaluateGate(input({ entry: 98500, stop: 95500, target: 108000 })))).toContain('price');
  });

  it('自查清单没勾完不放行', () => {
    expect(failed(evaluateGate(input({ checklist: [true, true, true, false] })))).toEqual(['checklist']);
  });

  it('行情读取中不放行', () => {
    const r = evaluateGate(input({ market: { ...goodMarket, loading: true } }));
    expect(r.pass).toBe(false);
    expect(r.checks.find((c) => c.id === 'env')?.status).toBe('wait');
  });

  it('Lv2 之前已有持仓就不能再开', () => {
    const open = { ...closed('o', 1, 100), status: 'open' as const, closedAt: undefined, symbol: 'ETHUSDT', direction: 'short' as const };
    expect(failed(evaluateGate(input({ state: stateWith({ trades: [open] }) })))).toEqual(['positions']);
  });

  it('Lv2 之后不能同向', () => {
    const open = { ...closed('o', 1, 100), status: 'open' as const, closedAt: undefined, symbol: 'ETHUSDT' };
    const state = stateWith({ level: 2, trades: [open], balances: { a: 1200, b: 2400, c: 400, updatedAt: null } });
    expect(failed(evaluateGate(input({ state })))).toEqual(['positions']);
  });

  it('总资金到出局线就锁死', () => {
    const state = stateWith({ balances: { a: 300, b: 350, c: 100, updatedAt: null } });
    const r = evaluateGate(input({ state }));
    expect(r.action.kind).toBe('exit');
    expect(failed(r)).toContain('level');
  });

  it('没填资金不放行', () => {
    const r = evaluateGate(input({ state: { ...initialState() } }));
    expect(failed(r)).toEqual(expect.arrayContaining(['level', 'sizing']));
  });

  it('平仓后没更新余额就不放行', () => {
    const trades = [closed('a', 5, 110)];
    expect(failed(evaluateGate(input({ state: stateWith({ trades }) })))).toEqual(['level']);
    const balances = { a: 330, b: 600, c: 100, updatedAt: new Date(NOW - HOUR).toISOString() };
    expect(failed(evaluateGate(input({ state: stateWith({ trades, balances }) })))).toEqual([]);
  });
});

describe('锁定', () => {
  it('平仓后 4 小时内不开新单', () => {
    const locks = activeLocks(stateWith({ trades: [closed('a', 1, 110)] }), NOW);
    expect(locks.map((l) => l.kind)).toEqual(['after-close']);
    expect(activeLocks(stateWith({ trades: [closed('a', 5, 110)] }), NOW)).toEqual([]);
  });

  it('连续 2 笔止损锁 24 小时', () => {
    const trades = [closed('a', 10, 97), closed('b', 6, 97)];
    const locks = activeLocks(stateWith({ trades }), NOW);
    expect(locks.map((l) => l.kind)).toEqual(['two-losses']);
    expect(locks[0].until).toBe(NOW - 6 * HOUR + 24 * HOUR);
  });

  it('保本离场的手续费小亏不算止损', () => {
    const trades = [closed('a', 10, 97), closed('b', 6, 99.95)];
    expect(activeLocks(stateWith({ trades }), NOW)).toEqual([]);
  });

  it('违规事件锁 7 天，过期失效', () => {
    const lockUntil = new Date(NOW + 3 * 24 * HOUR).toISOString();
    const events = [{ id: 'v', kind: 'violation' as const, at: new Date(NOW).toISOString(), lockUntil }];
    expect(activeLocks(stateWith({ events }), NOW)[0].kind).toBe('violation');
    expect(activeLocks(stateWith({ events }), NOW + 4 * 24 * HOUR)).toEqual([]);
  });

  it('累计净亏损达到上限 = 永久锁定', () => {
    const state = stateWith({
      ledger: [{ id: 'd', date: '2026-01-01', type: 'deposit', cny: 10700 }],
      settings: { ...initialState().settings, lossCapCny: 3000 },
    });
    const locks = activeLocks(state, NOW);
    expect(locks[0]).toMatchObject({ kind: 'loss-cap', until: null });
  });
});
