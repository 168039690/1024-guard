import { useSyncExternalStore } from 'react';
import { initialState } from './defaults';
import type { AppState } from './types';

const KEY = '1024-guard:v1';

export function migrate(raw: unknown): AppState {
  const init = initialState();
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<AppState>;
  return {
    ...init,
    ...r,
    version: 1,
    level: Number.isInteger(r.level) ? r.level! : 0,
    settings: { ...init.settings, ...(r.settings ?? {}) },
    balances: { ...init.balances, ...(r.balances ?? {}) },
    trades: Array.isArray(r.trades) ? r.trades : [],
    events: Array.isArray(r.events) ? r.events : [],
    ledger: Array.isArray(r.ledger) ? r.ledger : [],
    pending: r.pending ?? null,
  };
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? migrate(JSON.parse(raw)) : initialState();
  } catch {
    return initialState();
  }
}

let state = load();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function getState(): AppState {
  return state;
}

export function update(fn: (s: AppState) => AppState): void {
  state = fn(state);
  localStorage.setItem(KEY, JSON.stringify(state));
  emit();
}

export function replaceState(next: unknown): void {
  update(() => migrate(next));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

window.addEventListener('storage', (e) => {
  if (e.key === KEY) {
    state = load();
    emit();
  }
});

export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, getState);
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
