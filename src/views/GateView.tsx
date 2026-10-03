import { useEffect, useMemo, useRef, useState } from 'react';
import { CoolOffGuide, MOTTOS } from '../components/CoolOff';
import { Banner, Card, CopyBtn, Field, NumInput, Seg, Stat, StatusIcon } from '../components/ui';
import { isPhone } from '../lib/device';
import { fmtBig, fmtClock, fmtCny, fmtDuration, fmtPct, fmtPrice, fmtQty, fmtU, num, roundQty } from '../lib/format';
import { CHECKLIST, evaluateGate, planKey, type GateResult } from '../lib/gate';
import { useDraft, useMarket, useNow } from '../lib/hooks';
import { levelInfo } from '../lib/levels';
import { loadLiquidSymbols, normalizeSymbol, type SymbolVolume } from '../lib/market';
import { uid, update, useAppState } from '../lib/store';
import { truthSummary } from '../lib/truth';
import type { Direction, Trade } from '../lib/types';

type GoTo = (tab: 'trades' | 'funds' | 'truth') => void;

interface Draft {
  symbol: string;
  direction: Direction;
  entry: string;
  stop: string;
  target: string;
  checklist: boolean[];
}

const blankChecklist = () => CHECKLIST.map(() => false);

const EMPTY_DRAFT: Draft = {
  symbol: 'BTCUSDT',
  direction: 'long',
  entry: '',
  stop: '',
  target: '',
  checklist: blankChecklist(),
};

export const DIR_LABEL: Record<Direction, string> = { long: '做多', short: '做空' };

function seedIndex(seed: string, n: number): number {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % n;
}

