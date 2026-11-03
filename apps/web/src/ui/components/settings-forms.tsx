'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Alert, Button, Card, CardTitle, Input } from '@bladna/ui';
import { api, errorMessageFor, fieldErrors as extractFieldErrors } from '@/ui/api/client';
import { useFocusFirstError } from '@/ui/use-focus-first-error';
import { getDictionary, LOCALES, type LocaleCode } from '@/ui/i18n';
import { formatDateTime } from '@/ui/format';
import type { MeUser } from '@/server/page-session';

/** Native display names — they are proper names, not UI copy to translate. */
const LANGUAGE_NAMES: Record<LocaleCode, string> = {
  ar: 'العربية',
  fr: 'Français',
  en: 'English',
};

interface SessionItem {
  id: string;
  current: boolean;
  ip: string | null;
  userAgent: string | null;
  lastUsedAt: string | Date;
  createdAt: string | Date;
  expiresAt: string | Date;
  mfaSatisfied: boolean;
}

interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface SessionsResult {
  items: SessionItem[];
  meta: PageMeta;
}

/**
 * Profile section → `PATCH /auth/me` (names, phone, preferred language).
 * The email is the sign-in identity and has no change flow yet, so it is
 * rendered read-only rather than pretending an edit works.
 */
export function ProfileForm({ locale, user }: { locale: LocaleCode; user: MeUser }) {
  const { dict } = getDictionary(locale);
  const router = useRouter();
  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName);
  const [phone, setPhone] = useState(user.phone ?? '');
  const [language, setLanguage] = useState<LocaleCode>(user.preferredLanguage);
  // P19: a shareable conversation link replaces UUID hunting — the absolute
  // URL is built after mount (no `window` during SSR), and the copy
  // confirmation resets itself.
  const [conversationLink, setConversationLink] = useState('');
  const [copied, setCopied] = useState(false);
  const linkRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    setConversationLink(`${window.location.origin}/${locale}/messages?to=${user.id}`);
  }, [locale, user.id]);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // DESIGN §8: failed submit focuses the first invalid control (RESEARCH M4).
  useFocusFirstError(fieldErrors);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setSaved(false);
    if (user.phone && !phone.trim()) {
      // The API cannot clear a phone number (no nullable field) — say so
      // instead of silently keeping the old value behind an empty box.
      setFieldErrors({ phone: dict.common.required });
      return;
    }
    setBusy(true);
    try {
      await api.patch('/auth/me', {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        preferredLanguage: language,
      });
      setSaved(true);
      router.refresh();
    } catch (cause) {
      setFieldErrors(extractFieldErrors(cause));
      setError(
        errorMessageFor(cause, { errors: dict.errors, genericFallback: dict.errors.generic }),
      );
    } finally {
      setBusy(false);
    }
  }

  async function copyConversationLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(conversationLink);
      setCopied(true);
      return;
    } catch {
      // Insecure context or denied permission: select the visible code so it
      // is one Ctrl+C away, and try the legacy path once.
      const node = linkRef.current;
      if (node) {
        const range = document.createRange();
        range.selectNodeContents(node);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        setCopied(document.execCommand('copy'));
      }
    }
  }

  return (
    <Card>
      <CardTitle>{dict.settings.accountTitle}</CardTitle>
      <p className="mt-1 text-sm text-sand-500">{dict.settings.accountHint}</p>

      <div className="mt-4 space-y-3 text-sm text-sand-700">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-sand-50 px-3 py-2">
          <span className="font-medium">{dict.auth.email}</span>
          <span className="truncate font-mono" title={user.email}>
            {user.email}
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-sand-50 px-3 py-2">
          <span className="font-medium">{dict.settings.conversationLink}</span>
          <div className="flex min-w-0 items-center gap-2">
            <code
              ref={linkRef}
              className="min-w-0 max-w-64 truncate select-all font-mono text-xs"
              title={conversationLink || undefined}
            >
              {conversationLink || `/${locale}/messages?to=${user.id}`}
            </code>
            <Button
              size="sm"
              variant="outline"
              disabled={!conversationLink}
              onClick={() => void copyConversationLink()}
            >
              {copied ? dict.settings.linkCopied : dict.settings.copyLink}
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-sand-50 px-3 py-2">
          <span className="font-medium">{dict.settings.yourUserId}</span>
          <code className="select-all font-mono text-xs" title={dict.settings.yourUserIdHint}>
            {user.id}
          </code>
        </div>
        <p className="text-xs text-sand-500">{dict.settings.yourUserIdHint}</p>
      </div>

      <form onSubmit={submit} className="mt-4 space-y-4" noValidate>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {saved ? <Alert tone="success">{dict.settings.savedOk}</Alert> : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label={dict.auth.firstName}
            name="firstName"
            required
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            error={fieldErrors.firstName}
          />
          <Input
            label={dict.auth.lastName}
            name="lastName"
            required
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            error={fieldErrors.lastName}
          />
          <Input
            label={dict.auth.phone}
            name="phone"
            type="tel"
            autoComplete="tel"
            required={!!user.phone}
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            error={fieldErrors.phone}
          />
          <label className="block space-y-1.5">
            <span className="block text-sm font-medium text-sand-700">
              {dict.nav.language} — {LANGUAGE_NAMES[language]}
            </span>
            <select
              name="preferredLanguage"
              value={language}
              onChange={(event) => setLanguage(event.target.value as LocaleCode)}
              className="w-full h-10 rounded-lg border border-sand-200 bg-white px-3 py-2 text-sm text-sand-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            >
              {LOCALES.map((code) => (
                <option key={code} value={code}>
                  {LANGUAGE_NAMES[code]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <Button type="submit" loading={busy}>
          {dict.common.save}
        </Button>
      </form>
    </Card>
  );
}

/** Password section → `POST /auth/change-password` (server owns the policy). */
export function ChangePasswordForm({ locale }: { locale: LocaleCode }) {
  const { dict } = getDictionary(locale);
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [logoutEverywhere, setLogoutEverywhere] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // DESIGN §8: failed submit focuses the first invalid control (RESEARCH M4).
  useFocusFirstError(fieldErrors);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setDone(false);
    if (newPassword !== confirm) {
      setFieldErrors({ confirm: dict.auth.passwordMismatch });
      return;
    }
    setBusy(true);
    try {
      await api.post('/auth/change-password', {
        currentPassword,
        newPassword,
        logoutEverywhere,
      });
      setDone(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirm('');
      router.refresh();
    } catch (cause) {
      setFieldErrors(extractFieldErrors(cause));
      setError(
        errorMessageFor(cause, { errors: dict.errors, genericFallback: dict.errors.generic }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardTitle>{dict.settings.passwordTitle}</CardTitle>
      <form onSubmit={submit} className="mt-4 space-y-4" noValidate>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {done ? <Alert tone="success">{dict.settings.passwordChanged}</Alert> : null}

        <Input
          label={dict.auth.currentPassword}
          type="password"
          name="currentPassword"
          autoComplete="current-password"
          required
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          error={fieldErrors.currentPassword}
        />
        <Input
          label={dict.auth.newPassword}
          type="password"
          name="newPassword"
          autoComplete="new-password"
          hint={dict.auth.passwordHint}
          required
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          error={fieldErrors.newPassword}
        />
        <Input
          label={dict.auth.confirmPassword}
          type="password"
          name="confirmPassword"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          error={fieldErrors.confirm}
        />
        <label className="flex items-start gap-2 text-sm text-sand-700">
          <input
            type="checkbox"
            checked={logoutEverywhere}
            onChange={(event) => setLogoutEverywhere(event.target.checked)}
            className="mt-0.5 size-4 rounded border-sand-300"
          />
          {dict.auth.logoutEverywhere}
        </label>

        <Button type="submit" loading={busy}>
          {dict.auth.savePassword}
        </Button>
      </form>
    </Card>
  );
}

/**
 * Active sessions → `GET /auth/sessions` (page state) + `DELETE
 * /auth/sessions/:id` + `POST /auth/logout-all`. Revoking the current session
 * clears the cookies server-side, so we land back on login.
 */
export function SessionsPanel({
  locale,
  initialItems,
  initialMeta,
}: {
  locale: LocaleCode;
  initialItems: SessionItem[];
  initialMeta: PageMeta;
}) {
  const { dict } = getDictionary(locale);
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [meta, setMeta] = useState(initialMeta);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load(page: number): Promise<void> {
    setBusy('list');
    setError(null);
    try {
      const result = await api.get<SessionsResult>(`/auth/sessions?page=${page}&limit=10`);
      setItems(result.data.items);
      setMeta(result.data.meta);
    } catch (cause) {
      setError(
        errorMessageFor(cause, { errors: dict.errors, genericFallback: dict.errors.generic }),
      );
    } finally {
      setBusy(null);
    }
  }

  async function revoke(id: string): Promise<void> {
    setBusy(id);
    setError(null);
    setNotice(null);
    try {
      const result = await api.delete<{ revokedCurrent?: boolean }>(`/auth/sessions/${id}`);
      if (result.data.revokedCurrent) {
        router.push(`/${locale}/login`);
        router.refresh();
        return;
      }
      setNotice(dict.settings.sessionRevoked);
      await load(meta.page);
    } catch (cause) {
      setError(
        errorMessageFor(cause, { errors: dict.errors, genericFallback: dict.errors.generic }),
      );
    } finally {
      setBusy(null);
    }
  }

  async function logoutEverywhere(): Promise<void> {
    setBusy('all');
    setError(null);
    try {
      await api.post('/auth/logout-all', {});
      router.push(`/${locale}/login`);
      router.refresh();
    } catch (cause) {
      setError(
        errorMessageFor(cause, { errors: dict.errors, genericFallback: dict.errors.generic }),
      );
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardTitle>{dict.settings.sessionsTitle}</CardTitle>
      <p className="mt-1 text-sm text-sand-500">{dict.settings.sessionsHint}</p>

      {error ? (
        <Alert tone="danger" className="mt-3">
          {error}
        </Alert>
      ) : null}
      {notice ? (
        <Alert tone="success" className="mt-3">
          {notice}
        </Alert>
      ) : null}

      <ul className="mt-4 divide-y divide-sand-100 rounded-lg border border-sand-200">
        {items.length === 0 ? (
          <li className="px-4 py-6 text-center text-sm text-sand-500">{dict.common.empty}</li>
        ) : null}
        {items.map((session) => (
          <li key={session.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="truncate text-sand-800" title={session.userAgent ?? undefined}>
                {session.userAgent ?? '—'}
              </p>
              <p className="text-xs text-sand-500">
                {session.ip ?? '—'} · {formatDateTime(session.lastUsedAt, locale)}
              </p>
            </div>
            {session.current ? (
              <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-medium text-brand-800">
                {dict.settings.sessionCurrent}
              </span>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              loading={busy === session.id}
              onClick={() => void revoke(session.id)}
            >
              {dict.settings.sessionRevoke}
            </Button>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={meta.page <= 1 || busy === 'list'}
            onClick={() => void load(meta.page - 1)}
          >
            {dict.common.previous}
          </Button>
          <span className="text-sm text-sand-600">
            {dict.common.page} {meta.page} {dict.common.of} {meta.totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={meta.page >= meta.totalPages || busy === 'list'}
            onClick={() => void load(meta.page + 1)}
          >
            {dict.common.next}
          </Button>
        </div>
        <Button
          size="sm"
          variant="danger"
          loading={busy === 'all'}
          onClick={() => void logoutEverywhere()}
        >
          {dict.auth.logoutEverywhere}
        </Button>
      </div>
    </Card>
  );
}

interface PrivacyValues {
  publicProfile: boolean;
  publicPhone: boolean;
  publicEmail: boolean;
  showWilaya: boolean;
  showHours: boolean;
  showCertificates: boolean;
}

/**
 * Privacy section → `PATCH /me/privacy` with every storable key. Since P25
 * `showCertificates` has its controlled thing too: the public volunteer
 * profile withholds its certificate list when the flag is off (the list rows
 * themselves always link to credential-keyed verification, which never
 * depends on a privacy flag).
 */
export function PrivacyToggles({
  locale,
  initial,
}: {
  locale: LocaleCode;
  initial: PrivacyValues;
}) {
  const { dict } = getDictionary(locale);
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await api.patch('/me/privacy', values);
      setSaved(true);
      router.refresh();
    } catch (cause) {
      setError(
        errorMessageFor(cause, { errors: dict.errors, genericFallback: dict.errors.generic }),
      );
    } finally {
      setBusy(false);
    }
  }

  const toggles: Array<{ key: keyof PrivacyValues; label: string }> = [
    { key: 'publicProfile', label: dict.settings.publicProfile },
    { key: 'publicPhone', label: dict.settings.publicPhone },
    { key: 'publicEmail', label: dict.settings.publicEmail },
    { key: 'showWilaya', label: dict.settings.showWilaya },
    { key: 'showHours', label: dict.settings.showHours },
    // P25: the profile page lists certificates — this now controls that list.
    { key: 'showCertificates', label: dict.settings.showCertificates },
  ];

  return (
    <Card>
      <CardTitle>{dict.settings.privacyTitle}</CardTitle>
      <p className="mt-1 text-sm text-sand-500">{dict.settings.privacyHint}</p>
      <form onSubmit={save} className="mt-4 space-y-3">
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {saved ? <Alert tone="success">{dict.settings.savedOk}</Alert> : null}
        {toggles.map((toggle) => (
          <label key={toggle.key} className="flex items-start gap-2 text-sm text-sand-700">
            <input
              type="checkbox"
              checked={values[toggle.key]}
              onChange={(event) =>
                setValues((previous) => ({ ...previous, [toggle.key]: event.target.checked }))
              }
              className="mt-0.5 size-4 rounded border-sand-300"
            />
            {toggle.label}
          </label>
        ))}
        <Button type="submit" loading={busy}>
          {dict.common.save}
        </Button>
      </form>
    </Card>
  );
}
