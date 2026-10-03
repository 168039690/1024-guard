import { isMajor } from './defaults';
import { fmtBig, fmtPct, fmtPrice, fmtU } from './format';
import { levelAction, levelInfo, type LevelAction, type LevelInfo } from './levels';
import { activeLocks, type Lock } from './locks';
import { calcPosition, type PositionResult } from './position';
import { TREND_LABEL } from './trend';
import type { AppState, Direction, TrendInfo, TrendState } from './types';

export type CheckStatus = 'pass' | 'fail' | 'wait';

export interface Check {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface MarketSnapshot {
  loading: boolean;
  error: string | null;
  source: 'futures' | 'spot' | null;
  btc1d: TrendInfo | null;
  coin4h: TrendInfo | null;
  quoteVolume: number | null;
  lastPrice: number | null;
}

export const EMPTY_MARKET: MarketSnapshot = {
  loading: false,
  error: null,
  source: null,
  btc1d: null,
  coin4h: null,
  quoteVolume: null,
  lastPrice: null,
};

export interface GateInput {
  symbol: string;
  direction: Direction;
  entry: number;
  stop: number;
  target: number;
  checklist: boolean[];
  market: MarketSnapshot;
  state: AppState;
  now: number;
  phone: boolean;
}

export interface GateResult {
  checks: Check[];
  position: PositionResult;
  locks: Lock[];
  level: LevelInfo;
  action: LevelAction;
  total: number;
  pass: boolean;
}

export const CHECKLIST = [
  '4H 图上已经走完：突破关键位 → 缩量回踩 → 确认支撑拐头',
  '目标价是最近的强阻力（做空看强支撑），不是我希望的价格',
  '开仓的同时挂好系统止损单，之后只往有利方向移',
  '我现在不是想翻本、不是无聊、不是上头',
];

export const MAX_ENTRY_DEVIATION = 0.01;

export function envAllows(direction: Direction, major: boolean, btc: TrendState): { ok: boolean; why: string } {
  if (major) {
    if (direction === 'long' && btc === 'down') return { ok: false, why: 'BTC 日线下跌，不做多' };
    if (direction === 'short' && btc === 'up') return { ok: false, why: 'BTC 日线上涨，不做空' };
    return { ok: true, why: '' };
  }
  if (direction === 'long' && btc !== 'up') return { ok: false, why: 'BTC 下跌或方向不明，禁止做多山寨' };
  if (direction === 'short' && btc !== 'down') return { ok: false, why: 'BTC 上涨或方向不明，禁止做空山寨' };
  return { ok: true, why: '' };
}

export function trendText(name: string, timeframe: string, t: TrendInfo): string {
  return `${name} ${timeframe}${TREND_LABEL[t.state]}（收盘 ${fmtPrice(t.close)} · EMA20 ${fmtPrice(t.ema20)} · EMA50 ${fmtPrice(t.ema50)}）`;
}

export function planKey(symbol: string, direction: Direction, stop: number, target: number): string {
  return `${symbol}|${direction}|${stop}|${target}`;
}

/** 最近一次平仓之后还没更新过余额：等级判断用的总资金已经过期。 */
export function balancesStale(state: AppState): boolean {
  const lastClose = state.trades.reduce((m, t) => (t.closedAt && t.closedAt > m ? t.closedAt : m), '');
  if (!lastClose) return false;
  return !state.balances.updatedAt || state.balances.updatedAt < lastClose;
}

export function evaluateGate(i: GateInput): GateResult {
  const { state, market, direction, symbol } = i;
  const st = state.settings;
  const level = levelInfo(state.level, st.baseCapital);
  const { a, b, c } = state.balances;
  const total = a + b + c;
  const action = levelAction(state.level, total, st.baseCapital);
  const locks = activeLocks(state, i.now);
  const major = isMajor(symbol);
  const position = calcPosition({
    direction,
    entry: i.entry,
    stop: i.stop,
    target: i.target,
    riskU: level.risk,
    marginBudget: a > 0 ? Math.min(a, level.a) : 0,
    major,
    settings: st,
  });

  const checks: Check[] = [];
  const add = (id: string, label: string, status: CheckStatus, detail: string) =>
    checks.push({ id, label, status, detail });

  add('device', '设备', i.phone ? 'fail' : 'pass', i.phone ? '手机禁止开仓，回电脑上操作' : '电脑端');

  add(
    'locks',
    '冷却与锁定',
    locks.length ? 'fail' : 'pass',
    locks.length ? locks.map((l) => l.reason).join('；') : '没有生效中的锁定',
  );

  if (total <= 0) add('level', '资金与等级', 'fail', '先在「资金」页填写 A / B / C 余额');
  else if (balancesStale(state)) add('level', '资金与等级', 'fail', '平仓后还没更新余额：先去「资金」页填最新余额并结算');
  else if (action.kind === 'exit')
    add('level', '资金与等级', 'fail', `总资金 ${fmtU(total)}U 已到 Lv0 出局线 ${fmtU(levelInfo(0, st.baseCapital).downgradeAt)}U：全部提现，退出市场`);
  else if (action.kind === 'downgrade') add('level', '资金与等级', 'fail', `总资金跌到降级线，先去「资金」页执行降级到 Lv${action.to}`);
  else if (action.kind === 'upgrade') add('level', '资金与等级', 'fail', `已达升级门槛，暂停交易，先去「资金」页执行升级到 Lv${action.to}`);
  else if (action.kind === 'clear') add('level', '资金与等级', 'fail', '通关：全部提现');
  else add('level', '资金与等级', 'pass', `Lv${state.level} · 单笔风险 ${fmtU(level.risk)}U`);

  const open = state.trades.filter((t) => t.status === 'open');
  if (state.level < 2 && open.length) add('positions', '持仓', 'fail', 'Lv2 之前只能同时持有一个仓位');
  else if (open.some((t) => t.symbol === symbol)) add('positions', '持仓', 'fail', '这个币已经有持仓');
  else if (open.some((t) => t.direction === direction)) add('positions', '持仓', 'fail', '已有同方向持仓（同向风控）');
  else add('positions', '持仓', 'pass', open.length ? '没有冲突的持仓' : '空仓');

  const marketWait = market.loading ? '读取行情中…' : null;
  const marketFail = market.error ?? '没有行情数据';

  if (marketWait) add('env', 'BTC 日线环境', 'wait', marketWait);
  else if (!market.btc1d) add('env', 'BTC 日线环境', 'fail', marketFail);
  else {
    const env = envAllows(direction, major, market.btc1d.state);
    add('env', 'BTC 日线环境', env.ok ? 'pass' : 'fail', trendText('BTC', '日线', market.btc1d) + (env.ok ? '' : `：${env.why}`));
  }

  if (marketWait) add('right', '右侧交易（4H）', 'wait', marketWait);
  else if (!market.coin4h) add('right', '右侧交易（4H）', 'fail', marketFail);
  else {
    const want: TrendState = direction === 'long' ? 'up' : 'down';
    const ok = market.coin4h.state === want;
    add('right', '右侧交易（4H）', ok ? 'pass' : 'fail',
      trendText(symbol.replace(/USDT$/, ''), '4H ', market.coin4h) + (ok ? '' : `：只做右侧，${direction === 'long' ? '做多要 4H 上涨' : '做空要 4H 下跌'}`));
  }

  if (marketWait) add('volume', '流动性', 'wait', marketWait);
  else if (market.quoteVolume == null) add('volume', '流动性', 'fail', marketFail);
  else {
    const ok = market.quoteVolume >= st.minQuoteVolume;
    const src = market.source === 'spot' ? '现货' : '合约';
    add('volume', '流动性', ok ? 'pass' : 'fail',
      `24h ${src}成交额 ${fmtBig(market.quoteVolume)} USDT` + (ok ? '' : `，低于 ${fmtBig(st.minQuoteVolume)}，不碰`));
  }

  if (position.priceError) add('price', '价格', 'fail', position.priceError);
  else if (marketWait) add('price', '价格', 'wait', marketWait);
  else if (market.lastPrice == null) add('price', '价格', 'fail', marketFail);
  else {
    const dev = Math.abs(i.entry - market.lastPrice) / market.lastPrice;
    const ok = dev <= MAX_ENTRY_DEVIATION;
    add('price', '价格', ok ? 'pass' : 'fail',
      ok ? `入场价贴近现价 ${fmtPrice(market.lastPrice)}（市价进场）` : `入场价偏离现价 ${fmtPct(dev)}，市价进场请用现价 ${fmtPrice(market.lastPrice)}`);
  }

  if (position.priceError) add('rr', '盈亏比', 'fail', '先把价格填对');
  else {
    const ok = position.rr >= st.minRR;
    add('rr', '盈亏比', ok ? 'pass' : 'fail',
      `扣除成本后 1:${position.rr.toFixed(2)}` + (ok ? '' : `，低于 1:${st.minRR}，宁可踏空`));
  }

  if (position.priceError) add('sizing', '仓位与杠杆', 'fail', '先把价格填对');
  else if (position.error) add('sizing', '仓位与杠杆', 'fail', position.error);
  else {
    add('sizing', '仓位与杠杆', 'pass',
      `${position.leverage} 倍逐仓 · 保证金 ${fmtU(position.margin!)}U · 强平距离是止损的 ${(position.liqPct! / position.stopPct).toFixed(1)} 倍`);
  }

  const ticked = i.checklist.filter(Boolean).length;
  add('checklist', '自查清单', ticked === CHECKLIST.length ? 'pass' : 'fail', `${ticked}/${CHECKLIST.length} 项已确认`);

  return { checks, position, locks, level, action, total, pass: checks.every((ch) => ch.status === 'pass') };
}
