import { closedTradesByTime, tradeStats } from './trade';
import { truthSummary } from './truth';
import type { AppState, EventKind } from './types';

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
/** 净亏损达到 0.5R 及以上算一笔止损（保本离场的手续费小亏不算）。 */
export const LOSS_R = -0.5;
export const AFTER_CLOSE_WAIT = 4 * HOUR;
export const TWO_LOSS_WAIT = 24 * HOUR;

export const LOCK_DAYS: Partial<Record<EventKind, number>> = { violation: 7, downgrade: 7, exit: 30 };

export const EVENT_LABEL: Record<EventKind, string> = {
  violation: '违规开单',
  downgrade: '降级熔断',
  exit: 'Lv0 出局',
  upgrade: '升级',
  clear: '通关',
  skip: '忍住一笔',
  settle: '空仓结算',
};

export interface Lock {
  kind: string;
  reason: string;
  until: number | null;
}

export function lockUntilFor(kind: EventKind, at: number): string | undefined {
  const days = LOCK_DAYS[kind];
  return days ? new Date(at + days * DAY).toISOString() : undefined;
}

export function activeLocks(state: AppState, now: number): Lock[] {
  const locks: Lock[] = [];

  for (const e of state.events) {
    if (!e.lockUntil) continue;
    const until = Date.parse(e.lockUntil);
    if (until > now) {
      const detail = e.detail ? `（${e.detail}）` : '';
      locks.push({ kind: e.kind, reason: `${EVENT_LABEL[e.kind]}${detail}，冷静 ${LOCK_DAYS[e.kind]} 天`, until });
    }
  }

  const closed = closedTradesByTime(state.trades);
  const last = closed[closed.length - 1];
  if (last) {
    const at = Date.parse(last.closedAt!);
    if (at + AFTER_CLOSE_WAIT > now) {
      locks.push({ kind: 'after-close', reason: '平仓后至少等一根完整的 4H K 线再开新单', until: at + AFTER_CLOSE_WAIT });
    }
    const prev = closed[closed.length - 2];
    const fee = state.settings.takerFee;
    if (prev && at + TWO_LOSS_WAIT > now && tradeStats(last, fee).r <= LOSS_R && tradeStats(prev, fee).r <= LOSS_R) {
      locks.push({ kind: 'two-losses', reason: '连续 2 笔止损，停止交易 24 小时', until: at + TWO_LOSS_WAIT });
    }
  }

  const cap = state.settings.lossCapCny;
  if (cap && cap > 0 && truthSummary(state).netLossCny >= cap) {
    locks.push({ kind: 'loss-cap', reason: '累计净亏损达到你定的上限：终极熔断，永久退出', until: null });
  }

  return locks.sort((x, y) => (y.until ?? Infinity) - (x.until ?? Infinity));
}
