import { useEffect, useState, type ReactNode } from 'react';
import type { CheckStatus } from '../lib/gate';

export function Card({
  title,
  extra,
  children,
  className = '',
}: {
  title?: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || extra) && (
        <div className="card-head">
          {title && <h2>{title}</h2>}
          {extra && <div className="extra">{extra}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}

export function NumInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function Seg<T extends string>({
  value,
  options,
  onChange,
  tone,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  tone?: (v: T) => string;
}) {
  return (
    <div className="seg" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? (tone ? tone(o.value) : 'on') : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${tone ?? ''}`}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

const ICON: Record<CheckStatus, string> = { pass: '✓', fail: '✕', wait: '…' };

export function StatusIcon({ status }: { status: CheckStatus }) {
  return <span className={`check-icon ${status}`}>{ICON[status]}</span>;
}

export function Banner({ tone, title, children }: { tone: 'red' | 'amber' | 'blue' | 'green'; title: ReactNode; children?: ReactNode }) {
  return (
    <div className={`banner ${tone}`}>
      <div className="banner-title">{title}</div>
      {children}
    </div>
  );
}

export function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="btn sm ghost" onClick={onClose}>
            关闭
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function CopyBtn({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn sm ghost"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        });
      }}
    >
      {done ? '已复制' : '复制'}
    </button>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
