'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import QRCode from 'qrcode';
import { Alert, Badge, Button, Card, CardTitle, Input } from '@bladna/ui';
import { api, errorMessageFor, fieldErrors as extractFieldErrors } from '@/ui/api/client';
import { useFocusFirstError } from '@/ui/use-focus-first-error';
import { getDictionary, type LocaleCode } from '@/ui/i18n';

/**
 * TOTP enrollment and removal → `POST /auth/two-factor/{setup,enable,disable}`
 * + `GET /auth/two-factor/status` (status arrives as a prop from the page).
 *
 * The provisioning URI is returned exactly once per setup (server contract),
 * so the QR is rendered in this session and the URI is also offered as text
 * for manual entry. Recovery codes come back from the enable call and are
 * stored only as hashes — they are shown exactly once, here.
 */
export function TwoFactorPanel({
  locale,
  initialEnabled,
}: {
  locale: LocaleCode;
  initialEnabled: boolean;
}) {
  const { dict } = getDictionary(locale);
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [otpauthUri, setOtpauthUri] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // DESIGN §8: failed submit focuses the first invalid control (RESEARCH M4).
  useFocusFirstError(fieldErrors);
  const [notice, setNotice] = useState<string | null>(null);

  // Render the QR whenever a fresh provisioning URI arrives. The text fallback
  // below stays usable if canvas rendering is unavailable.
  useEffect(() => {
    if (!otpauthUri) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(otpauthUri, { margin: 1, width: 192 })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [otpauthUri]);

  function resetFeedback(): void {
    setError(null);
    setFieldErrors({});
    setNotice(null);
  }

  async function beginSetup(): Promise<void> {
    resetFeedback();
    setBusy(true);
    try {
      const result = await api.post<{ otpauthUri: string }>('/auth/two-factor/setup', {});
      setOtpauthUri(result.data.otpauthUri);
    } catch (cause) {
      setError(
        errorMessageFor(cause, { errors: dict.errors, genericFallback: dict.errors.generic }),
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirm(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!code.trim()) return;
    resetFeedback();
    setBusy(true);
    try {
      const result = await api.post<{ enabled: boolean; recoveryCodes: string[] }>(
        '/auth/two-factor/enable',
        { code: code.trim() },
      );
      setEnabled(result.data.enabled);
      setRecoveryCodes(result.data.recoveryCodes);
      setOtpauthUri(null);
      setCode('');
      setNotice(dict.settings.twoFactorEnabled);
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

  async function disable(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!code.trim()) return;
    resetFeedback();
    setBusy(true);
    try {
      await api.post('/auth/two-factor/disable', { code: code.trim() });
      setEnabled(false);
      setCode('');
      setNotice(dict.settings.twoFactorDisabled);
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

  function dismissRecovery(): void {
    setRecoveryCodes(null);
    setNotice(null);
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>{dict.settings.twoFactorTitle}</CardTitle>
        <Badge tone={enabled ? 'success' : 'neutral'}>
          {enabled ? dict.settings.twoFactorOn : dict.settings.twoFactorOff}
        </Badge>
      </div>
      <p className="mt-1 text-sm text-sand-500">{dict.settings.twoFactorHint}</p>

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

      {recoveryCodes ? (
        <div className="mt-4 space-y-3 rounded-lg border border-brand-200 bg-brand-50 p-4">
          <p className="text-sm font-semibold text-brand-900">
            {dict.settings.twoFactorRecoveryTitle}
          </p>
          <p className="text-xs text-brand-800">{dict.settings.twoFactorRecoveryHint}</p>
          <ul className="grid grid-cols-2 gap-1" data-testid="recovery-codes">
            {recoveryCodes.map((recoveryCode) => (
              <li key={recoveryCode} className="select-all font-mono text-sm text-sand-900">
                {recoveryCode}
              </li>
            ))}
          </ul>
          <Button size="sm" variant="outline" onClick={dismissRecovery}>
            {dict.common.close}
          </Button>
        </div>
      ) : null}

      {otpauthUri ? (
        <form onSubmit={confirm} className="mt-4 space-y-4">
          <p className="text-sm text-sand-700">{dict.settings.twoFactorSetupHint}</p>
          <div className="flex flex-wrap items-start gap-4">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={dict.settings.twoFactorTitle}
                width={192}
                height={192}
                className="rounded-lg border border-sand-200 bg-white"
              />
            ) : null}
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-sand-500">otpauth</p>
              <code className="block max-h-24 overflow-y-auto break-all rounded-lg bg-sand-50 p-2 text-xs text-sand-700">
                {otpauthUri}
              </code>
            </div>
          </div>
          <Input
            label={dict.auth.totpCode}
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            required
            value={code}
            onChange={(event) => setCode(event.target.value)}
            error={fieldErrors.code}
          />
          <div className="flex gap-2">
            <Button type="submit" loading={busy} disabled={!code.trim()}>
              {dict.settings.twoFactorConfirm}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setOtpauthUri(null);
                setCode('');
                resetFeedback();
              }}
            >
              {dict.common.cancel}
            </Button>
          </div>
        </form>
      ) : null}

      {!enabled && !otpauthUri && !recoveryCodes ? (
        <div className="mt-4">
          <Button loading={busy} onClick={() => void beginSetup()}>
            {dict.settings.twoFactorEnable}
          </Button>
        </div>
      ) : null}

      {enabled && !recoveryCodes ? (
        <form onSubmit={disable} className="mt-4 space-y-4">
          <Input
            label={dict.auth.totpCode}
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            hint={dict.auth.recoveryHint}
            required
            value={code}
            onChange={(event) => setCode(event.target.value)}
            error={fieldErrors.code}
          />
          <Button type="submit" variant="danger" loading={busy} disabled={!code.trim()}>
            {dict.settings.twoFactorDisable}
          </Button>
        </form>
      ) : null}
    </Card>
  );
}