export function GateView({ goTo }: { goTo: GoTo }) {
  const state = useAppState();
  const st = state.settings;
  const now = useNow(1000);
  const [draft, setDraft] = useDraft<Draft>('1024-guard:draft', EMPTY_DRAFT);
  const symbol = normalizeSymbol(draft.symbol);
  const { market, refresh } = useMarket(symbol, st.dataSource);
  const [symbols, setSymbols] = useState<SymbolVolume[]>([]);
  const phone = useMemo(() => isPhone(), []);

  useEffect(() => {
    loadLiquidSymbols(st.dataSource, st.minQuoteVolume)
      .then(setSymbols)
      .catch(() => setSymbols([]));
  }, [st.dataSource, st.minQuoteVolume]);

  const entry = num(draft.entry);
  const stop = num(draft.stop);
  const target = num(draft.target);
  const result = evaluateGate({
    symbol,
    direction: draft.direction,
    entry,
    stop,
    target,
    checklist: draft.checklist,
    market,
    state,
    now,
    phone,
  });

  const key = planKey(symbol, draft.direction, stop, target);
  const coolMs = st.coolMinutes * 60_000;
  const pending = state.pending?.key === key ? state.pending : null;
  const remaining = pending ? Math.min(coolMs, Date.parse(pending.startedAt) + coolMs - now) : null;
  const cooling = remaining !== null && remaining > 0;
  const cooled = remaining !== null && remaining <= 0;

  const refreshedFor = useRef<string | null>(null);
  useEffect(() => {
    if (cooled && pending && refreshedFor.current !== pending.startedAt) {
      refreshedFor.current = pending.startedAt;
      refresh();
    }
  }, [cooled, pending, refresh]);

  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });

  function startCooling() {
    update((s) => ({ ...s, pending: { key, startedAt: new Date().toISOString() } }));
  }

  function abandon() {
    update((s) => ({
      ...s,
      pending: null,
      events: [
        ...s.events,
        { id: uid(), kind: 'skip', at: new Date().toISOString(), detail: `${symbol} ${DIR_LABEL[draft.direction]}` },
      ],
    }));
    setDraft({ ...EMPTY_DRAFT, symbol: draft.symbol, checklist: blankChecklist() });
  }

  function confirmOrder() {
    const p = result.position;
    if (!result.pass || !p.leverage || !p.margin || !p.liq) return;
    const at = new Date().toISOString();
    const qty = roundQty(p.qty);
    const trade: Trade = {
      id: uid(),
      symbol,
      direction: draft.direction,
      createdAt: at,
      viaGate: true,
      level: state.level,
      plan: {
        entry,
        stop,
        target,
        leverage: p.leverage,
        qty,
        notional: qty * entry,
        margin: (qty * entry) / p.leverage,
        riskU: result.level.risk,
        liq: p.liq,
        rr: p.rr,
      },
      fills: [{ kind: 'open', qty, price: entry, at }],
      currentStop: stop,
      status: 'open',
    };
    update((s) => ({ ...s, pending: null, trades: [...s.trades, trade] }));
    setDraft({ ...EMPTY_DRAFT, symbol: draft.symbol, checklist: blankChecklist() });
    goTo('trades');
  }

  const stalePending = Boolean(state.pending && !pending);
  const exitLine = levelInfo(0, st.baseCapital).downgradeAt;

  return (
    <div className="stack">
      <StatusBanner result={result} now={now} exitLine={exitLine} goTo={goTo} />
      <div className="cols">
        <div className="col">
          <Card title="开单计划" extra={`Lv${state.level} · 单笔风险 ${fmtU(result.level.risk)}U`}>
            <Field
              label="币种（USDT 永续）"
              hint={symbols.length ? `下拉列表是 24h 成交额 ≥ ${fmtBig(st.minQuoteVolume)} 的币种` : undefined}
            >
              <input
                list="liquid-symbols"
                value={draft.symbol}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => set({ symbol: e.target.value, checklist: blankChecklist() })}
                onBlur={() => symbol && symbol !== draft.symbol && set({ symbol })}
              />
              <datalist id="liquid-symbols">
                {symbols.slice(0, 150).map((s) => (
                  <option key={s.symbol} value={s.symbol}>{`${fmtBig(s.quoteVolume)} USDT`}</option>
                ))}
              </datalist>
            </Field>
            <Field label="方向">
              <Seg
                value={draft.direction}
                options={[
                  { value: 'long', label: '做多' },
                  { value: 'short', label: '做空' },
                ]}
                tone={(v) => (v === 'long' ? 'on-long' : 'on-short')}
                onChange={(direction) => set({ direction, checklist: blankChecklist() })}
              />
            </Field>
            <Field label="入场价（市价进场）">
              <div className="input-row">
                <NumInput value={draft.entry} onChange={(v) => set({ entry: v })} placeholder="现价" />
                <button
                  type="button"
                  className="btn"
                  disabled={!market.lastPrice}
                  onClick={() => market.lastPrice && set({ entry: String(market.lastPrice) })}
                >
                  用现价{market.lastPrice ? ` ${fmtPrice(market.lastPrice)}` : ''}
                </button>
              </div>
            </Field>
            <div className="grid2">
              <Field label="止损价（4H 结构外侧）">
                <NumInput value={draft.stop} onChange={(v) => set({ stop: v })} />
              </Field>
              <Field label={draft.direction === 'long' ? '目标价（最近强阻力）' : '目标价（最近强支撑）'}>
                <NumInput value={draft.target} onChange={(v) => set({ target: v })} />
              </Field>
            </div>
          </Card>

          <Card title="自查清单" extra="诚实地勾">
            {CHECKLIST.map((text, i) => (
              <label key={text} className="check-item">
                <input
                  type="checkbox"
                  checked={draft.checklist[i] ?? false}
                  onChange={(e) => {
                    const checklist = [...draft.checklist];
                    checklist[i] = e.target.checked;
                    set({ checklist });
                  }}
                />
                <span>{text}</span>
              </label>
            ))}
          </Card>
        </div>

        <div className="col">
          <PositionCard result={result} symbol={symbol} minRR={st.minRR} />
          <Card
            title="闸门检查"
            extra={
              <button className="btn sm ghost" onClick={refresh} disabled={market.loading}>
                {market.loading ? '读取中…' : '刷新行情'}
              </button>
            }
          >
            <div className="checks">
              {result.checks.map((c) => (
                <div key={c.id} className={`check-row ${c.status}`}>
                  <StatusIcon status={c.status} />
                  <div>
                    <div className="check-label">{c.label}</div>
                    <div className="check-detail">{c.detail}</div>
                  </div>
                </div>
              ))}
            </div>
            {market.source && (
              <p className="faint small" style={{ marginTop: 10 }}>
                数据源：币安{market.source === 'futures' ? '合约' : '现货（合约接口连不上时的备用，成交额会偏低）'}
              </p>
            )}

            {cooling && pending ? (
              <Countdown
                remaining={remaining!}
                total={coolMs}
                motto={MOTTOS[seedIndex(pending.startedAt, MOTTOS.length)]}
                netLoss={truthSummary(state).netLossCny}
                onAbandon={abandon}
              />
            ) : !result.pass ? (
              <FailVerdict result={result} afterCooling={cooled} stalePending={stalePending} />
            ) : !pending ? (
              <div className="verdict ok">
                <div className="verdict-title">全部通过</div>
                <p>还差最后一步：冷静 {st.coolMinutes} 分钟。这段时间离开 K 线图，结束后会再检查一遍。</p>
                <button className="btn primary big block" onClick={startCooling}>
                  开始 {st.coolMinutes} 分钟冷静
                </button>
              </div>
            ) : (
              <Ticket
                result={result}
                symbol={symbol}
                direction={draft.direction}
                entry={entry}
                stop={stop}
                target={target}
                onConfirm={confirmOrder}
                onAbandon={abandon}
              />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatusBanner({ result, now, exitLine, goTo }: { result: GateResult; now: number; exitLine: number; goTo: GoTo }) {
  if (result.locks.some((l) => l.until === null)) {
    return (
      <Banner tone="red" title="终极熔断">
        <p>累计净亏损已经达到你自己定的上限。按手册：永久退出，币安冷静期选「无期限」。</p>
        <CoolOffGuide duration="无期限" />
      </Banner>
    );
  }
  if (result.total > 0 && result.action.kind === 'exit') {
    return (
      <Banner tone="red" title={`总资金 ${fmtU(result.total)}U，已到 Lv0 出局线 ${fmtU(exitLine)}U`}>
        <p>按手册：全部提现，退出市场，币安冷静期开「1 个月」或更长。这里只能演练，不能下单。</p>
        <CoolOffGuide duration="1 个月" />
        <div className="btn-row" style={{ marginTop: 10 }}>
          <button className="btn sm" onClick={() => goTo('funds')}>
            去资金页执行出局
          </button>
        </div>
      </Banner>
    );
  }
  const timed = result.locks.filter((l) => l.until !== null);
  if (timed.length) {
    return (
      <Banner tone="amber" title={`锁定中，还剩 ${fmtDuration(timed[0].until! - now)}`}>
        {timed.map((l) => (
          <p key={l.kind + l.until} className="small">
            · {l.reason}（还剩 {fmtDuration(l.until! - now)}）
          </p>
        ))}
      </Banner>
    );
  }
  if (result.total <= 0) {
    return (
      <Banner tone="blue" title="先填资金">
        <p className="small">去「资金」页填 A / B / C 余额和当前等级，闸门才能算仓位。</p>
        <div className="btn-row" style={{ marginTop: 8 }}>
          <button className="btn sm" onClick={() => goTo('funds')}>
            去资金页
          </button>
        </div>
      </Banner>
    );
  }
  if (result.action.kind !== 'hold') {
    const title =
      result.action.kind === 'upgrade'
        ? `已达升级门槛：暂停交易，先升级到 Lv${result.action.to}`
        : result.action.kind === 'downgrade'
          ? `已到降级线：先降级到 Lv${result.action.to}`
          : '通关：全部提现';
    return (
      <Banner tone="amber" title={title}>
        <div className="btn-row" style={{ marginTop: 8 }}>
          <button className="btn sm" onClick={() => goTo('funds')}>
            去资金页处理
          </button>
        </div>
      </Banner>
    );
  }
  return null;
}

function PositionCard({ result, symbol, minRR }: { result: GateResult; symbol: string; minRR: number }) {
  const p = result.position;
  const coin = symbol.replace(/USDT$/, '') || '币';
  return (
    <Card title="仓位计算" extra={p.leverage ? `${p.leverage} 倍逐仓` : undefined}>
      {p.priceError ? (
        <p className="muted small">{p.priceError}，填好后自动计算。</p>
      ) : (
        <>
          <div className="stats three">
            <Stat label="止损幅度" value={fmtPct(p.stopPct)} sub={`成本 ${fmtPct(p.costPct)}`} />
            <Stat label="净盈亏比" value={`1:${p.rr.toFixed(2)}`} tone={p.rr >= minRR ? 'green' : 'red'} sub={`要求 ≥ 1:${minRR}`} />
            <Stat label="开仓价值" value={`${fmtU(p.notional)}U`} sub={`${fmtQty(p.qty)} ${coin}`} />
            <Stat
              label="杠杆（逐仓）"
              value={p.leverage ? `${p.leverage} 倍` : '—'}
              tone={p.leverage ? undefined : 'red'}
              sub={`红线 ${p.levCap} 倍`}
            />
            <Stat label="保证金" value={p.margin ? `${fmtU(p.margin)}U` : '—'} sub="止损没成交时最多亏这么多" />
            <Stat
              label="强平价（估）"
              value={fmtPrice(p.liq)}
              sub={p.liqPct ? `距离 ${fmtPct(p.liqPct)}，是止损的 ${(p.liqPct / p.stopPct).toFixed(1)} 倍` : undefined}
            />
            <Stat label="打到止损亏" value={`${fmtU(result.level.risk)}U`} sub="已含手续费和滑点" />
            <Stat label="2R 推保本" value={fmtPrice(p.prices.r2)} sub={`止损移到 ${fmtPrice(p.prices.breakeven)}`} />
            <Stat label="3R 减仓一半" value={fmtPrice(p.prices.r3)} sub={`剩余止损移到 ${fmtPrice(p.prices.r1)}`} />
          </div>
          {p.error && (
            <p className="red small" style={{ marginTop: 10 }}>
              {p.error}
            </p>
          )}
        </>
      )}
    </Card>
  );
}

function FailVerdict({ result, afterCooling, stalePending }: { result: GateResult; afterCooling: boolean; stalePending: boolean }) {
  const fails = result.checks.filter((c) => c.status === 'fail');
  const waiting = result.checks.some((c) => c.status === 'wait');
  const blocked = result.locks.length > 0 || (result.total > 0 && result.action.kind !== 'hold');
  if (!fails.length && waiting) {
    return (
      <div className="verdict fail">
        <div className="verdict-title muted">读取行情中…</div>
      </div>
    );
  }
  return (
    <div className="verdict fail">
      <div className="verdict-title">{afterCooling ? '冷静结束，复查没通过' : `禁止开单：${fails.length} 项没通过`}</div>
      <p className="small">{fails.map((f) => f.label).join('、')}</p>
      {blocked && <p className="small">现在处于锁定或待处理状态，这里只能演练计算，不能下单。</p>}
      {stalePending && <p className="small faint">计划改过了，之前的冷静计时作废。</p>}
    </div>
  );
}

function Countdown({
  remaining,
  total,
  motto,
  netLoss,
  onAbandon,
}: {
  remaining: number;
  total: number;
  motto: string;
  netLoss: number;
  onAbandon: () => void;
}) {
  return (
    <div className="countdown">
      <div className="muted small">冷静中。离开 K 线图，结束后自动复查。</div>
      <div className="countdown-clock">{fmtClock(remaining)}</div>
      <div className="progress">
        <div style={{ width: `${100 * (1 - remaining / total)}%` }} />
      </div>
      {netLoss > 0 && (
        <p className="small">
          到目前为止，你一共亏了 <b className="red">{fmtCny(netLoss)}</b>。
        </p>
      )}
      <p className="motto">「{motto}」</p>
      <button className="btn block" onClick={onAbandon}>
        放弃这笔（记一次忍住）
      </button>
    </div>
  );
}

function TicketRow({ k, v, copy }: { k: string; v: string; copy?: string }) {
  return (
    <div className="ticket-row">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
      {copy && <CopyBtn text={copy} />}
    </div>
  );
}

function Ticket({
  result,
  symbol,
  direction,
  entry,
  stop,
  target,
  onConfirm,
  onAbandon,
}: {
  result: GateResult;
  symbol: string;
  direction: Direction;
  entry: number;
  stop: number;
  target: number;
  onConfirm: () => void;
  onAbandon: () => void;
}) {
  const p = result.position;
  const qty = roundQty(p.qty);
  const coin = symbol.replace(/USDT$/, '');
  return (
    <div className="ticket">
      <div className="ticket-head">冷静结束，复查通过：严格按这张单子下</div>
      <TicketRow k="合约" v={`${symbol} 永续 · ${DIR_LABEL[direction]}`} />
      <TicketRow k="保证金模式" v={`逐仓 · ${p.leverage} 倍`} />
      <TicketRow k="数量" v={`${fmtQty(qty)} ${coin}`} copy={String(qty)} />
      <TicketRow k="开仓价值" v={`${fmtU(qty * entry)}U · 保证金 ${fmtU((qty * entry) / p.leverage!)}U`} />
      <TicketRow k="入场" v={`市价 ≈ ${fmtPrice(entry)}`} />
      <TicketRow k="止损单" v={`${fmtPrice(stop)}（止损市价）`} copy={String(stop)} />
      <TicketRow k="目标" v={fmtPrice(target)} copy={String(target)} />
      <TicketRow k="2R 推保本" v={`到 ${fmtPrice(p.prices.r2)} → 止损移到 ${fmtPrice(p.prices.breakeven)}`} />
      <TicketRow k="3R 减仓 50%" v={`到 ${fmtPrice(p.prices.r3)} → 剩余止损移到 ${fmtPrice(p.prices.r1)}`} />
      <TicketRow k="强平价（估）" v={`${fmtPrice(p.liq)}（距离 ${fmtPct(p.liqPct)}）`} />
      <div className="ticket-foot">
        <p className="small muted">数量已向下取整。下单后核对币安显示的强平价确实在止损外面，止损单和开仓同时挂。</p>
        <button className="btn primary big block" onClick={onConfirm}>
          我已按此下单，记入持仓
        </button>
        <button className="btn block" onClick={onAbandon}>
          放弃这笔（记一次忍住）
        </button>
      </div>
    </div>
  );
}
