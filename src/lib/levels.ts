export const MAX_LEVEL = 10;
export const SHARE_A = 0.3;
export const SHARE_B = 0.6;
export const SHARE_C = 0.1;
export const RISK_OF_A = 0.1;
export const DOWNGRADE_RATIO = 0.75;

const EPS = 0.005;

export interface LevelInfo {
  level: number;
  total: number;
  a: number;
  b: number;
  c: number;
  risk: number;
  upgradeAt: number | null;
  downgradeAt: number;
}

export interface Allocation {
  a: number;
  b: number;
  c: number;
}

export function levelInfo(level: number, base: number): LevelInfo {
  const total = base * 2 ** level;
  return {
    level,
    total,
    a: total * SHARE_A,
    b: total * SHARE_B,
    c: total * SHARE_C,
    risk: total * SHARE_A * RISK_OF_A,
    upgradeAt: level < MAX_LEVEL ? total * 2 : null,
    downgradeAt: total * DOWNGRADE_RATIO,
  };
}

export function levelTable(base: number): LevelInfo[] {
  return Array.from({ length: MAX_LEVEL + 1 }, (_, i) => levelInfo(i, base));
}

/** A 先拿满标准额，C 其次，剩下的都在 B。 */
export function allocate(level: number, total: number, base: number): Allocation {
  const info = levelInfo(level, base);
  const a = Math.min(info.a, total);
  const c = Math.min(info.c, total - a);
  return { a, b: total - a - c, c };
}

export type LevelAction =
  | { kind: 'hold' }
  | { kind: 'upgrade'; to: number; withdraw: number; target: Allocation }
  | { kind: 'downgrade'; to: number; withdraw: number; target: Allocation }
  | { kind: 'exit'; withdraw: number }
  | { kind: 'clear'; withdraw: number };

/** 空仓时的总资金决定升级、降级、出局还是继续。 */
export function levelAction(level: number, total: number, base: number): LevelAction {
  if (level >= MAX_LEVEL) return { kind: 'clear', withdraw: total };
  const info = levelInfo(level, base);

  if (info.upgradeAt !== null && total >= info.upgradeAt) {
    let to = level + 1;
    while (to < MAX_LEVEL && total >= levelInfo(to, base).upgradeAt!) to++;
    if (to >= MAX_LEVEL) return { kind: 'clear', withdraw: total };
    const next = levelInfo(to, base);
    return {
      kind: 'upgrade',
      to,
      withdraw: total - next.a - next.b,
      target: { a: next.a, b: next.b, c: 0 },
    };
  }

  if (total <= info.downgradeAt) {
    let to = level;
    while (to > 0 && total <= levelInfo(to, base).downgradeAt) to--;
    if (total <= levelInfo(to, base).downgradeAt) return { kind: 'exit', withdraw: total };
    const lower = levelInfo(to, base);
    const withdraw = Math.max(0, total - lower.total);
    return { kind: 'downgrade', to, withdraw, target: allocate(to, total - withdraw, base) };
  }

  return { kind: 'hold' };
}

export type Account = 'A' | 'B' | 'C';

export interface Transfer {
  from: Account;
  to: Account;
  amount: number;
}

/** 空仓结算：A 重置为标准额。盈利先补满 C 再进 B；亏损从 B 补。 */
export function settle(
  level: number,
  balances: Allocation,
  base: number,
): { transfers: Transfer[]; after: Allocation } {
  const info = levelInfo(level, base);
  let { a, b, c } = balances;
  const transfers: Transfer[] = [];

  if (a > info.a + EPS) {
    let excess = a - info.a;
    const toC = Math.min(excess, Math.max(0, info.c - c));
    if (toC > EPS) {
      transfers.push({ from: 'A', to: 'C', amount: toC });
      c += toC;
      excess -= toC;
    }
    if (excess > EPS) {
      transfers.push({ from: 'A', to: 'B', amount: excess });
      b += excess;
    }
    a = info.a;
  } else if (a < info.a - EPS) {
    const fromB = Math.min(info.a - a, b);
    if (fromB > EPS) {
      transfers.push({ from: 'B', to: 'A', amount: fromB });
      b -= fromB;
      a += fromB;
    }
  }

  return { transfers, after: { a, b, c } };
}
