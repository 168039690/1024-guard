import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './defaults';
import { calcPosition, liqDistance, liqPrice, type PositionInput } from './position';

const base: PositionInput = {
  direction: 'long',
  entry: 100000,
  stop: 97000,
  target: 110000,
  riskU: 30,
  marginBudget: 300,
  major: true,
  settings: DEFAULT_SETTINGS,
};

describe('仓位倒推', () => {
  it('手册例子：30U 风险、3% 止损 → 约 952U 开仓价值，10 倍保证金约 95U', () => {
    const r = calcPosition(base);
    expect(r.ok).toBe(true);
    expect(r.costPct).toBeCloseTo(0.0015, 10);
    expect(r.stopPct).toBeCloseTo(0.03, 10);
    expect(r.notional).toBeCloseTo(30 / 0.0315, 6);
    expect(r.notional).toBeCloseTo(952.38, 2);
    expect(r.qty).toBeCloseTo(0.0095238, 6);
    expect(r.leverage).toBe(10);
    expect(r.margin).toBeCloseTo(95.238, 3);
    expect(r.liq).toBeCloseTo((100000 * 0.9) / 0.995, 6);
    expect(r.liqPct! / r.stopPct).toBeGreaterThan(3);
  });

  it('打到止损的亏损正好等于单笔风险（含成本）', () => {
    const r = calcPosition(base);
    expect(r.notional * (r.stopPct + r.costPct)).toBeCloseTo(30, 9);
  });

  it('净盈亏比扣除成本', () => {
    const r = calcPosition(base);
    expect(r.rr).toBeCloseTo((0.1 - 0.0015) / (0.03 + 0.0015), 10);
    expect(calcPosition({ ...base, target: 105000 }).rr).toBeLessThan(3);
  });

  it('关键价位：保本含双边手续费，1R/2R/3R 按止损距离', () => {
    const r = calcPosition({ ...base, entry: 100, stop: 97, target: 110 });
    expect(r.prices.breakeven).toBeCloseTo(100.1, 10);
    expect(r.prices.r1).toBeCloseTo(103, 10);
    expect(r.prices.r2).toBeCloseTo(106, 10);
    expect(r.prices.r3).toBeCloseTo(109, 10);
    const s = calcPosition({ ...base, direction: 'short', entry: 100, stop: 103, target: 90 });
    expect(s.prices.breakeven).toBeCloseTo(99.9, 10);
    expect(s.prices.r2).toBeCloseTo(94, 10);
  });
});

describe('杠杆由止损倒推', () => {
  it('强平距离必须 ≥ 1.5 倍止损距离：山寨 12% 止损可用 5 倍，13% 只能 4 倍', () => {
    const alt = { ...base, major: false, entry: 1, target: 1.5 };
    const a = calcPosition({ ...alt, stop: 0.88 });
    expect(liqDistance('long', 5, 0.02)).toBeGreaterThanOrEqual(0.18);
    expect(a.leverage).toBe(5);
    const b = calcPosition({ ...alt, stop: 0.87 });
    expect(b.leverage).toBe(4);
    expect(b.liqPct!).toBeGreaterThanOrEqual(1.5 * b.stopPct);
  });

  it('止损太窄：放进作战金需要的杠杆超过红线就拒绝', () => {
    const r = calcPosition({ ...base, stop: 99700 });
    expect(r.ok).toBe(false);
    expect(r.minLev).toBe(23);
    expect(r.error).toContain('止损太窄');
  });

  it('作战金余额不足时需要的杠杆变高', () => {
    const r = calcPosition({ ...base, marginBudget: 90 });
    expect(r.minLev).toBe(11);
    expect(r.ok).toBe(false);
  });

  it('没有余额时提示先填资金', () => {
    expect(calcPosition({ ...base, marginBudget: 0 }).error).toContain('资金');
  });

  it('做空的强平价在上方', () => {
    const r = calcPosition({ ...base, direction: 'short', entry: 100, stop: 103, target: 90 });
    expect(r.ok).toBe(true);
    expect(r.leverage).toBe(10);
    expect(r.liq).toBeCloseTo((100 * 1.1) / 1.005, 9);
    expect(r.liq!).toBeGreaterThan(103);
  });

  it('强平价公式与强平距离一致', () => {
    for (const lev of [2, 5, 10]) {
      expect(1 - liqPrice('long', 100, lev, 0.005) / 100).toBeCloseTo(liqDistance('long', lev, 0.005), 12);
      expect(liqPrice('short', 100, lev, 0.005) / 100 - 1).toBeCloseTo(liqDistance('short', lev, 0.005), 12);
    }
  });
});

describe('价格校验', () => {
  it('做多止损必须在下方、目标在上方', () => {
    expect(calcPosition({ ...base, stop: 101000 }).priceError).toContain('止损');
    expect(calcPosition({ ...base, target: 99000 }).priceError).toContain('目标');
  });

  it('做空止损必须在上方、目标在下方', () => {
    expect(calcPosition({ ...base, direction: 'short' }).priceError).toContain('止损');
  });

  it('空输入', () => {
    expect(calcPosition({ ...base, entry: NaN }).priceError).toBeTruthy();
  });
});
