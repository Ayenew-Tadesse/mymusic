import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export function Artwork({ src, size, round, className = '' }: { src: string | null | undefined; size: number; round?: boolean; className?: string }) {
  const style = { width: size, height: size, borderRadius: round ? '50%' : size > 100 ? 8 : 4 };
  if (!src) {
    return (
      <div className={`art ${className}`} style={style} aria-hidden>
        <Icon name="note" size={Math.round(size * 0.4)} />
      </div>
    );
  }
  return <img className={`art ${className}`} style={style} src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />;
}

export function IconButton({ icon, label, active, size = 20, className = '', ...rest }: { icon: IconName; label: string; active?: boolean; size?: number } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={`icon-btn ${active ? 'active' : ''} ${className}`} aria-label={label} title={label} aria-pressed={active} {...rest}>
      <Icon name={icon} size={size} />
    </button>
  );
}

export function Spinner() {
  return <div className="spinner" role="status" aria-label="Loading" />;
}

export function Empty({ icon, title, children }: { icon: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} size={56} />
      <h2>{title}</h2>
      {children}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Empty icon="close" title="Couldn’t load this">
      <p>{message}</p>
      {onRetry && (
        <button className="btn btn-secondary btn-sm" onClick={onRetry}>
          Try again
        </button>
      )}
    </Empty>
  );
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="section">
      <div className="section-head">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
