import { useEffect, useMemo, useState } from 'react';
import { CoolOffGuide } from '../components/CoolOff';
import { Banner, Card, Empty, Field, Modal, NumInput, Seg, Stat } from '../components/ui';
import { fmtPct, fmtPrice, fmtQty, fmtR, fmtSigned, fmtTime, fmtU, num, roundQty } from '../lib/format';
import { usePrice } from '../lib/hooks';
import { levelInfo } from '../lib/levels';
import { LOSS_R, lockUntilFor } from '../lib/locks';
import { loadBtcTrend, normalizeSymbol } from '../lib/market';
import { keyPrices, liqPrice, sideSign, type KeyPrices } from '../lib/position';
import { calcPyramid } from '../lib/pyramid';
import { uid, update, useAppState } from '../lib/store';
import { closedTradesByTime, markToMarket, tradeStats, type TradeStats } from '../lib/trade';
import { TREND_LABEL } from '../lib/trend';
import { isMajor } from '../lib/defaults';
import type { Direction, ExitReason, GuardEvent, Trade, TrendInfo } from '../lib/types';
import { DIR_LABEL } from './GateView';

const REASON_LABEL: Record<ExitReason, string> = {
  stop: '止损',
  breakeven: '保本',
  target: '止盈（目标位）',
  trail: '移动止损',
  manual: '手动平仓',
};

const EMOTIONS = ['平静', '紧张', '害怕', '贪婪', '上头', '后悔', '无聊'];

const VIOLATIONS = [
  '没走闸门就开单',
  '没挂止损 / 撤了止损',
  '放宽止损（扛单）',
  '超杠杆或超仓位',
  '手机开仓',
  '冷却期内开单',
  '追加入金',
  '其他',
];

function patchTrade(id: string, fn: (t: Trade) => Trade) {
  update((s) => ({ ...s, trades: s.trades.map((t) => (t.id === id ? fn(t) : t)) }));
}

function violationEvent(detail: string): GuardEvent {
  const now = Date.now();
  return { id: uid(), kind: 'violation', at: new Date(now).toISOString(), detail, lockUntil: lockUntilFor('violation', now) };
}

export function TradesView() {
  const state = useAppState();
  const fee = state.settings.takerFee;
  const open = state.trades.filter((t) => t.status === 'open');
  const closed = useMemo(() => closedTradesByTime(state.trades).reverse(), [state.trades]);
  const [modal, setModal] = useState<'manual' | 'violation' | null>(null);

  return (
    <div className="stack">
      <div className="toolbar">
        <button className="btn" onClick={() => setModal('manual')}>
          补记一笔（没走闸门）
        </button>
        <button className="btn danger" onClick={() => setModal('violation')}>
          我违规了
        </button>
      </div>

      <Card title={`持仓 ${open.length}`}>
        {open.length ? open.map((t) => <OpenTrade key={t.id} trade={t} />) : <Empty>空仓。空仓也是一种仓位。</Empty>}
      </Card>

      <StatsCard closed={closed} fee={fee} events={state.events} />

      <Card title="已平仓">
        {closed.length ? (
          closed.map((t) => <ClosedRow key={t.id} trade={t} fee={fee} />)
        ) : (
          <Empty>还没有平仓记录。</Empty>
        )}
      </Card>

      <Modal open={modal === 'manual'} title="补记一笔没走闸门的交易" onClose={() => setModal(null)}>
        <ManualTradeForm onDone={() => setModal(null)} />
      </Modal>
      <Modal open={modal === 'violation'} title="记录一次违规" onClose={() => setModal(null)}>
        <ViolationForm onDone={() => setModal(null)} />
      </Modal>
    </div>
  );
}

type Panel = 'stop' | 'partial' | 'add' | 'close' | null;

