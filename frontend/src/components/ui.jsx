/* Small presentational primitives shared across the three views. */
import { useEffect, useState } from 'react';

export const PRIORITY = [
  { label: 'Urgent', color: 'var(--danger)' },
  { label: 'Soon', color: 'var(--warning)' },
  { label: 'Later', color: 'var(--text-tertiary)' },
];

export function priorityOf(value) {
  return PRIORITY[value] ?? PRIORITY[2];
}

/** Breakpoint tier, matching the handoff: <440 / <620 / <900 / above. */
export function useTier() {
  const [width, setWidth] = useState(() =>
    typeof window === 'undefined' ? 1440 : window.innerWidth,
  );

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (width < 440) return 'xxs';
  if (width < 620) return 'xs';
  if (width < 900) return 'sm';
  return 'lg';
}

/** "9:04", "Yest", "Mon", or a date once it is more than a week old. */
export function timeLabel(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.floor((startOfToday - new Date(date.getFullYear(), date.getMonth(), date.getDate())) / 86400000);

  if (days <= 0) {
    // 24h with no meridiem: "9:04", "16:30". A 12h string wraps the narrow
    // time column on phones, and the prototype shows no am/pm either.
    return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
  }
  if (days === 1) return 'Yest';
  if (days < 7) return date.toLocaleDateString([], { weekday: 'short' });
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function hhmm(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function Checkbox({ checked, onChange, label, large = false, ...rest }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      className={large ? 'checkbox checkbox-lg' : 'checkbox'}
      onClick={(event) => {
        event.stopPropagation();
        onChange?.(!checked);
      }}
      {...rest}
    >
      {checked ? '✓' : ''}
    </button>
  );
}

export function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="toggle"
      onClick={() => onChange?.(!checked)}
    >
      <span
        className="toggle-knob"
        style={{ transform: checked ? 'translateX(16px)' : 'translateX(0)' }}
      />
    </button>
  );
}

export function Chip({ active, onClick, children, count, small = false, title }) {
  return (
    <button
      type="button"
      aria-pressed={!!active}
      className={small ? 'chip chip-sm' : 'chip'}
      onClick={onClick}
      title={title}
    >
      {children}
      {count !== undefined && <span className="chip-count">{count}</span>}
    </button>
  );
}

export function Card({ children, className = '', pad = true, ...rest }) {
  return (
    <div className={`card ${pad ? 'card-pad' : ''} ${className}`.trim()} {...rest}>
      {children}
    </div>
  );
}

export function Metric({ label, value, hint, hintColor }) {
  return (
    <div className="card card-pad">
      <div className="label">{label}</div>
      <div className="row gap-8 mt-8" style={{ alignItems: 'baseline' }}>
        <span className="metric-number">{value}</span>
        {hint && (
          <span className="mono" style={{ color: hintColor || 'var(--text-tertiary)' }}>
            {hint}
          </span>
        )}
      </div>
    </div>
  );
}

export function Empty({ title, body }) {
  return (
    <div className="empty">
      <div className="h2" style={{ color: 'var(--text-secondary)' }}>
        {title}
      </div>
      {body && <div className="small muted mt-4">{body}</div>}
    </div>
  );
}

export function Spinner({ label = 'Loading' }) {
  return (
    <div className="empty muted small" role="status">
      {label}…
    </div>
  );
}

export function ErrorNote({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="card card-pad" style={{ borderLeft: '3px solid var(--danger)' }}>
      <div className="small" style={{ color: 'var(--danger)', fontWeight: 600 }}>
        {error}
      </div>
      {onRetry && (
        <button type="button" className="btn btn-sm mt-12" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

/** Renders composed message parts, painting model-written text in the accent. */
export function ComposedText({ parts }) {
  return (
    <>
      {parts.map((part, index) => (
        <span
          key={index}
          style={{
            color: part.ai ? 'var(--accent)' : 'var(--text-body)',
            fontWeight: part.ai ? 600 : 400,
          }}
        >
          {part.text}
        </span>
      ))}
    </>
  );
}
