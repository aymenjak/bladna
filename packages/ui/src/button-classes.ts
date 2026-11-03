// Class builder shared by client and server surfaces.
// Deliberately NOT 'use client': server components (landing CTA, profile PDF
// links, admin pages…) call buttonClasses() at render time, which would fail
// if this lived in the client-only button module.

import { cn } from './cn';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand-700 text-white shadow-sm hover:bg-brand-800 focus-visible:outline-brand-700',
  secondary: 'bg-sand-900 text-white shadow-sm hover:bg-sand-700 focus-visible:outline-sand-900',
  outline:
    'border border-sand-200 bg-white text-sand-900 shadow-sm hover:bg-sand-100 focus-visible:outline-sand-900',
  ghost: 'text-sand-700 hover:bg-sand-100 focus-visible:outline-sand-900',
  danger: 'bg-red-700 text-white shadow-sm hover:bg-red-800 focus-visible:outline-red-700',
};

// Touch targets per RESEARCH H3 / roadmap P2: every kit size is ≥44px (the
// old sm was h-8 = 32px). sm/md share the 44px height and differ by density
// (sm = text-xs table/toolbar actions, md = default), lg = 48px.
const SIZES: Record<ButtonSize, string> = {
  sm: 'h-11 px-3 text-xs',
  md: 'h-11 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
};

/**
 * Shared class builder — `<Button>` uses it directly, and non-button
 * elements (links styled as CTAs, the skip link) use it so no raw
 * `bg-brand-700` button styling exists outside the kit (RESEARCH H6).
 */
export function buttonClasses(options?: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}): string {
  const { variant = 'primary', size = 'md', className } = options ?? {};
  return cn(
    'inline-flex items-center justify-center gap-2 rounded-lg font-medium',
    'transition-[color,background-color,border-color,box-shadow,transform]',
    'focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60',
    // P9: a 1px hover lift reads as tactility — strictly opt-in for users who
    // allow motion (the transition above still animates color only for them).
    'motion-safe:hover:-translate-y-px',
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}
