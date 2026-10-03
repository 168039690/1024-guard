import { useState } from 'react';
import { CoolOffGuide } from '../components/CoolOff';
import { Banner, Card, Field, NumInput, Stat } from '../components/ui';
import { fmtCny, fmtDate, fmtSigned, fmtTime, fmtU, num } from '../lib/format';
import { balancesStale } from '../lib/gate';
import { levelAction, levelInfo, levelTable, settle, type LevelAction, type LevelInfo } from '../lib/levels';
import { lockUntilFor } from '../lib/locks';
import { uid, update, useAppState } from '../lib/store';
import { tradeStats } from '../lib/trade';
import type { AppState, Balances, EventKind } from '../lib/types';

export function FundsView() {
  const state = useAppState();
  const st = state.settings;
  const saved = state.balances;
  const total = saved.a + saved.b + saved.c;
  const info = levelInfo(state.level, st.baseCapital);
  const action = levelAction(state.level, total, st.baseCapital);
  const hasOpen = state.trades.some((t) => t.status === 'open');
  const room = total - info.downgradeAt;
  const setupDone = state.trades.length > 0 || state.events.some((e) => e.kind !== 'skip');
  const closedSince = state.trades.filter(
    (t) => t.status === 'closed' && t.closedAt && (!saved.updatedAt || t.closedAt > saved.updatedAt),
  );
  const netSince = closedSince.reduce((sum, t) => sum + tradeStats(t, st.takerFee).net, 0);

  return (
    <div className="stack">
      <div className="cols">
        <div className="col">
          <BalanceForm
            key={saved.updatedAt ?? 'none'}
            saved={saved}
            rate={st.usdtCny}
            closedCount={hasOpen ? 0 : closedSince.length}
            netSince={netSince}
          />
          <Card title="等级">
            <Field
              label="当前等级"
              hint={
                setupDone
                  ? '升降级用「下一步」里的按钮执行，这里只能往低调。'
                  : '第一次用时选你现在所在的等级，之后的升降级用「下一步」里的按钮执行。'
              }
            >
              <select value={state.level} onChange={(e) => update((s) => ({ ...s, level: Number(e.target.value) }))}>
                {levelTable(st.baseCapital).map((l) => (
                  <option key={l.level} value={l.level} disabled={setupDone && l.level > state.level}>
                    Lv{l.level} · 总资金 {fmtU(l.total)}U
                  </option>
                ))}
              </select>
            </Field>
            <div className="stats">
              <Stat label="总资金" value={`${fmtU(total)}U`} sub={`本级标准 ${fmtU(info.total)}U`} />
              <Stat label="单笔风险" value={`${fmtU(info.risk)}U`} sub={`作战金 ${fmtU(info.a)}U 的 10%`} />
              <Stat
                label="距离升级"
                value={info.upgradeAt ? `${fmtU(Math.max(0, info.upgradeAt - total))}U` : '已通关'}
                sub={info.upgradeAt ? `门槛 ${fmtU(info.upgradeAt)}U` : undefined}
              />
              <Stat
                label={state.level === 0 ? '距离出局线' : '距离降级线'}
                value={`${fmtU(Math.max(0, room))}U`}
                tone={room < info.risk * 3 ? 'red' : undefined}
                sub={`${fmtU(info.downgradeAt)}U · 约 ${Math.max(0, Math.floor(room / info.risk))} 笔满额止损`}
              />
            </div>
          </Card>
        </div>
        <div className="col">
          <ActionCard state={state} total={total} action={action} info={info} hasOpen={hasOpen} />
        </div>
      </div>

      <Card title="等级表" extra={`起点 ${fmtU(st.baseCapital)}U，可在设置里改`}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>等级</th>
                <th>总资金</th>
                <th>作战金</th>
                <th>单笔风险</th>
                <th>备用金</th>
                <th>奖池</th>
                <th>升级条件</th>
                <th>降级熔断</th>
              </tr>
            </thead>
            <tbody>
              {levelTable(st.baseCapital).map((l) => (
                <tr key={l.level} className={l.level === state.level ? 'current' : ''}>
                  <td>Lv{l.level}</td>
                  <td>{fmtU(l.total)}</td>
                  <td>{fmtU(l.a)}</td>
                  <td>-{fmtU(l.risk)}</td>
                  <td>{fmtU(l.b)}</td>
                  <td>{fmtU(l.c)}</td>
                  <td>{l.upgradeAt ? `≥ ${fmtU(l.upgradeAt)}` : '通关'}</td>
                  <td>{l.level === 0 ? `≤ ${fmtU(l.downgradeAt)} 出局` : `≤ ${fmtU(l.downgradeAt)}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function BalanceForm({
  saved,
  rate,
  closedCount,
  netSince,
}: {
  saved: Balances;
  rate: number;
  closedCount: number;
  netSince: number;
}) {
  const [a, setA] = useState(saved.a ? String(saved.a) : '');
  const [b, setB] = useState(saved.b ? String(saved.b) : '');
  const [c, setC] = useState(saved.c ? String(saved.c) : '');
  const values = [num(a) || 0, num(b) || 0, num(c) || 0];
  const sum = values[0] + values[1] + values[2];
  const dirty = values[0] !== saved.a || values[1] !== saved.b || values[2] !== saved.c;
  const invalid = values.some((v) => v < 0);
  const estimateA = Math.max(0, Math.round((saved.a + netSince) * 100) / 100);
  return (
    <Card title="余额（空仓时填，单位 U）" extra={saved.updatedAt ? `更新于 ${fmtTime(saved.updatedAt)}` : '还没填'}>
      {closedCount > 0 && (
        <div className="hint" style={{ marginBottom: 12 }}>
          上次保存后平仓 {closedCount} 笔，净 {fmtSigned(netSince)}U，A 估计 ≈ {fmtU(estimateA)}U。以币安合约账户的实际余额为准。{' '}
          <button className="btn sm" onClick={() => setA(String(estimateA))}>
            填入估算
          </button>
        </div>
      )}
      <div className="grid3">
        <Field label="A 作战金">
          <NumInput value={a} onChange={setA} placeholder="合约账户" />
        </Field>
        <Field label="B 备用金">
          <NumInput value={b} onChange={setB} placeholder="现货账户" />
        </Field>
        <Field label="C 奖池">
          <NumInput value={c} onChange={setC} placeholder="理财/钱包" />
        </Field>
      </div>
      <p className="small muted" style={{ margin: '12px 0' }}>
        合计 {fmtU(sum)}U ≈ {fmtCny(sum * rate)}
      </p>
      <button
        className="btn primary"
        disabled={!dirty || invalid}
        onClick={() =>
          update((s) => ({
            ...s,
            balances: { a: values[0], b: values[1], c: values[2], updatedAt: new Date().toISOString() },
          }))
        }
      >
        保存余额
      </button>
    </Card>
  );
}

function commit(kind: EventKind, patch: (s: AppState) => Partial<AppState>, withdrawU: number, note: string) {
  const now = Date.now();
  const at = new Date(now).toISOString();
  update((s) => {
    const ledger =
      withdrawU > 0.005
        ? [...s.ledger, { id: uid(), date: fmtDate(now), type: 'withdraw' as const, cny: withdrawU * s.settings.usdtCny, note }]
        : s.ledger;
    return {
      ...s,
      ...patch(s),
      ledger,
      events: [...s.events, { id: uid(), kind, at, detail: note, lockUntil: lockUntilFor(kind, now) }],
    };
  });
}

function ActionCard({
  state,
  total,
  action,
  info,
  hasOpen,
}: {
  state: AppState;
  total: number;
  action: LevelAction;
  info: LevelInfo;
  hasOpen: boolean;
}) {
  const st = state.settings;
  const rate = st.usdtCny;
  const stamp = () => new Date().toISOString();

  if (total <= 0) {
    return (
      <Card title="下一步">
        <p className="muted">先填余额。</p>
      </Card>
    );
  }
  if (hasOpen) {
    return (
      <Card title="下一步">
        <p className="muted">有持仓时不结算、不升降级。等级判断以空仓余额为准，平仓后再来。</p>
      </Card>
    );
  }
  if (balancesStale(state)) {
    return (
      <Card title="下一步">
        <p className="amber">上次保存余额后又平仓了：先按币安的实际余额更新 A / B / C，再结算。闸门在更新之前不放行。</p>
      </Card>
    );
  }

  switch (action.kind) {
    case 'hold': {
      const { transfers, after } = settle(state.level, state.balances, st.baseCapital);
      const short = after.a < info.a - 0.005;
      return (
        <Card title="空仓结算">
          {transfers.length ? (
            <>
              <p className="small muted">把 A 重置到标准额 {fmtU(info.a)}U：</p>
              <ul className="steps">
                {transfers.map((t) => (
                  <li key={t.from + t.to}>
                    {t.from} → {t.to}：<b>{fmtU(t.amount)}U</b>
                  </li>
                ))}
              </ul>
              <p className="small muted" style={{ margin: '8px 0 12px' }}>
                划转后：A {fmtU(after.a)} · B {fmtU(after.b)} · C {fmtU(after.c)}
              </p>
              <button
                className="btn primary"
                onClick={() =>
                  update((s) => ({
                    ...s,
                    balances: { ...after, updatedAt: stamp() },
                    events: [...s.events, { id: uid(), kind: 'settle', at: stamp() }],
                  }))
                }
              >
                已按此划转
              </button>
            </>
          ) : (
            <p className="muted">A 已经是标准额，不用划转。</p>
          )}
          {short && (
            <p className="small red" style={{ marginTop: 10 }}>
              B 已经补不满 A 了，作战金只剩 {fmtU(after.a)}U。离出局不远，想清楚还要不要打。
            </p>
          )}
          {state.balances.c < info.c - 0.005 && (
            <p className="small amber" style={{ marginTop: 10 }}>
              奖池任务：C 还差 {fmtU(info.c - state.balances.c)}U 补满，盈利优先进 C。
            </p>
          )}
        </Card>
      );
    }

    case 'upgrade': {
      const { to, withdraw, target } = action;
      return (
        <Card title={`升级到 Lv${to}`}>
          <Banner tone="green" title="打爆奖池">
            <ol className="steps">
              <li>暂停交易</li>
              <li>
                提现 <b>{fmtU(withdraw)}U</b>（≈ {fmtCny(withdraw * rate)}）到场外，上一级的奖池一起带走
              </li>
              <li>
                重置：A {fmtU(target.a)}U · B {fmtU(target.b)}U · C 0（新等级的奖池先用利润补满）
              </li>
            </ol>
          </Banner>
          <div className="btn-row" style={{ marginTop: 12 }}>
            <button
              className="btn primary"
              onClick={() =>
                commit('upgrade', () => ({ level: to, balances: { ...target, updatedAt: stamp() } }), withdraw, `升级提现 Lv${state.level}→Lv${to}`)
              }
            >
              已完成升级
            </button>
          </div>
        </Card>
      );
    }

    case 'downgrade': {
      const { to, withdraw, target } = action;
      return (
        <Card title={`降级到 Lv${to}`}>
          <Banner tone="amber" title="降级熔断">
            <ol className="steps">
              {withdraw > 0.005 && (
                <li>
                  提现 <b>{fmtU(withdraw)}U</b>（≈ {fmtCny(withdraw * rate)}）：鼓励金，带离战场的落袋利润
                </li>
              )}
              <li>
                重置：A {fmtU(target.a)}U · B {fmtU(target.b)}U · C {fmtU(target.c)}U
              </li>
              <li>守门员锁 7 天，同时在币安开「1 周」冷静期</li>
              <li>写不少于 500 字的复盘</li>
            </ol>
            <CoolOffGuide duration="1 周" />
          </Banner>
          <div className="btn-row" style={{ marginTop: 12 }}>
            <button
              className="btn primary"
              onClick={() =>
                commit('downgrade', () => ({ level: to, balances: { ...target, updatedAt: stamp() }, pending: null }), withdraw, `降级 Lv${state.level}→Lv${to}`)
              }
            >
              已完成降级
            </button>
          </div>
        </Card>
      );
    }

    case 'exit': {
      const exitLine = levelInfo(0, st.baseCapital).downgradeAt;
      return (
        <Card title="Lv0 出局">
          <Banner tone="red" title={`总资金 ${fmtU(total)}U，已到出局线 ${fmtU(exitLine)}U`}>
            <ol className="steps">
              <li>
                全部提现 <b>{fmtU(action.withdraw)}U</b>（≈ {fmtCny(action.withdraw * rate)}）
              </li>
              <li>币安开「1 个月」或更长的冷静期</li>
              <li>至少冷静 1 个月才能开始新一轮，新一轮入金不超过上一轮</li>
            </ol>
            <CoolOffGuide duration="1 个月" />
          </Banner>
          <div className="btn-row" style={{ marginTop: 12 }}>
            <button
              className="btn danger"
              onClick={() =>
                commit('exit', () => ({ level: 0, balances: { a: 0, b: 0, c: 0, updatedAt: stamp() }, pending: null }), action.withdraw, 'Lv0 出局，全部提现')
              }
            >
              已全部提现，出局
            </button>
          </div>
        </Card>
      );
    }

    case 'clear':
      return (
        <Card title="通关">
          <Banner tone="green" title="Lv10 达成">
            <p>
              全部提现 <b>{fmtU(action.withdraw)}U</b>（≈ {fmtCny(action.withdraw * rate)}），毕业。
            </p>
          </Banner>
          <div className="btn-row" style={{ marginTop: 12 }}>
            <button
              className="btn primary"
              onClick={() =>
                commit('clear', () => ({ level: 0, balances: { a: 0, b: 0, c: 0, updatedAt: stamp() }, pending: null }), action.withdraw, '通关，全部提现')
              }
            >
              已全部提现
            </button>
          </div>
        </Card>
      );
  }
}
