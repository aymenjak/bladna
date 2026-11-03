import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /**
   * Element to render — call sites keep their semantics (`section` landmarks,
   * `li` list items) while sharing the one card surface (P2 / RESEARCH H6).
   */
  as?: 'div' | 'section' | 'li' | 'article';
}

export function Card({ className, as: Tag = 'div', ...rest }: CardProps) {
  return (
    <Tag
      className={cn('rounded-card border border-sand-200 bg-white p-5 shadow-card', className)}
      {...rest}
    />
  );
}

export function CardTitle({ className, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('text-base font-semibold text-sand-900', className)} {...rest} />;
}

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
}

const TONES: Record<NonNullable<BadgeProps['tone']>, string> = {
  neutral: 'bg-sand-100 text-sand-700',
  success: 'bg-brand-100 text-brand-800',
  warning: 'bg-amber-100 text-amber-800',
  danger: 'bg-red-100 text-red-800',
  info: 'bg-sky-100 text-sky-800',
};

export function Badge({ tone = 'neutral', className, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        TONES[tone],
        className,
      )}
      {...rest}
    />
  );
}

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  /** Semantic tone — errors announce as `role="alert"`, others as `status`. */
  tone?: 'danger' | 'success' | 'warning' | 'info';
}

const ALERT_TONES: Record<NonNullable<AlertProps['tone']>, string> = {
  danger: 'border-red-200 bg-red-50 text-red-800',
  success: 'border-brand-200 bg-brand-50 text-brand-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  info: 'border-sky-200 bg-sky-50 text-sky-900',
};

export interface AvatarProps extends HTMLAttributes<HTMLSpanElement> {
  /** Initials (or a short glyph) rendered when the tile has no image. */
  children?: ReactNode;
  /** Tile size (display-only initials — not an interactive target). */
  size?: 'sm' | 'md' | 'lg';
  /** Optional image URL — covers the tile; initials stay the fallback. */
  src?: string;
  /** Image text — empty by default (the tile sits beside a visible name). */
  alt?: string;
}

const AVATAR_SIZES: Record<NonNullable<AvatarProps['size']>, string> = {
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-12 text-lg',
};

/** One identity tile (RESEARCH H6 — was 5 hand-rolled `bg-brand-700` grids). */
export function Avatar({ size = 'md', src, alt = '', className, children, ...rest }: AvatarProps) {
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center overflow-hidden rounded-lg bg-brand-700 font-bold text-white',
        AVATAR_SIZES[size],
        className,
      )}
      {...rest}
    >
      {src ? (
        // Plain <img>: the kit stays framework-free; assets are same-origin
        // (/photos) and decorative by default — the name sits beside the tile.
        <img src={src} alt={alt} className="size-full object-cover" loading="lazy" />
      ) : (
        children
      )}
    </span>
  );
}

export function Alert({ tone = 'danger', className, ...rest }: AlertProps) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('rounded-xl border px-4 py-3 text-sm', ALERT_TONES[tone], className)}
      {...rest}
    />
  );
}

export function EmptyState({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-xl border border-dashed border-sand-200 px-6 py-10 text-center text-sm text-sand-500',
        className,
      )}
      {...rest}
    />
  );
}
