import { describe, expect, it } from 'vitest';
import { levelAction, levelInfo, levelTable, settle } from './levels';

describe('等级表', () => {
  it('Lv0 与手册一致', () => {
    expect(levelInfo(0, 1000)).toEqual({
      level: 0, total: 1000, a: 300, b: 600, c: 100, risk: 30, upgradeAt: 2000, downgradeAt: 750,
    });
  });

  it('与仓位管理图逐级一致（Lv1 起降级线 = 上一级的 1.5 倍）', () => {
    const table = levelTable(1000);
    expect(table).toHaveLength(11);
    const expected = [
      [1000, 300, 30, 600, 100, 2000],
      [2000, 600, 60, 1200, 200, 4000],
      [4000, 1200, 120, 2400, 400, 8000],
      [8000, 2400, 240, 4800, 800, 16000],
      [16000, 4800, 480, 9600, 1600, 32000],
      [32000, 9600, 960, 19200, 3200, 64000],
      [64000, 19200, 1920, 38400, 6400, 128000],
      [128000, 38400, 3840, 76800, 12800, 256000],
      [256000, 76800, 7680, 153600, 25600, 512000],
      [512000, 153600, 15360, 307200, 51200, 1024000],
      [1024000, 307200, 30720, 614400, 102400, null],
    ];
    table.forEach((lv, i) => {
      const [total, a, risk, b, c, up] = expected[i];
      expect(lv.total).toBeCloseTo(total!, 6);
      expect(lv.a).toBeCloseTo(a!, 6);
      expect(lv.risk).toBeCloseTo(risk!, 6);
      expect(lv.b).toBeCloseTo(b!, 6);
      expect(lv.c).toBeCloseTo(c!, 6);
      expect(lv.upgradeAt).toBe(up);
      if (i > 0) expect(lv.downgradeAt).toBeCloseTo(table[i - 1].total * 1.5, 6);
    });
    expect(table[10].downgradeAt).toBe(768000);
  });

  it('起点资金按比例缩放', () => {
    const lv = levelInfo(1, 280);
    expect(lv.total).toBe(560);
    expect(lv.risk).toBeCloseTo(16.8, 9);
    expect(lv.downgradeAt).toBe(420);
  });
});

describe('升级 / 降级 / 出局', () => {
  it('未到门槛继续', () => {
    expect(levelAction(0, 1999, 1000)).toEqual({ kind: 'hold' });
    expect(levelAction(0, 751, 1000)).toEqual({ kind: 'hold' });
    expect(levelAction(1, 1600, 1000)).toEqual({ kind: 'hold' });
  });

  it('升级：保留新等级 A+B，其余提现，C 归零', () => {
    expect(levelAction(0, 2000, 1000)).toEqual({ kind: 'upgrade', to: 1, withdraw: 200, target: { a: 600, b: 1200, c: 0 } });
    expect(levelAction(0, 2150, 1000)).toMatchObject({ kind: 'upgrade', to: 1, withdraw: 350 });
  });

  it('一次涨过两级就连升两级', () => {
    expect(levelAction(0, 4500, 1000)).toEqual({ kind: 'upgrade', to: 2, withdraw: 900, target: { a: 1200, b: 2400, c: 0 } });
  });

  it('降级：水位抽干到下一级标准线', () => {
    expect(levelAction(1, 1500, 1000)).toEqual({ kind: 'downgrade', to: 0, withdraw: 500, target: { a: 300, b: 600, c: 100 } });
    expect(levelAction(3, 6000, 1000)).toEqual({ kind: 'downgrade', to: 2, withdraw: 2000, target: { a: 1200, b: 2400, c: 400 } });
  });

  it('一次跌穿多级就连降多级', () => {
    expect(levelAction(2, 1400, 1000)).toEqual({ kind: 'downgrade', to: 0, withdraw: 400, target: { a: 300, b: 600, c: 100 } });
  });

  it('降级后余额低于标准线时不提现，A 先拿满、C 其次', () => {
    expect(levelAction(1, 800, 1000)).toEqual({ kind: 'downgrade', to: 0, withdraw: 0, target: { a: 300, b: 400, c: 100 } });
  });

  it('Lv0 跌到 750 出局，全部提现', () => {
    expect(levelAction(0, 750, 1000)).toEqual({ kind: 'exit', withdraw: 750 });
    expect(levelAction(1, 700, 1000)).toEqual({ kind: 'exit', withdraw: 700 });
  });

  it('到达 Lv10 通关', () => {
    expect(levelAction(9, 1024000, 1000)).toEqual({ kind: 'clear', withdraw: 1024000 });
    expect(levelAction(10, 900000, 1000)).toEqual({ kind: 'clear', withdraw: 900000 });
  });
});

describe('空仓结算', () => {
  it('盈利：C 已满时全部划给 B', () => {
    expect(settle(0, { a: 330, b: 600, c: 100 }, 1000)).toEqual({
      transfers: [{ from: 'A', to: 'B', amount: 30 }],
      after: { a: 300, b: 630, c: 100 },
    });
  });

  it('盈利：C 没满时先补 C', () => {
    expect(settle(1, { a: 660, b: 1200, c: 0 }, 1000)).toEqual({
      transfers: [{ from: 'A', to: 'C', amount: 60 }],
      after: { a: 600, b: 1200, c: 60 },
    });
    expect(settle(1, { a: 900, b: 1200, c: 150 }, 1000)).toEqual({
      transfers: [{ from: 'A', to: 'C', amount: 50 }, { from: 'A', to: 'B', amount: 250 }],
      after: { a: 600, b: 1450, c: 200 },
    });
  });

  it('亏损：从 B 补，B 不够就有多少补多少', () => {
    expect(settle(0, { a: 270, b: 600, c: 100 }, 1000)).toEqual({
      transfers: [{ from: 'B', to: 'A', amount: 30 }],
      after: { a: 300, b: 570, c: 100 },
    });
    expect(settle(0, { a: 100, b: 50, c: 100 }, 1000)).toEqual({
      transfers: [{ from: 'B', to: 'A', amount: 50 }],
      after: { a: 150, b: 0, c: 100 },
    });
  });

  it('A 正好是标准额时不动', () => {
    expect(settle(0, { a: 300, b: 600, c: 100 }, 1000).transfers).toEqual([]);
  });
});
