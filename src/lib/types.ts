export type Direction = 'long' | 'short';
export type TrendState = 'up' | 'down' | 'unclear';

export interface TrendInfo {
  state: TrendState;
  close: number;
  ema20: number;
  ema50: number;
}

export interface Settings {
  baseCapital: number;
  takerFee: number;
  slippage: number;
  mmrMajor: number;
  mmrAlt: number;
  levCapMajor: number;
  levCapAlt: number;
  liqSafety: number;
  minQuoteVolume: number;
  minRR: number;
  coolMinutes: number;
  usdtCny: number;
  lossCapCny: number | null;
  dataSource: 'auto' | 'futures' | 'spot';
}

export interface Balances {
  a: number;
  b: number;
  c: number;
  updatedAt: string | null;
}

export interface Fill {
  kind: 'open' | 'close';
  qty: number;
  price: number;
  at: string;
}

export interface TradePlan {
  entry: number;
  stop: number;
  target: number;
  leverage: number;
  qty: number;
  notional: number;
  margin: number;
  riskU: number;
  liq: number;
  rr: number;
}

export type ExitReason = 'stop' | 'breakeven' | 'target' | 'trail' | 'manual';

export interface Trade {
  id: string;
  symbol: string;
  direction: Direction;
  createdAt: string;
  viaGate: boolean;
  level: number;
  plan: TradePlan;
  fills: Fill[];
  currentStop: number;
  status: 'open' | 'closed';
  closedAt?: string;
  exitReason?: ExitReason;
  emotion?: string;
  note?: string;
}

export type EventKind = 'violation' | 'downgrade' | 'exit' | 'upgrade' | 'clear' | 'skip' | 'settle';

export interface GuardEvent {
  id: string;
  kind: EventKind;
  at: string;
  detail?: string;
  lockUntil?: string;
}

export interface LedgerEntry {
  id: string;
  date: string;
  type: 'deposit' | 'withdraw';
  cny: number;
  note?: string;
}

export interface Pending {
  key: string;
  startedAt: string;
}

export interface AppState {
  version: 1;
  settings: Settings;
  level: number;
  balances: Balances;
  trades: Trade[];
  events: GuardEvent[];
  ledger: LedgerEntry[];
  pending: Pending | null;
}
