'use client';

import { useState } from 'react';
import { Input, type InputProps } from '@bladna/ui';
import { getDictionary, type LocaleCode } from '@/ui/i18n';
import { EyeIcon } from '@/ui/components/icons';

/**
 * Kit Input plus a reveal toggle (P12): the button sits in the input's own
 * trailing slot, so the label/hint/error wiring stays the kit's — the toggle
 * only flips `type` between password and text.
 */
export function PasswordInput({
  locale,
  ...props
}: Omit<InputProps, 'type' | 'trailing'> & { locale: LocaleCode }) {
  const { dict } = getDictionary(locale);
  const [shown, setShown] = useState(false);

  return (
    <Input
      {...props}
      type={shown ? 'text' : 'password'}
      trailing={
        <button
          type="button"
          onClick={() => setShown((value) => !value)}
          aria-pressed={shown}
          aria-label={shown ? dict.auth.hidePassword : dict.auth.showPassword}
          className="grid size-10 place-items-center rounded-md text-sand-400 transition hover:text-sand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
        >
          <EyeIcon className="size-4" aria-hidden />
        </button>
      }
    />
  );
}
