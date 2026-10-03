export function fmtU(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', { maximumFractionDigits: digits });
}

export function priceDigits(p: number): number {
  const a = Math.abs(p);
  if (a >= 1000) return 2;
  if (a >= 10) return 3;
  if (a >= 1) return 4;
  if (a >= 0.01) return 5;
  return 8;
}

export function fmtPrice(p: number | null | undefined): string {
  if (p == null || !Number.isFinite(p)) return '—';
  return p.toLocaleString('en-US', { maximumFractionDigits: priceDigits(p) });
}

function qtyDigits(q: number): number {
  return q >= 1000 ? 0 : q >= 10 ? 2 : q >= 1 ? 3 : q >= 0.01 ? 4 : 6;
}

/** 数量向下取整，避免超出风险额。 */
export function roundQty(q: number): number {
  if (!Number.isFinite(q)) return NaN;
  const f = 10 ** qtyDigits(q);
  return Math.floor(q * f + 1e-9) / f;
}

export function fmtQty(q: number): string {
  if (!Number.isFinite(q)) return '—';
  return roundQty(q).toLocaleString('en-US', { maximumFractionDigits: qtyDigits(q) });
}

export function fmtPct(x: number | null | undefined, digits = 2): string {
  if (x == null || !Number.isFinite(x)) return '—';
  return `${(x * 100).toFixed(digits)}%`;
}

export function fmtBig(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1e8) return `${(n / 1e8).toFixed(2)} 亿`;
  if (Math.abs(n) >= 1e4) return `${Math.round(n / 1e4).toLocaleString('en-US')} 万`;
  return fmtU(n, 0);
}

export function fmtCny(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return `${n < 0 ? '-' : ''}¥${fmtU(Math.abs(n), 0)}`;
}

export function fmtSigned(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return '—';
  return `${n > 0 ? '+' : ''}${fmtU(n, digits)}`;
}

export function fmtR(r: number): string {
  if (!Number.isFinite(r)) return '—';
  return `${r > 0 ? '+' : ''}${r.toFixed(2)}R`;
}

export function fmtDuration(ms: number): string {
  if (ms <= 0) return '0 秒';
  const s = Math.ceil(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d} 天 ${h} 小时`;
  if (h > 0) return `${h} 小时 ${m} 分`;
  if (m > 0) return `${m} 分 ${sec} 秒`;
  return `${sec} 秒`;
}

export function fmtClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function fmtTime(t: string | number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtDate(t: string | number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function num(s: string): number {
  const v = parseFloat(s.replace(/[,，\s]/g, ''));
  return Number.isFinite(v) ? v : NaN;
}