function OpenTrade({ trade }: { trade: Trade }) {
  const state = useAppState();
  const st = state.settings;
  const fee = st.takerFee;
  const price = usePrice(trade.symbol, st.dataSource);
  const stats = tradeStats(trade, fee);
  const kp = keyPrices(trade.direction, trade.plan.entry, trade.plan.stop, fee);
  const s = sideSign(trade.direction);
  const pnl = price !== null ? markToMarket(trade, stats, price, fee) : null;
  const partialDone = trade.fills.some((f) => f.kind === 'close');
  const atBreakeven = s * (trade.currentStop - stats.avgEntry) >= 0;
  const reached = (p: number) => price !== null && s * (price - p) >= 0;
  const [panel, setPanel] = useState<Panel>(null);
  const toggle = (p: Panel) => setPanel(panel === p ? null : p);

  let hint: string;
  if (price !== null && s * (price - trade.currentStop) <= 0) {
    hint = `价格已经穿过止损 ${fmtPrice(trade.currentStop)}：止损单应该已经成交，去币安确认后记录平仓。`;
  } else if (reached(kp.r3) && !partialDone) {
    hint = `已到 3R：减仓 50%，剩余止损移到 +1R（${fmtPrice(kp.r1)}）。`;
  } else if (reached(kp.r2) && !atBreakeven) {
    hint = `已到 2R：止损推到保本 ${fmtPrice(kp.breakeven)}。`;
  } else if (partialDone) {
    hint = `剩余仓位：每出现一个新的 4H ${trade.direction === 'long' ? '更高低点' : '更低高点'}，把止损移到它外侧。`;
  } else {
    hint = `按计划持有。止损 ${fmtPrice(trade.currentStop)}，只许往有利方向移。`;
  }

  const rungs: { label: string; value: number; cls?: string; hit?: boolean }[] = [
    { label: '当前止损', value: trade.currentStop, cls: 'stop' },
    { label: '均价', value: stats.avgEntry },
    { label: '2R 推保本', value: kp.r2, hit: reached(kp.r2) },
    { label: '3R 减半', value: kp.r3, hit: reached(kp.r3) },
    { label: '目标', value: trade.plan.target, hit: reached(trade.plan.target) },
  ];

  return (
    <div className="trade">
      <div className="trade-head">
        <span className="trade-title">{trade.symbol}</span>
        <span className={`tag ${trade.direction}`}>
          {DIR_LABEL[trade.direction]} {trade.plan.leverage}x
        </span>
        {!trade.viaGate && <span className="tag warn">未走闸门</span>}
        <div className="trade-pnl">
          <div className={pnl === null ? 'muted' : pnl >= 0 ? 'green' : 'red'}>{pnl === null ? '—' : `${fmtSigned(pnl)}U`}</div>
          <div className="small muted">
            {pnl === null ? '读取价格…' : `${fmtR(pnl / trade.plan.riskU)} · 现价 ${fmtPrice(price)}`}
          </div>
        </div>
      </div>

      <div className="ladder">
        {rungs.map((r) => (
          <div key={r.label} className={`rung ${r.cls ?? ''} ${r.hit ? 'hit' : ''}`}>
            <div className="stat-label">{r.label}</div>
            <div className="stat-value">{fmtPrice(r.value)}</div>
          </div>
        ))}
      </div>

      <div className="hint">{hint}</div>

      <div className="small muted">
        开仓 {fmtTime(trade.createdAt)} · 持仓 {fmtQty(stats.openQty)} · 单笔风险 {fmtU(trade.plan.riskU)}U · 已实现{' '}
        {fmtSigned(stats.net)}U
      </div>

      <div className="btn-row">
        {reached(kp.r2) && !atBreakeven && (
          <button className="btn sm primary" onClick={() => patchTrade(trade.id, (t) => ({ ...t, currentStop: kp.breakeven }))}>
            止损推到保本
          </button>
        )}
        <button className="btn sm" onClick={() => toggle('stop')}>
          移动止损
        </button>
        <button className="btn sm" onClick={() => toggle('partial')}>
          减仓
        </button>
        <button className="btn sm" onClick={() => toggle('add')}>
          加仓
        </button>
        <button className="btn sm" onClick={() => toggle('close')}>
          平仓
        </button>
      </div>

      {panel === 'stop' && (
        <MoveStop
          trade={trade}
          price={price}
          onSave={(v) => {
            patchTrade(trade.id, (t) => ({ ...t, currentStop: v }));
            setPanel(null);
          }}
        />
      )}
      {panel === 'partial' && (
        <Partial
          trade={trade}
          stats={stats}
          price={price}
          kp={kp}
          onSave={(p, q, newStop) => {
            patchTrade(trade.id, (t) => ({
              ...t,
              currentStop: newStop ?? t.currentStop,
              fills: [...t.fills, { kind: 'close', qty: q, price: p, at: new Date().toISOString() }],
            }));
            setPanel(null);
          }}
        />
      )}
      {panel === 'add' && (
        <AddPanel
          trade={trade}
          stats={stats}
          price={price}
          onSave={(p, q, newStop) => {
            patchTrade(trade.id, (t) => ({
              ...t,
              currentStop: newStop,
              fills: [...t.fills, { kind: 'open', qty: q, price: p, at: new Date().toISOString() }],
            }));
            setPanel(null);
          }}
        />
      )}
      {panel === 'close' && (
        <ClosePanel
          trade={trade}
          stats={stats}
          price={price}
          onSave={(p, reason, emotion, note) => {
            const at = new Date().toISOString();
            patchTrade(trade.id, (t) => ({
              ...t,
              status: 'closed',
              closedAt: at,
              exitReason: reason,
              emotion,
              note: note || undefined,
              fills: [...t.fills, { kind: 'close', qty: stats.openQty, price: p, at }],
            }));
          }}
        />
      )}
    </div>
  );
}

