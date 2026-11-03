'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { NotificationChannel, NotificationType } from '@bladna/types';
import { Alert, Button, Card } from '@bladna/ui';
import { ApiClientError, api, errorMessageFor } from '@/ui/api/client';
import { getDictionary, type LocaleCode } from '@/ui/i18n';

export interface PreferenceRow {
  type: NotificationType;
  channel: NotificationChannel;
  enabled: boolean;
}

/** Fixed column order — matches the `notificationChannels` dictionary order. */
const CHANNELS: readonly NotificationChannel[] = ['IN_APP', 'EMAIL', 'PUSH', 'SMS'];

const emailKey = (type: string): string => `${type}:EMAIL`;

function buildBaseline(rows: readonly PreferenceRow[]): Map<string, boolean> {
  return new Map(rows.map((row) => [`${row.type}:${row.channel}`, row.enabled]));
}

function buildValues(rows: readonly PreferenceRow[]): Record<string, boolean> {
  // Absent row = enabled (the server treats a missing EMAIL pref as "send").
  const values: Record<string, boolean> = {};
  for (const row of rows) {
    if (row.channel === 'EMAIL') values[row.type] = row.enabled;
  }
  return values;
}

interface PreferenceChange {
  type: string;
  channel: 'EMAIL';
  enabled: boolean;
}

/**
 * Notification preference matrix: one row per event, one column per channel.
 * Only EMAIL is interactive — in-app always lands in the inbox, push and SMS
 * are not wired up in this build, and the UI says so instead of pretending to
 * save them. Saving PATCHes only rows the user actually changed.
 */
export function NotificationMatrix({
  locale,
  initial,
}: {
  locale: LocaleCode;
  initial: readonly PreferenceRow[];
}) {
  const router = useRouter();
  const { dict } = getDictionary(locale);
  const baselineRef = useRef<Map<string, boolean>>(buildBaseline(initial));
  const [values, setValues] = useState<Record<string, boolean>>(buildValues(initial));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const types = Object.keys(dict.settings.notificationTypes) as NotificationType[];
  const channelLabels = dict.settings.notificationChannels;

  function changedRows(): PreferenceChange[] {
    const changes: PreferenceChange[] = [];
    for (const type of types) {
      const enabled = values[type] ?? true;
      if (enabled !== (baselineRef.current.get(emailKey(type)) ?? true)) {
        changes.push({ type, channel: 'EMAIL', enabled });
      }
    }
    return changes.slice(0, 200);
  }

  const changes = changedRows();
  const dirty = changes.length > 0;

  async function save(): Promise<void> {
    if (!dirty) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await api.patch('/me/notification-preferences', { preferences: changes });
      for (const change of changes) baselineRef.current.set(emailKey(change.type), change.enabled);
      setSaved(true);
    } catch (cause) {
      if (cause instanceof ApiClientError && cause.code === 'UNAUTHORIZED') {
        router.push(`/${locale}/login?next=${encodeURIComponent(`/${locale}/settings`)}`);
        return;
      }
      if (cause instanceof ApiClientError && cause.code === 'MFA_REQUIRED') {
        router.push(`/${locale}/mfa?next=${encodeURIComponent(`/${locale}/settings`)}`);
        return;
      }
      setError(
        errorMessageFor(cause, { errors: dict.errors, genericFallback: dict.errors.generic }),
      );
    } finally {
      setBusy(false);
    }
  }

  const th = 'px-3 py-2 text-xs font-medium uppercase text-sand-500';
  const td = 'px-3 py-2';

  return (
    <Card className="space-y-4 p-6">
      <div>
        <h2 className="text-lg font-semibold text-sand-900">{dict.settings.notificationsTitle}</h2>
        <p className="mt-1 text-sm text-sand-600">{dict.settings.notificationsHint}</p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-sand-200">
        <table className="w-full text-sm">
          <thead className="bg-sand-50">
            <tr>
              <th className={`${th} text-start`} scope="col">
                <span className="sr-only">{dict.settings.notificationsTitle}</span>
              </th>
              {CHANNELS.map((channel) => (
                <th key={channel} className={`${th} text-center`} scope="col">
                  {channelLabels[channel]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {types.map((type) => (
              <tr key={type} className="border-t border-sand-100">
                <th scope="row" className={`${td} text-start font-normal text-sand-700`}>
                  {dict.settings.notificationTypes[type]}
                </th>
                <td className={`${td} text-center`}>
                  <span aria-hidden="true" className="text-sand-400">
                    ✓
                  </span>
                  <span className="sr-only">{dict.settings.notificationsAlways}</span>
                </td>
                <td className={`${td} text-center`}>
                  <input
                    type="checkbox"
                    aria-label={`${dict.settings.notificationTypes[type]} — ${channelLabels.EMAIL}`}
                    className="size-4 accent-brand-700"
                    checked={values[type] ?? true}
                    onChange={(event) => {
                      setSaved(false);
                      setValues((previous) => ({ ...previous, [type]: event.target.checked }));
                    }}
                  />
                </td>
                <td className={`${td} text-center`}>
                  <span aria-hidden="true" className="text-sand-300">
                    —
                  </span>
                  <span className="sr-only">{dict.settings.notificationsUnavailable}</span>
                </td>
                <td className={`${td} text-center`}>
                  <span aria-hidden="true" className="text-sand-300">
                    —
                  </span>
                  <span className="sr-only">{dict.settings.notificationsUnavailable}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error ? <Alert>{error}</Alert> : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" loading={busy} disabled={!dirty} onClick={() => void save()}>
          {dict.common.save}
        </Button>
        {saved ? (
          <span role="status" className="text-sm text-brand-700">
            {dict.settings.notificationsSaved}
          </span>
        ) : null}
      </div>
    </Card>
  );
}
