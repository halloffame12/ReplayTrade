import { X } from 'lucide-react';
import { useEffect } from 'react';
import type { ReactNode } from 'react';

/**
 * Shared design-system primitives for ReplayTrade.
 * Everything follows the tokens in tailwind.config.js (bg-*, text-*, accent,
 * up/down, shadow-neo) so screens stay visually consistent.
 */

type Tone = 'accent' | 'up' | 'down' | 'warn' | 'muted';

const toneText: Record<Tone, string> = {
  accent: 'border-accent/50 bg-accent-dim text-accent',
  up: 'border-up/50 bg-up-dim text-up',
  down: 'border-down/50 bg-down-dim text-down',
  warn: 'border-yellow-500/50 bg-yellow-500/10 text-yellow-400',
  muted: 'border-bg-border bg-bg-elevated text-text-secondary',
};

export function Badge({
  children,
  tone = 'muted',
  className = '',
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider ${toneText[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function Button({
  children,
  onClick,
  variant = 'secondary',
  size = 'md',
  disabled,
  autoFocus,
  className = '',
  title,
  ariaLabel,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
  title?: string;
  ariaLabel?: string;
}) {
  const base =
    'inline-flex items-center justify-center gap-1.5 rounded-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40';
  const sizes = {
    sm: 'h-7 px-2 text-[11px]',
    md: 'h-8 px-3 text-[12px]',
    lg: 'h-10 px-4 text-[13px]',
  };
  const variants = {
    primary: 'bg-accent text-white hover:bg-accent-hover',
    secondary: 'border border-bg-border bg-bg-elevated text-text-primary hover:bg-bg-hover',
    ghost: 'text-text-secondary hover:bg-bg-hover hover:text-text-primary',
    danger: 'border border-down/60 bg-down-dim text-down hover:bg-down',
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      autoFocus={autoFocus}
      title={title}
      aria-label={ariaLabel}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Tooltip({
  content,
  children,
  side = 'top',
  className = '',
}: {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom';
  className?: string;
}) {
  return (
    <span className={`group relative inline-flex ${className}`}>
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute left-1/2 z-40 -translate-x-1/2 whitespace-nowrap rounded-sm border border-bg-border bg-bg-panel px-2 py-1 font-mono text-[10px] text-text-primary opacity-0 shadow-neo-sm transition-opacity duration-100 group-hover:opacity-100 ${
          side === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
        }`}
      >
        {content}
      </span>
    </span>
  );
}

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  labelledBy,
  maxWidth = 'max-w-md',
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  labelledBy?: string;
  maxWidth?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`my-6 w-full ${maxWidth} rounded-md border border-bg-border bg-bg-panel shadow-neo animate-fade-in`}
      >
        <div className="flex items-center justify-between border-b border-bg-border px-4 py-3">
          <div>
            <h2 id={labelledBy} className="text-[14px] font-bold text-text-primary">
              {title}
            </h2>
            {subtitle && <p className="text-[10px] text-text-muted">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="text-text-muted hover:text-text-primary"
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-4 py-4">{children}</div>
        {footer && <div className="flex flex-col gap-2 border-t border-bg-border px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Stat({
  label,
  value,
  tone = 'default',
  valueClass = '',
}: {
  label: ReactNode;
  value: ReactNode;
  tone?: 'default' | 'up' | 'down';
  valueClass?: string;
}) {
  const toneCls = tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : 'text-text-primary';
  return (
    <div className="rounded-sm border border-bg-border bg-bg-elevated px-2 py-1.5 text-center">
      <div className="text-[9px] uppercase tracking-wider text-text-muted">{label}</div>
      <div className={`font-mono text-[12px] font-bold ${toneCls} ${valueClass}`}>{value}</div>
    </div>
  );
}

export function Skeleton({
  className = '',
  width = '100%',
  height = 14,
}: {
  className?: string;
  width?: number | string;
  height?: number | string;
}) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-sm bg-bg-hover ${className}`}
      style={{ width, height }}
    />
  );
}

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon?: ReactNode;
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
      {icon && <div className="text-text-muted">{icon}</div>}
      <div className="text-[12px] font-semibold text-text-secondary">{title}</div>
      {message && <p className="max-w-xs text-[11px] leading-snug text-text-muted">{message}</p>}
      {action}
    </div>
  );
}
