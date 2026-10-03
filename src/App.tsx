import { useEffect, useState } from 'react';
import { fmtDuration } from './lib/format';
import { balancesStale } from './lib/gate';
import { useNow } from './lib/hooks';
import { levelAction } from './lib/levels';
import { activeLocks } from './lib/locks';
import { useAppState } from './lib/store';
import type { AppState } from './lib/types';
import { FundsView } from './views/FundsView';
import { GateView } from './views/GateView';
import { ManualView } from './views/ManualView';
import { SettingsView } from './views/SettingsView';
import { TradesView } from './views/TradesView';
import { TruthView } from './views/TruthView';

type Tab = 'gate' | 'trades' | 'funds' | 'truth' | 'manual' | 'settings';

const TABS: { id: Tab; label: string }[] = [
  { id: 'gate', label: '闸门' },
  { id: 'trades', label: '持仓' },
  { id: 'funds', label: '资金' },
  { id: 'truth', label: '真相' },
  { id: 'manual', label: '手册' },
  { id: 'settings', label: '设置' },
];

function tabFromHash(): Tab {
  const h = location.hash.slice(1);
  return TABS.some((t) => t.id === h) ? (h as Tab) : 'gate';
}

function headerStatus(state: AppState, now: number): { tone: string; text: string } {
  const locks = activeLocks(state, now);
  const { a, b, c } = state.balances;
  const total = a + b + c;
  const action = levelAction(state.level, total, state.settings.baseCapital);
  if (locks.some((l) => l.until === null)) return { tone: 'red', text: '终极熔断' };
  if (total > 0 && action.kind === 'exit') return { tone: 'red', text: '已出局' };
  const timed = locks.find((l) => l.until !== null);
  if (timed) return { tone: 'amber', text: `锁定 ${fmtDuration(timed.until! - now)}` };
  if (total <= 0) return { tone: 'muted', text: '未设置资金' };
  if (balancesStale(state)) return { tone: 'amber', text: '待更新余额' };
  if (action.kind === 'upgrade') return { tone: 'amber', text: '待升级' };
  if (action.kind === 'downgrade') return { tone: 'amber', text: '待降级' };
  if (action.kind === 'clear') return { tone: 'green', text: '通关' };
  if (state.trades.some((t) => t.status === 'open')) return { tone: 'blue', text: `Lv${state.level} · 持仓中` };
  return { tone: 'green', text: `Lv${state.level} · 可开单` };
}

export function App() {
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const state = useAppState();
  const now = useNow(1000);

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (t: Tab) => {
    setTab(t);
    history.replaceState(null, '', `#${t}`);
    window.scrollTo(0, 0);
  };

  const status = headerStatus(state, now);
  const tabButtons = TABS.map((t) => (
    <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => go(t.id)}>
      {t.label}
    </button>
  ));

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span>1024</span> 守门员
        </div>
        <nav className="tabs-desktop">{tabButtons}</nav>
        <div className={`status-chip tone-${status.tone}`}>{status.text}</div>
      </header>
      <main>
        {tab === 'gate' && <GateView goTo={go} />}
        {tab === 'trades' && <TradesView />}
        {tab === 'funds' && <FundsView />}
        {tab === 'truth' && <TruthView />}
        {tab === 'manual' && <ManualView />}
        {tab === 'settings' && <SettingsView />}
      </main>
      <nav className="tabs-mobile">{tabButtons}</nav>
    </div>
  );
}
