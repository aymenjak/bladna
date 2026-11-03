'use client';

import { useRouter } from 'next/navigation';
import { useState, type ChangeEvent, type FormEvent } from 'react';
import {
  REPORT_REASONS,
  REPORT_TARGET_TYPES,
  parseReportTargetRef,
  type ReportReason,
  type ReportTargetType,
} from '@bladna/types';
import { Alert, Button, Card, CardTitle, Input, Select, Textarea } from '@bladna/ui';
import { api, errorMessageFor, fieldErrors as extractFieldErrors } from '@/ui/api/client';
import { useFocusFirstError } from '@/ui/use-focus-first-error';
import { getDictionary, type LocaleCode } from '@/ui/i18n';

/**
 * Report a problem → `POST /reports`. P20: nobody hunts for a raw uuid — the
 * target accepts a page link pasted from the address bar (its type is picked
 * from the path, the server resolves id or slug), a `/safety?target=…` deep
 * link prefills the field, and the server answers every failure with its own
 * field/biz error below.
 */
export function ReportForm({
  locale,
  initialTarget = '',
}: {
  locale: LocaleCode;
  initialTarget?: string;
}) {
  const { dict } = getDictionary(locale);
  const router = useRouter();
  // The deep link arrives with its type already implied by the path.
  const [targetType, setTargetType] = useState<ReportTargetType | ''>(() => {
    const parsed = parseReportTargetRef(initialTarget);
    return parsed.targetType ?? '';
  });
  const [targetId, setTargetId] = useState(initialTarget);
  const [reason, setReason] = useState<ReportReason | ''>('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // DESIGN §8: failed submit focuses the first invalid control (RESEARCH M4).
  useFocusFirstError(fieldErrors);

  function onTargetChange(event: ChangeEvent<HTMLInputElement>): void {
    const value = event.target.value;
    setTargetId(value);
    // A pasted page link carries its target type — fill the select in
    // (still overridable by hand afterwards).
    const parsed = parseReportTargetRef(value);
    if (parsed.targetType) setTargetType(parsed.targetType);
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setSent(false);
    if (!targetType || !reason || !targetId.trim()) {
      setFieldErrors({
        ...(targetId.trim() ? {} : { targetId: dict.common.required }),
        ...(!targetType ? { targetType: dict.common.required } : {}),
        ...(!reason ? { reason: dict.common.required } : {}),
      });
      return;
    }
    setBusy(true);
    try {
      await api.post('/reports', {
        targetType,
        targetId: targetId.trim(),
        reason,
        ...(description.trim() ? { description: description.trim() } : {}),
      });
      setSent(true);
      setTargetId('');
      setDescription('');
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
      <CardTitle>{dict.safety.reportTitle}</CardTitle>
      <p className="mt-1 text-sm text-sand-500">{dict.safety.reportHint}</p>

      <form onSubmit={submit} className="mt-4 space-y-4" noValidate>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {sent ? <Alert tone="success">{dict.safety.sent}</Alert> : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label={dict.safety.targetType}
            required
            value={targetType}
            onChange={(event) => setTargetType(event.target.value as ReportTargetType | '')}
            error={fieldErrors.targetType}
          >
            <option value="" disabled>
              —
            </option>
            {/* INTERNATIONAL_OPPORTUNITY stays out of the menu: the moderation
                pipeline has no effect branch for it yet (the server rejects
                an API attempt honestly). */}
            {REPORT_TARGET_TYPES.filter((type) => type !== 'INTERNATIONAL_OPPORTUNITY').map(
              (type) => (
                <option key={type} value={type}>
                  {dict.safety.targetTypes[type]}
                </option>
              ),
            )}
          </Select>
          <Select
            label={dict.safety.reason}
            required
            value={reason}
            onChange={(event) => setReason(event.target.value as ReportReason | '')}
            error={fieldErrors.reason}
          >
            <option value="" disabled>
              —
            </option>
            {REPORT_REASONS.map((reportReason) => (
              <option key={reportReason} value={reportReason}>
                {dict.safety.reasons[reportReason]}
              </option>
            ))}
          </Select>
        </div>

        <Input
          label={dict.safety.targetId}
          required
          value={targetId}
          onChange={onTargetChange}
          error={fieldErrors.targetId}
          hint={
            targetType === 'CERTIFICATE'
              ? dict.safety.targetIdHintCertificate
              : dict.safety.targetIdHint
          }
        />

        <Textarea
          label={`${dict.safety.description} (${dict.common.optional})`}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          error={fieldErrors.description}
          hint={dict.safety.descriptionHint}
          maxLength={4000}
        />

        <Button type="submit" loading={busy}>
          {dict.safety.submit}
        </Button>
      </form>
    </Card>
  );
}
