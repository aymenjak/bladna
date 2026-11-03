'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@bladna/ui';
import { toast } from 'sonner';
import type { DemoAccessData } from '@/server/lib/demo-access';
import { getDictionary, type LocaleCode } from '@/ui/i18n';

/**
 * Demo-access panel under the login form (rendered only when `DEMO_MODE=true`
 * — see server/lib/demo-access.ts). Lists the seeded demo accounts with the
 * shared password and each account's *live* TOTP code, so a visitor can sign
 * in without a terminal. "Use" fills the email field; codes are refreshed
 * server-side every 30 s via `router.refresh()`.
 */
export function DemoAccessCard({
  locale,
  data,
  onPickEmail,
}: {
  locale: LocaleCode;
  data: DemoAccessData;
  /** Fills the login form's email field with a demo account. */
  onPickEmail: (email: string) => void;
}) {
  const { dict } = getDictionary(locale);
  const router = useRouter();

  // The codes are rendered server-side and rotate every 30 s — keep the tree
  // fresh so the displayed code never expires while it sits on screen.
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 30_000);
    return () => clearInterval(id);
  }, [router]);

  async function copyPassword(): Promise<void> {
    try {
      await navigator.clipboard.writeText(data.password);
      toast.success(dict.auth.demoCopied);
    } catch {
      // Clipboard unavailable (insecure context) — the password stays selectable.
    }
  }

  return (
    <section
      aria-label={dict.auth.demoTitle}
      className="mt-6 rounded-xl border border-dashed border-sand-300 bg-sand-50 p-4"
    >
      <p className="text-sm font-semibold text-sand-900">{dict.auth.demoTitle}</p>
      <p className="mt-1 text-sm text-sand-600">{dict.auth.demoBody}</p>

      <ul className="mt-3 space-y-2">
        {data.accounts.map((account) => (
          <li
            key={account.email}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sand-200 bg-white px-3 py-2"
          >
            <span className="break-all font-mono text-xs font-medium text-sand-900">
              {account.email}
            </span>
            <span className="flex items-center gap-2">
              {account.code ? (
                <span className="rounded-md bg-sand-100 px-2 py-1 font-mono text-sm font-bold tracking-[0.2em] text-sand-900">
                  {account.code}
                </span>
              ) : (
                <span className="text-xs text-sand-500">{dict.auth.demoNo2fa}</span>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-brand-200 text-brand-700 hover:bg-brand-50 focus-visible:outline-brand-700"
                onClick={() => onPickEmail(account.email)}
              >
                {dict.auth.demoUse}
              </Button>
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sand-200 bg-white px-3 py-2">
        <span className="text-sm text-sand-600">
          {dict.auth.demoPassword}:{' '}
          <span className="font-mono font-semibold text-sand-900">{data.password}</span>
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="border-brand-200 text-brand-700 hover:bg-brand-50 focus-visible:outline-brand-700"
          onClick={() => void copyPassword()}
        >
          {dict.auth.demoCopy}
        </Button>
      </div>

      <p className="mt-2 text-xs text-sand-500">{dict.auth.demoNote}</p>
    </section>
  );
}
