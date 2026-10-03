import { useState } from 'react';
import { Card, Empty, Field, NumInput, Seg, Stat } from '../components/ui';
import { fmtCny, fmtDate, fmtPct, fmtU, num } from '../lib/format';
import { useNow } from '../lib/hooks';
import { DAY } from '../lib/locks';
import { uid, update, useAppState } from '../lib/store';
import { truthSummary } from '../lib/truth';
import type { LedgerEntry } from '../lib/types';

const RAISE_PHRASE = '我知道提高上限就是在给自己找借口';

export function TruthView() {
  const state = useAppState();
  const t = truthSummary(state);
  const loss = t.netLossCny;

  return (
    <div className="stack">
      <Card className="hero">
        {state.ledger.some((e) => e.type === 'deposit') ? (
          <>
            <div className="hero-label">{loss >= 0 ? '累计净亏损' : '累计净盈利'}</div>
            <div className={`hero-number ${loss > 0 ? 'red' : 'green'}`}>{fmtCny(Math.abs(loss))}</div>
            <div className="formula">
              入金 {fmtCny(t.depositCny)} − 提现 {fmtCny(t.withdrawCny)} − 当前余额 {fmtCny(t.balanceCny)}
              <br />
              余额按 {fmtU(t.balanceU)}U × {state.settings.usdtCny} 折算
            </div>
          </>
        ) : (
          <>
            <div className="hero-label">累计净亏损</div>
            <div className="hero-number muted">未记录</div>
            <p className="small muted" style={{ marginTop: 14 }}>
              在下面把每一次入金都记下来，包括已经亏光的那几次。不记入金，这个数字就是假的。
            </p>
          </>
        )}
      </Card>
      <div className="cols">
        <div className="col">
          <CapCard key={state.settings.lossCapCny ?? 'none'} cap={state.settings.lossCapCny} loss={loss} />
          <DisciplineCard />
        </div>
        <div className="col">
          <LedgerCard ledger={state.ledger} />
        </div>
      </div>
    </div>
  );
}

function CapCard({ cap, loss }: { cap: number | null; loss: number }) {
  const [v, setV] = useState(cap ? String(cap) : '');
  const [phrase, setPhrase] = useState('');
  const val = num(v);
  const raising = cap != null && val > cap;
  const canSave = val > 0 && val !== cap && (!raising || phrase.trim() === RAISE_PHRASE);
  const pct = cap ? Math.min(1, Math.max(0, loss / cap)) : 0;

  return (
    <Card title="终极熔断线" extra="手册第一章第 3 节">
      {cap ? (
        <>
          <div className="progress red">
            <div style={{ width: `${pct * 100}%` }} />
          </div>
          <p className="small" style={{ marginBottom: 12 }}>
            {loss >= cap ? (
              <b className="red">已达到上限：永久退出，币安冷静期选「无期限」。</b>
            ) : (
              <>
                上限 {fmtCny(cap)}，已用掉 {fmtPct(pct, 0)}，还剩 <b>{fmtCny(cap - loss)}</b>。
              </>
            )}
          </p>
        </>
      ) : (
        <p className="small muted" style={{ marginBottom: 12 }}>
          给自己定一个累计净亏损上限，碰到就永久退出。写下来，最好告诉一个信任的人。
        </p>
      )}
      <Field label="上限（人民币）" hint={cap ? '调低随时可以；调高要先输入一句话。' : undefined}>
        <NumInput value={v} onChange={setV} placeholder="例如 15000" />
      </Field>
      {raising && (
        <Field label={`提高上限，请输入：${RAISE_PHRASE}`}>
          <input value={phrase} onChange={(e) => setPhrase(e.target.value)} />
        </Field>
      )}
      <button
        className="btn"
        disabled={!canSave}
        onClick={() => update((s) => ({ ...s, settings: { ...s.settings, lossCapCny: val } }))}
      >
        保存上限
      </button>
    </Card>
  );
}

function DisciplineCard() {
  const state = useAppState();
  const now = useNow(60_000);
  const viaGate = state.trades.filter((t) => t.viaGate).length;
  const offGate = state.trades.length - viaGate;
  const skips = state.events.filter((e) => e.kind === 'skip').length;
  const violations = state.events.filter((e) => e.kind === 'violation');
  const lastViolation = violations.reduce((m, e) => Math.max(m, Date.parse(e.at)), 0);
  return (
    <Card title="纪律">
      <div className="stats">
        <Stat label="走闸门开单" value={`${viaGate} 笔`} sub={offGate ? `没走闸门 ${offGate} 笔` : undefined} />
        <Stat label="忍住没开" value={`${skips} 次`} sub="冷静后主动放弃" tone={skips ? 'green' : undefined} />
        <Stat label="违规" value={`${violations.length} 次`} tone={violations.length ? 'red' : undefined} />
        <Stat
          label="距上次违规"
          value={lastViolation ? `${Math.floor((now - lastViolation) / DAY)} 天` : '从未违规'}
        />
      </div>
    </Card>
  );
}

function LedgerCard({ ledger }: { ledger: LedgerEntry[] }) {
  const [date, setDate] = useState(fmtDate(Date.now()));
  const [type, setType] = useState<LedgerEntry['type']>('deposit');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const amt = num(amount);
  const rows = [...ledger].sort((x, y) => y.date.localeCompare(x.date));

  function add() {
    update((s) => ({ ...s, ledger: [...s.ledger, { id: uid(), date, type, cny: amt, note: note.trim() || undefined }] }));
    setAmount('');
    setNote('');
  }

  return (
    <Card title="入金 / 提现记录">
      <div className="grid2">
        <Field label="日期">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="类型">
          <Seg
            value={type}
            options={[
              { value: 'deposit', label: '入金' },
              { value: 'withdraw', label: '提现' },
            ]}
            onChange={setType}
          />
        </Field>
        <Field label="金额（人民币）">
          <NumInput value={amount} onChange={setAmount} />
        </Field>
        <Field label="备注">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="例如：第 4 次，币安" />
        </Field>
      </div>
      <div className="btn-row" style={{ marginTop: 12 }}>
        <button className="btn primary" disabled={!(amt > 0)} onClick={add}>
          添加
        </button>
      </div>
      <div style={{ marginTop: 12 }}>
        {rows.length ? (
          rows.map((e) => (
            <div className="list-row" key={e.id}>
              <div className="grow">
                <b className={e.type === 'deposit' ? 'red' : 'green'}>
                  {e.type === 'deposit' ? '入金' : '提现'} {fmtCny(e.cny)}
                </b>
                <div className="small muted">
                  {e.date}
                  {e.note ? ` · ${e.note}` : ''}
                </div>
              </div>
              <button
                className="btn sm ghost"
                onClick={() => confirm('删除这条记录？') && update((s) => ({ ...s, ledger: s.ledger.filter((x) => x.id !== e.id) }))}
              >
                删除
              </button>
            </div>
          ))
        ) : (
          <Empty>没有记录</Empty>
        )}
      </div>
    </Card>
  );
}
