'use client';

// Accessible tab set — **Radix Tabs** (P6 "adopt standard libraries") behind
// the kit's call shape. `TabsRoot` wraps the tablist and its panels: Radix
// keeps the shared selection context there, so — unlike the old fragment —
// the pieces share an ancestor. It renders `display: contents`, so the layout
// callers already styled is untouched (`className` carries spacing utilities
// such as `space-y-4`, which apply to the wrapped children as before).
//
// `Tabs` renders the roving tablist, `TabPanel` renders a pane (only while it
// is the active one). Callers keep deep-linking (?tab=) by driving `active`
// from their existing state; Radix owns the APG behavior the hand-rolled
// version implemented (roving tabindex, Arrow/Home/End with focus following,
// `aria-controls`/`aria-labelledby` wiring).

import * as TabsPrimitive from '@radix-ui/react-tabs';
import type { ReactNode } from 'react';
import { cn } from './cn';

export interface TabItem<T extends string = string> {
  id: T;
  label: ReactNode;
}

export interface TabsRootProps<T extends string = string> {
  active: T;
  onSelect: (id: T) => void;
  children: ReactNode;
  /** Spacing utilities applied to the wrapped tablist + panels. */
  className?: string;
}

/** Context wrapper for a tab set — must contain `Tabs` and its `TabPanel`s. */
export function TabsRoot<T extends string = string>({
  active,
  onSelect,
  children,
  className,
}: TabsRootProps<T>) {
  return (
    <TabsPrimitive.Root
      value={active}
      onValueChange={(value) => onSelect(value as T)}
      // Layout-transparent wrapper: it only carries Radix's context, no box.
      className={cn('contents', className)}
    >
      {children}
    </TabsPrimitive.Root>
  );
}

export interface TabsProps<T extends string = string> {
  items: TabItem<T>[];
  /** Selection lives in `TabsRoot` — kept for call-shape compatibility. */
  active: T;
  onSelect: (id: T) => void;
  /** Accessible name of the tablist (WCAG 4.1.2). */
  ariaLabel: string;
  className?: string;
}

export function Tabs<T extends string = string>({ items, ariaLabel, className }: TabsProps<T>) {
  return (
    // Segmented bar on system tokens (P14): the track carries the standard
    // sand hairline so it reads as a control on any surface, the active pill
    // is brand-600 — the same green as primary buttons (brand-700 was the
    // heavier pre-P14 slab) — and the row never wraps: it scrolls horizontally
    // instead, keeping one line at any viewport width (wrapping split the bar
    // into two ragged rows). Inactive hover lifts to white with darker text,
    // so hover can never be mistaken for the solid active state.
    <TabsPrimitive.List
      aria-label={ariaLabel}
      className={cn(
        'flex gap-1 overflow-x-auto rounded-xl border border-sand-200 bg-sand-100 p-1',
        className,
      )}
    >
      {items.map((item) => (
        <TabsPrimitive.Trigger
          key={item.id}
          value={item.id}
          type="button"
          className={cn(
            'h-11 shrink-0 rounded-lg px-4 text-sm font-medium transition-colors',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sand-900',
            'data-[state=active]:bg-brand-600 data-[state=active]:text-white data-[state=active]:shadow-sm',
            'data-[state=inactive]:text-sand-600 data-[state=inactive]:hover:bg-white data-[state=inactive]:hover:text-sand-900',
          )}
        >
          {item.label}
        </TabsPrimitive.Trigger>
      ))}
    </TabsPrimitive.List>
  );
}

export interface TabPanelProps<T extends string = string> {
  id: T;
  /** Pane visibility lives in `TabsRoot` — kept for call-shape compatibility. */
  active: T;
  children: ReactNode;
  className?: string;
}

/**
 * Matching panel for `Tabs` — rendered only while it is the active pane
 * (Radix unmounts the rest, per tab semantics). Not focusable by default:
 * admin panels always contain focusable controls, so the APG flow is
 * tab → first control in the panel.
 */
export function TabPanel<T extends string = string>({ id, children, className }: TabPanelProps<T>) {
  return (
    <TabsPrimitive.Content value={id} className={className}>
      {children}
    </TabsPrimitive.Content>
  );
}