function MoveStop({ trade, price, onSave }: { trade: Trade; price: number | null; onSave: (v: number) => void }) {
  const s = sideSign(trade.direction);
  const [v, setV] = useState('');
  const val = num(v);
  let error: string | null = null;
  if (v && !(val > 0)) error = '填一个价格';
  else if (val > 0 && s * (val - trade.currentStop) < 0) error = '止损只能朝有利方向移动，不能放宽。想放宽就是在扛单。';
  else if (val > 0 && price !== null && s * (price - val) <= 0) {
    error = trade.direction === 'long' ? '止损必须低于现价' : '止损必须高于现价';
  }
  return (
    <div className="subpanel">
      <Field label={`新止损（当前 ${fmtPrice(trade.currentStop)}）`}>
        <NumInput value={v} onChange={setV} />
      </Field>
      {error && <p className="red small">{error}</p>}
      <div className="btn-row">
        <button className="btn primary sm" disabled={!(val > 0) || Boolean(error)} onClick={() => onSave(val)}>
          保存，并去币安同步改止损单
        </button>
      </div>
    </div>
  );
}

function Partial({
  trade,
  stats,
  price,
  kp,
  onSave,
}: {
  trade: Trade;
  stats: TradeStats;
  price: number | null;
  kp: KeyPrices;
  onSave: (price: number, qty: number, newStop: number | null) => void;
}) {
  const s = sideSign(trade.direction);
  const [p, setP] = useState(price ? String(price) : '');
  const [q, setQ] = useState(String(roundQty(stats.openQty / 2)));
  const [moveTo1R, setMoveTo1R] = useState(true);
  const pv = num(p);
  const qv = num(q);
  const canMove = s * (kp.r1 - trade.currentStop) > 0;
  const error = !(pv > 0)
    ? '填成交价'
    : !(qv > 0)
      ? '填数量'
      : qv >= stats.openQty
        ? '全部平掉请用「平仓」'
        : null;
  return (
    <div className="subpanel">
      <div className="grid2">
        <Field label="成交价">
          <NumInput value={p} onChange={setP} />
        </Field>
        <Field label={`数量（持仓 ${fmtQty(stats.openQty)}）`}>
          <NumInput value={q} onChange={setQ} />
        </Field>
      </div>
      {canMove && (
        <label className="check-item">
          <input type="checkbox" checked={moveTo1R} onChange={(e) => setMoveTo1R(e.target.checked)} />
          <span>同时把剩余止损移到 +1R（{fmtPrice(kp.r1)}）</span>
        </label>
      )}
      {error && <p className="red small">{error}</p>}
      <div className="btn-row">
        <button className="btn primary sm" disabled={Boolean(error)} onClick={() => onSave(pv, qv, canMove && moveTo1R ? kp.r1 : null)}>
          记录减仓
        </button>
      </div>
    </div>
  );
}

