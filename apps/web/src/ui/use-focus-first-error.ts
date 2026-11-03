'use client';

import { useEffect } from 'react';

/**
 * DESIGN §8 / RESEARCH M4: a failed submit moves focus to the first invalid
 * control. Kit fields render `aria-invalid="true"` whenever `error` is set,
 * so the first invalid control on the page is simply the first
 * `[aria-invalid="true"]` after paint — no per-form refs needed.
 *
 * Scope (P1): the auth forms. Adopt in the remaining `fieldErrors` forms as
 * part of the P2 design-system pass.
 */
export function useFocusFirstError(fieldErrors: Record<string, string>): void {
  useEffect(() => {
    if (Object.keys(fieldErrors).length === 0) return;
    // Defer past React's commit so aria-invalid is in the DOM.
    const frame = window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [fieldErrors]);
}
