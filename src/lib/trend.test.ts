import { describe, expect, it } from 'vitest';
import { classifyTrend, ema } from './trend';

describe('EMA', () => {
  it('常数序列的 EMA 等于常数', () => {
    const out = ema(Array(30).fill(5), 10);
    expect(out[8]).toBeNaN();
    expect(out[9]).toBe(5);
    expect(out[29]).toBe(5);
  });

  it('以简单均值为种子递推', () => {
    const out = ema([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3);
    expect(out[2]).toBe(2);
    expect(out[3]).toBe(3);
    expect(out[9]).toBe(9);
  });
});

describe('趋势分类', () => {
  it('数据不足返回空', () => {
    expect(classifyTrend(Array(59).fill(1))).toBeNull();
  });

  it('持续上涨 = 上涨', () => {
    const closes = Array.from({ length: 200 }, (_, i) => 100 + i);
    expect(classifyTrend(closes)?.state).toBe('up');
  });

  it('持续下跌 = 下跌', () => {
    const closes = Array.from({ length: 200 }, (_, i) => 300 - i);
    expect(classifyTrend(closes)?.state).toBe('down');
  });

  it('上涨后急跌到 EMA50 下方，但 EMA20 仍在 EMA50 上方 = 方向不明', () => {
    const closes = Array.from({ length: 199 }, (_, i) => 100 + i);
    closes.push(200);
    const t = classifyTrend(closes)!;
    expect(t.ema20).toBeGreaterThan(t.ema50);
    expect(t.close).toBeLessThan(t.ema50);
    expect(t.state).toBe('unclear');
  });

  it('上涨中回踩到 EMA20 下方、仍在 EMA50 上方 = 仍是上涨', () => {
    const closes = Array.from({ length: 199 }, (_, i) => 100 + i);
    closes.push(285);
    const t = classifyTrend(closes)!;
    expect(t.close).toBeLessThan(t.ema20);
    expect(t.close).toBeGreaterThan(t.ema50);
    expect(t.state).toBe('up');
  });
});