function AddPanel({
  trade,
  stats,
  price,
  onSave,
}: {
  trade: Trade;
  stats: TradeStats;
  price: number | null;
  onSave: (price: number, qty: number, newStop: number) => void;
}) {
  const state = useAppState();
  const st = state.settings;
  const [btc, setBtc] = useState<TrendInfo | null | undefined>(undefined);
  const [p, setP] = useState(price ? String(price) : '');
  const [ns, setNs] = useState('');

  useEffect(() => {
    loadBtcTrend(st.dataSource)
      .then(setBtc)
      .catch(() => setBtc(null));
  }, [st.dataSource]);

  const want = trade.direction === 'long' ? 'up' : 'down';
  const envOk = Boolean(btc && btc.state === want);
  const addPrice = num(p);
  const newStop = num(ns);
  const r = calcPyramid({
    direction: trade.direction,
    openQty: stats.openQty,
    avgEntry: stats.avgEntry,
    baseQty: stats.baseQty,
    realizedNet: stats.net,
    currentStop: trade.currentStop,
    addPrice,
    newStop,
    takerFee: st.takerFee,
    slippage: st.slippage,
  });
  const qty = roundQty(r.qty);
  const mmr = isMajor(trade.symbol) ? st.mmrMajor : st.mmrAlt;
  const newLiq = qty > 0 ? liqPrice(trade.direction, r.newAvg, trade.plan.leverage, mmr) : null;
  const liqUnsafe = newLiq !== null && sideSign(trade.direction) * (newStop - newLiq) <= 0;

  return (
    <div className="subpanel">
      <div className="small">
        {btc === undefined ? (
          <span className="muted">读取 BTC 日线…</span>
        ) : btc === null ? (
          <span className="red">拿不到 BTC 日线，不能加仓</span>
        ) : envOk ? (
          <span className="green">BTC 日线{TREND_LABEL[btc.state]}，和持仓方向一致</span>
        ) : (
          <span className="red">BTC 日线{TREND_LABEL[btc.state]}：加仓要求 BTC 和持仓方向一致</span>
        )}
      </div>
      <div className="grid2">
        <Field label="加仓价（再次突破确认后）">
          <NumInput value={p} onChange={setP} />
        </Field>
        <Field label={`新的整体止损（当前 ${fmtPrice(trade.currentStop)}）`}>
          <NumInput value={ns} onChange={setNs} />
        </Field>
      </div>
      {r.perUnitLoss > 0 && (
        <div className="stats three">
          <Stat label="已锁定利润" value={`${fmtU(r.lockedProfit)}U`} sub="打到新止损时，原仓位加已实现的净利" />
          <Stat label="最多可加" value={fmtQty(qty)} sub={`风险上限 ${fmtQty(r.maxByRisk)} · 底仓 ${fmtQty(r.maxByBase)}`} />
          <Stat label="加仓后均价" value={fmtPrice(r.newAvg)} />
          <Stat
            label="打到新止损"
            value={`${fmtSigned(r.pnlAtStop)}U`}
            tone={r.pnlAtStop >= -0.005 ? 'green' : 'red'}
            sub="整笔交易，含手续费"
          />
          <Stat label="新增保证金" value={`${fmtU((qty * addPrice) / trade.plan.leverage)}U`} sub={`按 ${trade.plan.leverage} 倍`} />
          <Stat label="加仓后强平（估）" value={fmtPrice(newLiq)} tone={liqUnsafe ? 'red' : undefined} sub={liqUnsafe ? '在新止损里面，不能这么加' : undefined} />
        </div>
      )}
      {r.error && <p className="red small">{r.error}</p>}
      <div className="btn-row">
        <button
          className="btn primary sm"
          disabled={Boolean(r.error) || !envOk || !(qty > 0) || liqUnsafe}
          onClick={() => onSave(addPrice, qty, newStop)}
        >
          已按此加仓，并同步改币安止损
        </button>
      </div>
    </div>
  );
}

