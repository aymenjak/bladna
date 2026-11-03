'use client';

// Destructive/irreversible action gate (P6 "adopt standard libraries"):
// the raw `window.confirm` / `window.prompt` calls are replaced by a
// **Radix AlertDialog / Dialog** behind a promise-based kit API — same call
// shape as the browser dialogs (`await confirm(message)`,
// `await prompt(label)`), but styled like the rest of the product,
// translated through the provider's labels, APG dialog semantics
// (focus management, Esc/overlay dismissal resolve `false` / `null`) and no
// main-thread blocking. Errors that belong to a control stay inline;
// this component only gates the *decision*.

import * as AlertDialog from '@radix-ui/react-alert-dialog';
import * as Dialog from '@radix-ui/react-dialog';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { buttonClasses } from './button-classes';
import { Input } from './field';

export interface ConfirmLabels {
  /** Default confirm button text (e.g. `dict.common.confirm`). */
  confirm: string;
  cancel: string;
}

export interface ConfirmOptions {
  /** Optional heading; without it the message itself becomes the title. */
  title?: string;
  /** Per-call confirm label (defaults to the provider's). */
  confirmLabel?: string;
  /** `danger` renders the confirm action in the kit danger variant. */
  tone?: 'default' | 'danger';
}

export type ConfirmFn = (message: string, options?: ConfirmOptions) => Promise<boolean>;

export interface PromptOptions {
  /** Optional heading; without it the field label becomes the title. */
  title?: string;
  defaultValue?: string;
  /** Per-call confirm label (defaults to the provider's). */
  confirmLabel?: string;
}

/** Resolves the entered text, or `null` when the dialog is dismissed. */
export type PromptFn = (label: string, options?: PromptOptions) => Promise<string | null>;

const ConfirmContext = createContext<ConfirmFn | null>(null);
const PromptContext = createContext<PromptFn | null>(null);

interface PendingConfirm {
  message: string;
  title?: string;
  confirmLabel?: string;
  tone: 'default' | 'danger';
}

interface PendingPrompt {
  label: string;
  title?: string;
  confirmLabel?: string;
  defaultValue: string;
}

export function ConfirmProvider({
  labels,
  children,
}: {
  labels: ConfirmLabels;
  children: ReactNode;
}) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);
  const [promptPending, setPromptPending] = useState<PendingPrompt | null>(null);
  const [promptValue, setPromptValue] = useState('');
  const promptRef = useRef<((value: string | null) => void) | null>(null);

  const settle = useCallback((value: boolean): void => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setPending(null);
    resolve?.(value);
  }, []);

  const settlePrompt = useCallback((value: string | null): void => {
    const resolve = promptRef.current;
    promptRef.current = null;
    setPromptPending(null);
    setPromptValue('');
    resolve?.(value);
  }, []);

  const confirm = useCallback<ConfirmFn>((message, options) => {
    // A second request while one is open resolves the first as cancelled.
    resolverRef.current?.(false);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setPending({
        message,
        title: options?.title,
        confirmLabel: options?.confirmLabel,
        tone: options?.tone ?? 'default',
      });
    });
  }, []);

  const prompt = useCallback<PromptFn>((label, options) => {
    // A second request while one is open resolves the first as cancelled.
    promptRef.current?.(null);
    return new Promise<string | null>((resolve) => {
      promptRef.current = resolve;
      setPromptValue(options?.defaultValue ?? '');
      setPromptPending({
        label,
        title: options?.title,
        confirmLabel: options?.confirmLabel,
        defaultValue: options?.defaultValue ?? '',
      });
    });
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      <PromptContext.Provider value={prompt}>
        {children}
        <AlertDialog.Root
          open={pending !== null}
          onOpenChange={(open) => {
            // Esc / overlay click → the promise resolves `false`.
            if (!open && resolverRef.current) settle(false);
          }}
        >
          <AlertDialog.Portal>
            <AlertDialog.Overlay className="fixed inset-0 z-50 bg-sand-900/40" />
            {/* No Description element: the message *is* the Title (or the Title
              renders it), so `aria-describedby` is intentionally undefined. */}
            <AlertDialog.Content
              aria-describedby={undefined}
              className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-sand-200 bg-white p-5 shadow-xl focus:outline-none"
            >
              <AlertDialog.Title className="text-base font-semibold text-sand-900">
                {pending?.title ?? pending?.message ?? ''}
              </AlertDialog.Title>
              {pending?.title ? (
                <AlertDialog.Description className="mt-2 text-sm text-sand-600">
                  {pending.message}
                </AlertDialog.Description>
              ) : null}
              <div className="mt-5 flex justify-end gap-2">
                <AlertDialog.Cancel asChild>
                  <button type="button" className={buttonClasses({ variant: 'outline' })}>
                    {labels.cancel}
                  </button>
                </AlertDialog.Cancel>
                <AlertDialog.Action asChild>
                  <button
                    type="button"
                    className={buttonClasses({
                      variant: pending?.tone === 'danger' ? 'danger' : 'primary',
                    })}
                    onClick={() => settle(true)}
                  >
                    {pending?.confirmLabel ?? labels.confirm}
                  </button>
                </AlertDialog.Action>
              </div>
            </AlertDialog.Content>
          </AlertDialog.Portal>
        </AlertDialog.Root>
        <Dialog.Root
          open={promptPending !== null}
          onOpenChange={(open) => {
            // Esc / overlay click → the promise resolves `null` (cancelled).
            if (!open && promptRef.current) settlePrompt(null);
          }}
        >
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-sand-900/40" />
            {/* Single labelled field (Title/label), no Description needed. */}
            <Dialog.Content
              aria-describedby={undefined}
              className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-sand-200 bg-white p-5 shadow-xl focus:outline-none"
            >
              <Dialog.Title className="text-base font-semibold text-sand-900">
                {promptPending?.title ?? promptPending?.label ?? ''}
              </Dialog.Title>
              <form
                className="mt-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  settlePrompt(promptValue);
                }}
              >
                {promptPending?.title ? (
                  <label
                    htmlFor="kit-prompt-input"
                    className="mb-1.5 block text-sm font-medium text-sand-700"
                  >
                    {promptPending.label}
                  </label>
                ) : null}
                <Input
                  id="kit-prompt-input"
                  aria-label={promptPending?.title ? undefined : promptPending?.label}
                  value={promptValue}
                  onChange={(event) => setPromptValue(event.target.value)}
                  autoFocus
                />
                <div className="mt-5 flex justify-end gap-2">
                  <Dialog.Close asChild>
                    <button type="button" className={buttonClasses({ variant: 'outline' })}>
                      {labels.cancel}
                    </button>
                  </Dialog.Close>
                  <button type="submit" className={buttonClasses({ variant: 'primary' })}>
                    {promptPending?.confirmLabel ?? labels.confirm}
                  </button>
                </div>
              </form>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </PromptContext.Provider>
    </ConfirmContext.Provider>
  );
}

/** Promise-based confirm for event handlers — drop-in for `window.confirm`. */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside <ConfirmProvider>.');
  return ctx;
}

/** Promise-based text prompt — drop-in for `window.prompt` (resolves `null` on cancel). */
export function usePrompt(): PromptFn {
  const ctx = useContext(PromptContext);
  if (!ctx) throw new Error('usePrompt must be used inside <ConfirmProvider>.');
  return ctx;
}
