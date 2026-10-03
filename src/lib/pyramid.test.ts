import { describe, expect, it } from 'vitest';
import { calcPyramid, type PyramidInput } from './pyramid';

const long: PyramidInput = {
  direction: 'long',
  openQty: 1,
  avgEntry: 100,
  baseQty: 1,
  realizedNet: -0.05,
  currentStop: 100,
  addPrice: 120,
  newStop: 112,
  takerFee: 0.0005,
  slippage: 0.0005,
};

describe('浮盈加仓', () => {
  it('锁定利润充足时，加仓量受「不超过底仓」限制，打到新止损仍盈利', () => {
    const r = calcPyramid(long);
    expect(r.error).toBeNull();
    expect(r.lockedProfit).toBeCloseTo(-0.05 + 12 - 0.056, 10);
    expect(r.perUnitLoss).toBeCloseTo(8 + 0.116 + 0.06, 10);
    expect(r.maxByRisk).toBeGreaterThan(1);
    expect(r.qty).toBe(1);
    expect(r.newAvg).toBeCloseTo(110, 10);
    expect(r.pnlAtStop).toBeGreaterThan(0);
  });

  it('锁定利润不足时按风险封顶，打到新止损正好不亏', () => {
    const r = calcPyramid({ ...long, newStop: 105 });
    expect(r.qty).toBeLessThan(1);
    expect(r.qty).toBeCloseTo(r.lockedProfit / r.perUnitLoss, 12);
    expect(r.pnlAtStop).toBeCloseTo(0, 9);
  });

  it('已实现的减仓利润也算锁定利润', () => {
    const r = calcPyramid({ ...long, openQty: 0.5, realizedNet: 4.4, newStop: 105 });
    const without = calcPyramid({ ...long, openQty: 0.5, realizedNet: -0.05, newStop: 105 });
    expect(r.qty).toBeGreaterThan(without.qty);
  });

  it('止损还没推到保本不能加', () => {
    expect(calcPyramid({ ...long, currentStop: 97 }).error).toContain('保本');
  });

  it('新止损不能比当前止损更差', () => {
    expect(calcPyramid({ ...long, currentStop: 106, newStop: 104 }).error).toContain('有利方向');
  });

  it('新止损必须在加仓价的止损一侧', () => {
    expect(calcPyramid({ ...long, newStop: 121 }).error).toContain('低于加仓价');
  });

  it('新止损还在均价下方时锁定利润为负，不能加', () => {
    const r = calcPyramid({ ...long, currentStop: 100, newStop: 100 });
    expect(r.qty).toBe(0);
    expect(r.error).toContain('不够');
  });

  it('做空对称', () => {
    const r = calcPyramid({
      ...long,
      direction: 'short',
      currentStop: 100,
      addPrice: 80,
      newStop: 88,
    });
    expect(r.error).toBeNull();
    expect(r.lockedProfit).toBeCloseTo(-0.05 + 12 - 0.044, 10);
    expect(r.perUnitLoss).toBeCloseTo(8 + (80 + 88) * 0.0005 + 80 * 0.0005, 10);
    expect(r.pnlAtStop).toBeGreaterThanOrEqual(0);
  });
});