function ClosePanel({
  trade,
  stats,
  price,
  onSave,
}: {
  trade: Trade;
  stats: TradeStats;
  price: number | null;
  onSave: (price: number, reason: ExitReason, emotion: string, note: string) => void;
}) {
  const fee = useAppState().settings.takerFee;
  const [p, setP] = useState(price ? String(price) : '');
  const [reason, setReason] = useState<ExitReason>('stop');
  const [emotion, setEmotion] = useState(EMOTIONS[0]);
  const [note, setNote] = useState('');
  const pv = num(p);
  const net = pv > 0 ? markToMarket(trade, stats, pv, fee) : null;
  return (
    <div className="subpanel">
      <div className="grid2">
        <Field label="平仓成交价">
          <NumInput value={p} onChange={setP} />
        </Field>
        <Field label="离场原因">
          <select value={reason} onChange={(e) => setReason(e.target.value as ExitReason)}>
            {(Object.keys(REASON_LABEL) as ExitReason[]).map((k) => (
              <option key={k} value={k}>
                {REASON_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="当时的情绪">
        <select value={emotion} onChange={(e) => setEmotion(e.target.value)}>
          {EMOTIONS.map((e) => (
            <option key={e}>{e}</option>
          ))}
        </select>
      </Field>
      <Field label="交易验尸（理由、截图文件名、复盘）">
        <textarea value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {net !== null && (
        <p className="small">
          这笔净盈亏 <b className={net >= 0 ? 'green' : 'red'}>{fmtSigned(net)}U（{fmtR(net / trade.plan.riskU)}）</b>
        </p>
      )}
      <p className="small faint">平仓后 4 小时内不能开新单。平仓后去「资金」页做空仓结算。</p>
      <div className="btn-row">
        <button className="btn primary sm" disabled={!(pv > 0)} onClick={() => onSave(pv, reason, emotion, note)}>
          记录平仓
        </button>
      </div>
    </div>
  );
}

function ClosedRow({ trade, fee }: { trade: Trade; fee: number }) {
  const s = tradeStats(trade, fee);
  return (
    <div className="list-row">
      <div className="grow">
        <b>{trade.symbol}</b> <span className={`tag ${trade.direction}`}>{DIR_LABEL[trade.direction]}</span>{' '}
        {!trade.viaGate && <span className="tag warn">未走闸门</span>}
        <div className="small muted">
          {fmtTime(trade.closedAt!)} · {REASON_LABEL[trade.exitReason ?? 'manual']}
          {trade.emotion ? ` · ${trade.emotion}` : ''}
        </div>
        {trade.note && <div className="small faint">{trade.note}</div>}
      </div>
      <div style={{ textAlign: 'right' }}>
        <div className={s.net >= 0 ? 'green' : 'red'}>
          <b>{fmtR(s.r)}</b>
        </div>
        <div className="small muted">{fmtSigned(s.net)}U</div>
      </div>
    </div>
  );
}

function StatsCard({ closed, fee, events }: { closed: Trade[]; fee: number; events: GuardEvent[] }) {
  if (!closed.length) return null;
  const stats = closed.map((t) => tradeStats(t, fee));
  const wins = stats.filter((s) => s.r > 0).length;
  const avgR = stats.reduce((sum, s) => sum + s.r, 0) / stats.length;
  const totalNet = stats.reduce((sum, s) => sum + s.net, 0);
  let streak = 0;
  let maxStreak = 0;
  for (const s of [...stats].reverse()) {
    streak = s.r <= LOSS_R ? streak + 1 : 0;
    maxStreak = Math.max(maxStreak, streak);
  }
  const viaGate = closed.filter((t) => t.viaGate).length;
  return (
    <Card title="战绩">
      <div className="stats three">
        <Stat label="笔数" value={closed.length} sub={`走闸门 ${viaGate} 笔`} />
        <Stat label="胜率" value={fmtPct(wins / closed.length, 0)} />
        <Stat label="平均每笔" value={fmtR(avgR)} tone={avgR >= 0 ? 'green' : 'red'} sub="这就是你的期望值" />
        <Stat label="累计净盈亏" value={`${fmtSigned(totalNet)}U`} tone={totalNet >= 0 ? 'green' : 'red'} />
        <Stat label="最长连亏" value={`${maxStreak} 笔`} />
        <Stat label="违规" value={`${events.filter((e) => e.kind === 'violation').length} 次`} />
      </div>
    </Card>
  );
}

function ManualTradeForm({ onDone }: { onDone: () => void }) {
  const state = useAppState();
  const level = levelInfo(state.level, state.settings.baseCapital);
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [direction, setDirection] = useState<Direction>('long');
  const [entry, setEntry] = useState('');
  const [qty, setQty] = useState('');
  const [lev, setLev] = useState('');
  const [stop, setStop] = useState('');
  const e = num(entry);
  const q = num(qty);
  const L = num(lev);
  const sp = num(stop);
  const s = sideSign(direction);
  const stopOk = sp > 0 && s * (e - sp) > 0;
  const valid = e > 0 && q > 0 && L >= 1 && stopOk;

  function save() {
    const at = new Date().toISOString();
    const dist = Math.abs(e - sp);
    const trade: Trade = {
      id: uid(),
      symbol: normalizeSymbol(symbol),
      direction,
      createdAt: at,
      viaGate: false,
      level: state.level,
      plan: {
        entry: e,
        stop: sp,
        target: e + s * 3 * dist,
        leverage: L,
        qty: q,
        notional: q * e,
        margin: (q * e) / L,
        riskU: level.risk,
        liq: liqPrice(direction, e, L, isMajor(normalizeSymbol(symbol)) ? state.settings.mmrMajor : state.settings.mmrAlt),
        rr: 0,
      },
      fills: [{ kind: 'open', qty: q, price: e, at }],
      currentStop: sp,
      status: 'open',
    };
    update((st) => ({ ...st, trades: [...st.trades, trade], events: [...st.events, violationEvent('没走闸门开单')] }));
    onDone();
  }

  return (
    <div className="stack">
      <Banner tone="amber" title="补记会同时记一次违规，守门员锁 7 天">
        <p className="small">按手册：违规开单，无论盈亏，在币安开「1 周」冷静期。</p>
        <CoolOffGuide duration="1 周" />
      </Banner>
      <div>
        <div className="grid2">
          <Field label="币种">
            <input value={symbol} onChange={(ev) => setSymbol(ev.target.value)} autoCapitalize="characters" />
          </Field>
          <Field label="方向">
            <Seg
              value={direction}
              options={[
                { value: 'long', label: '做多' },
                { value: 'short', label: '做空' },
              ]}
              tone={(v) => (v === 'long' ? 'on-long' : 'on-short')}
              onChange={setDirection}
            />
          </Field>
          <Field label="开仓均价">
            <NumInput value={entry} onChange={setEntry} />
          </Field>
          <Field label="数量（币）">
            <NumInput value={qty} onChange={setQty} />
          </Field>
          <Field label="杠杆">
            <NumInput value={lev} onChange={setLev} />
          </Field>
          <Field label="止损价" hint="没挂止损就填币安显示的强平价">
            <NumInput value={stop} onChange={setStop} />
          </Field>
        </div>
        {e > 0 && sp > 0 && !stopOk && <p className="red small">止损价方向不对</p>}
        {valid && (
          <p className="small muted" style={{ marginTop: 8 }}>
            按这个止损，打到止损亏 {fmtU(q * Math.abs(e - sp))}U，是本级单笔风险的 {(q * Math.abs(e - sp) / level.risk).toFixed(1)} 倍。
          </p>
        )}
      </div>
      <button className="btn primary block" disabled={!valid} onClick={save}>
        补记，并记一次违规
      </button>
    </div>
  );
}

function ViolationForm({ onDone }: { onDone: () => void }) {
  const [type, setType] = useState(VIOLATIONS[0]);
  const [note, setNote] = useState('');
  return (
    <div className="stack">
      <p className="small muted">诚实记录比假装没发生有用。记录后守门员锁 7 天。</p>
      <Field label="违规类型">
        <select value={type} onChange={(e) => setType(e.target.value)}>
          {VIOLATIONS.map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </Field>
      <Field label="补充（可选）">
        <textarea value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Banner tone="amber" title="现在就去币安开「1 周」冷静期">
        <CoolOffGuide duration="1 周" />
      </Banner>
      <button
        className="btn danger block"
        onClick={() => {
          update((s) => ({ ...s, events: [...s.events, violationEvent(note ? `${type}：${note}` : type)] }));
          onDone();
        }}
      >
        记录违规，锁 7 天
      </button>
    </div>
  );
}
