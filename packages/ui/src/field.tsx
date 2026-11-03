'use client';

import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
  type SelectHTMLAttributes,
} from 'react';
import { cn } from './cn';

const FIELD =
  'w-full rounded-lg border border-sand-200 bg-white px-3 py-2 text-sm text-sand-900 placeholder:text-sand-400 ' +
  'focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-sand-100';

export interface FieldProps {
  label?: string;
  error?: string | null;
  hint?: string;
  required?: boolean;
  /** Field id — generated from the label when omitted is the caller's job. */
  htmlFor?: string;
  /** Ids for the hint/error paragraphs so the control can reference them. */
  hintId?: string;
  errorId?: string;
}

function FieldShell({
  label,
  error,
  hint,
  required,
  htmlFor,
  hintId,
  errorId,
  children,
}: FieldProps & { children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      {label ? (
        <label htmlFor={htmlFor} className="block text-sm font-medium text-sand-700">
          {label}
          {required ? <span className="text-red-700"> *</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-sm text-sand-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement>, FieldProps {
  /**
   * Rendered inside the control's trailing edge (a reveal toggle, a unit).
   * The control gains end padding automatically so the slot never overlaps
   * the value.
   */
  trailing?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, required, htmlFor, className, id, trailing, ...rest },
  ref,
) {
  // Associate label + control automatically (WCAG 3.3.2 / 4.1.2) when the
  // caller doesn't pass an explicit id.
  const autoId = useId();
  const fieldId = id ?? htmlFor ?? autoId;
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;
  const input = (
    <input
      ref={ref}
      id={fieldId}
      required={required}
      aria-invalid={!!error || undefined}
      // WCAG 4.1.3: the visible error/hint is the control's description.
      aria-describedby={error ? errorId : hint ? hintId : undefined}
      className={cn(FIELD, 'h-10', trailing ? 'pe-10' : '', className)}
      {...rest}
    />
  );
  return (
    <FieldShell
      label={label}
      error={error}
      hint={hint}
      required={required}
      htmlFor={fieldId}
      errorId={errorId}
      hintId={hintId}
    >
      {trailing ? (
        <div className="relative">
          {input}
          <span className="absolute inset-y-0 end-1.5 flex items-center">{trailing}</span>
        </div>
      ) : (
        input
      )}
    </FieldShell>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement>, FieldProps {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, hint, required, htmlFor, className, id, ...rest },
  ref,
) {
  const autoId = useId();
  const fieldId = id ?? htmlFor ?? autoId;
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;
  return (
    <FieldShell
      label={label}
      error={error}
      hint={hint}
      required={required}
      htmlFor={fieldId}
      errorId={errorId}
      hintId={hintId}
    >
      <textarea
        ref={ref}
        id={fieldId}
        required={required}
        aria-invalid={!!error || undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className={cn(FIELD, 'min-h-24', className)}
        {...rest}
      />
    </FieldShell>
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement>, FieldProps {}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, hint, required, htmlFor, className, id, children, ...rest },
  ref,
) {
  const autoId = useId();
  const fieldId = id ?? htmlFor ?? autoId;
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;
  return (
    <FieldShell
      label={label}
      error={error}
      hint={hint}
      required={required}
      htmlFor={fieldId}
      errorId={errorId}
      hintId={hintId}
    >
      <select
        ref={ref}
        id={fieldId}
        required={required}
        aria-invalid={!!error || undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className={cn(FIELD, 'h-10', className)}
        {...rest}
      >
        {children}
      </select>
    </FieldShell>
  );
});
