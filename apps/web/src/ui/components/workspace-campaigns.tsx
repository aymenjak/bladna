'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert, Button, Input, Textarea } from '@bladna/ui';
import type { CampaignStatus } from '@bladna/types';
import { api, errorMessageFor, fieldErrors as extractFieldErrors } from '@/ui/api/client';
import { useFocusFirstError } from '@/ui/use-focus-first-error';
import { formatDate } from '@/ui/format';
import { StatusBadge } from '@/ui/status';
import { getDictionary, type LocaleCode } from '@/ui/i18n';

/**
 * Client mutations for the workspace campaigns tab: create, edit and status
 * transitions. The transition actions are exactly the
 * `campaignStatusActionSchema` enum (ACTIVATE / PAUSE / COMPLETE / CANCEL —
 * there is no domain-level campaign map and no org-facing ARCHIVE action); the
 * server owns the state machine and its rejections surface their message.
 */

/** Row data handed over by the server page (list select fields the forms need). */
export interface CampaignRowData {
  id: string;
  name: string;
  description: string | null;
  goal: string | null;
  startDate: string;
  endDate: string;
  status: CampaignStatus;
  volunteerTarget: number | null;
  hourTarget: number | null;
  beneficiaryTarget: number | null;
  budget: number | null;
  currency: string;
}

/** Same order as `campaignStatusActionSchema.action`. */
const TRANSITION_ACTIONS = ['ACTIVATE', 'PAUSE', 'COMPLETE', 'CANCEL'] as const;
type TransitionAction = (typeof TRANSITION_ACTIONS)[number];

interface CampaignFormValues {
  name: string;
  description: string;
  goal: string;
  startDate: string;
  endDate: string;
  volunteerTarget: string;
  hourTarget: string;
  beneficiaryTarget: string;
  budget: string;
  currency: string;
}

const EMPTY_VALUES: CampaignFormValues = {
  name: '',
  description: '',
  goal: '',
  startDate: '',
  endDate: '',
  volunteerTarget: '',
  hourTarget: '',
  beneficiaryTarget: '',
  budget: '',
  currency: 'DZD',
};

function dateInput(value: string): string {
  return value ? value.slice(0, 10) : '';
}

function numberInput(value: number | null): string {
  return value === null ? '' : String(value);
}

function numberOrNull(value: string): number | null {
  return value.trim() === '' ? null : Number(value);
}

function rowToValues(row: CampaignRowData): CampaignFormValues {
  return {
    name: row.name,
    description: row.description ?? '',
    goal: row.goal ?? '',
    startDate: dateInput(row.startDate),
    endDate: dateInput(row.endDate),
    volunteerTarget: numberInput(row.volunteerTarget),
    hourTarget: numberInput(row.hourTarget),
    beneficiaryTarget: numberInput(row.beneficiaryTarget),
    budget: numberInput(row.budget),
    currency: row.currency,
  };
}

/** Form values → exact `createCampaignSchema` / `updateCampaignSchema` payload. */
function toBody(values: CampaignFormValues) {
  const currency = values.currency.trim().toUpperCase();
  return {
    name: values.name.trim(),
    description: values.description.trim(),
    goal: values.goal.trim(),
    startDate: values.startDate,
    endDate: values.endDate,
    volunteerTarget: numberOrNull(values.volunteerTarget),
    hourTarget: numberOrNull(values.hourTarget),
    beneficiaryTarget: numberOrNull(values.beneficiaryTarget),
    budget: numberOrNull(values.budget),
    // An empty box falls back to the schema default instead of failing length(3).
    ...(currency ? { currency } : {}),
  };
}

function CampaignForm({
  locale,
  orgId,
  mode,
  itemId,
  initial,
  onSaved,
  onCancel,
}: {
  locale: LocaleCode;
  orgId: string;
  mode: 'create' | 'edit';
  itemId: string | null;
  initial?: CampaignFormValues;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { dict } = getDictionary(locale);
  const labels = dict.workspace.campaigns;
  const [values, setValues] = useState<CampaignFormValues>(initial ?? EMPTY_VALUES);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  useFocusFirstError(fieldErrors);

  function update<K extends keyof CampaignFormValues>(key: K, value: CampaignFormValues[K]): void {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    const missing: Record<string, string> = {};
    if (!values.name.trim()) missing.name = dict.common.required;
    if (!values.startDate) missing.startDate = dict.common.required;
    if (!values.endDate) missing.endDate = dict.common.required;
    if (Object.keys(missing).length > 0) {
      setFieldErrors(missing);
      return;
    }
    if (mode === 'edit' && !itemId) {
      setError(dict.errors.generic);
      return;
    }
    setBusy(true);
    try {
      const body = toBody(values);
      if (mode === 'create') {
        await api.post(`/orgs/${orgId}/campaigns`, body);
      } else if (itemId) {
        await api.patch(`/orgs/${orgId}/campaigns/${encodeURIComponent(itemId)}`, body);
      } else {
        setError(dict.errors.generic);
        return;
      }
      onSaved();
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
    <form
      onSubmit={submit}
      noValidate
      className="space-y-4 rounded-xl border border-sand-200 bg-white p-6"
    >
      <h3 className="text-base font-semibold text-sand-900">
        {mode === 'create' ? labels.createTitle : labels.editTitle}
      </h3>
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Input
        label={labels.nameLabel}
        required
        value={values.name}
        onChange={(event) => update('name', event.target.value)}
        error={fieldErrors.name}
      />
      <Textarea
        label={labels.descriptionLabel}
        value={values.description}
        onChange={(event) => update('description', event.target.value)}
        error={fieldErrors.description}
      />
      <Textarea
        label={labels.goalLabel}
        value={values.goal}
        onChange={(event) => update('goal', event.target.value)}
        error={fieldErrors.goal}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label={labels.startLabel}
          type="date"
          required
          value={values.startDate}
          onChange={(event) => update('startDate', event.target.value)}
          error={fieldErrors.startDate}
        />
        <Input
          label={labels.endLabel}
          type="date"
          required
          value={values.endDate}
          onChange={(event) => update('endDate', event.target.value)}
          error={fieldErrors.endDate}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Input
          label={labels.volunteerTargetLabel}
          type="number"
          min={0}
          value={values.volunteerTarget}
          onChange={(event) => update('volunteerTarget', event.target.value)}
          error={fieldErrors.volunteerTarget}
        />
        <Input
          label={labels.hourTargetLabel}
          type="number"
          min={0}
          step="0.5"
          value={values.hourTarget}
          onChange={(event) => update('hourTarget', event.target.value)}
          error={fieldErrors.hourTarget}
        />
        <Input
          label={labels.beneficiaryTargetLabel}
          type="number"
          min={0}
          value={values.beneficiaryTarget}
          onChange={(event) => update('beneficiaryTarget', event.target.value)}
          error={fieldErrors.beneficiaryTarget}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label={labels.budgetLabel}
          type="number"
          min={0}
          value={values.budget}
          onChange={(event) => update('budget', event.target.value)}
          error={fieldErrors.budget}
        />
        <Input
          label={labels.currencyLabel}
          value={values.currency}
          maxLength={3}
          onChange={(event) => update('currency', event.target.value)}
          error={fieldErrors.currency}
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={busy}>
          {mode === 'create' ? labels.create : dict.common.save}
        </Button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-sand-200 bg-white inline-flex min-h-11 items-center px-4 text-sm font-semibold text-sand-700 hover:bg-sand-100"
        >
          {dict.common.cancel}
        </button>
      </div>
    </form>
  );
}

/** “New campaign” toggle + create form, rendered above the list. */
export function CampaignCreateControl({ locale, orgId }: { locale: LocaleCode; orgId: string }) {
  const { dict } = getDictionary(locale);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {notice ? <p className="text-sm font-medium text-brand-700">{notice}</p> : null}
      {open ? (
        <CampaignForm
          locale={locale}
          orgId={orgId}
          mode="create"
          itemId={null}
          onSaved={() => {
            setOpen(false);
            setNotice(dict.workspace.campaigns.created);
            router.refresh();
          }}
          onCancel={() => setOpen(false)}
        />
      ) : (
        <Button
          type="button"
          onClick={() => {
            setNotice(null);
            setOpen(true);
          }}
        >
          {dict.workspace.campaigns.create}
        </Button>
      )}
    </div>
  );
}

/** Per-row controls: inline edit (pre-filled from the list row) + transitions. */
export function CampaignRowActions({
  locale,
  orgId,
  row,
}: {
  locale: LocaleCode;
  orgId: string;
  row: CampaignRowData;
}) {
  const { dict } = getDictionary(locale);
  const router = useRouter();
  const labels = dict.workspace.campaigns;
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);

  function fail(cause: unknown): void {
    setError(errorMessageFor(cause, { errors: dict.errors, genericFallback: dict.errors.generic }));
  }

  async function runTransition(action: TransitionAction): Promise<void> {
    if (action === 'CANCEL' && !reason.trim()) {
      setReasonError(dict.admin.reasonRequired);
      return;
    }
    setError(null);
    setReasonError(null);
    setBusy(true);
    try {
      await api.post(`/orgs/${orgId}/campaigns/${encodeURIComponent(row.id)}/transition`, {
        action,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      setReason('');
      setNotice(labels.updated);
      router.refresh();
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="mt-3">
        <CampaignForm
          locale={locale}
          orgId={orgId}
          mode="edit"
          itemId={row.id}
          initial={rowToValues(row)}
          onSaved={() => {
            setEditing(false);
            setNotice(labels.updated);
            router.refresh();
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      {notice ? <p className="text-sm font-medium text-brand-700">{notice}</p> : null}
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setEditing(true)}
          disabled={busy}
          className="hover:border-brand-300 hover:text-brand-700"
        >
          {dict.admin.actions.edit}
        </Button>
        {TRANSITION_ACTIONS.map((action) => (
          <Button
            key={action}
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void runTransition(action)}
            disabled={busy}
            className="hover:border-brand-300 hover:text-brand-700"
          >
            {labels.actions[action]}
          </Button>
        ))}
      </div>
      <div className="max-w-sm">
        <Input
          label={labels.reasonLabel}
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
            setReasonError(null);
          }}
          error={reasonError}
        />
      </div>
      <p className="text-xs text-sand-500">{labels.transitionHint}</p>
    </div>
  );
}

/** Participant roster — `GET /orgs/:orgId/campaigns/:id/participants`, fetched on toggle. */
interface ParticipantResult {
  items: Array<{
    id: string;
    status: string;
    hours: number | string;
    participationDate: string | null;
    volunteerProfile: {
      user: { firstName: string; lastName: string } | null;
    } | null;
  }>;
}

export function CampaignParticipants({
  locale,
  orgId,
  campaignId,
}: {
  locale: LocaleCode;
  orgId: string;
  campaignId: string;
}) {
  const { dict } = getDictionary(locale);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<ParticipantResult['items']>([]);
  const [error, setError] = useState<string | null>(null);

  async function toggle(): Promise<void> {
    if (open) {
      setOpen(false);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const result = await api.get<ParticipantResult>(
        `/orgs/${orgId}/campaigns/${encodeURIComponent(campaignId)}/participants?page=1&limit=20`,
      );
      setItems(result.data.items);
      setOpen(true);
    } catch (cause) {
      setError(
        errorMessageFor(cause, { errors: dict.errors, genericFallback: dict.errors.generic }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 space-y-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => void toggle()}
        disabled={busy}
        className="hover:border-brand-300 hover:text-brand-700"
      >
        {dict.campaigns.participants}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {open ? (
        items.length === 0 ? (
          <p className="text-sm text-sand-500">{dict.common.empty}</p>
        ) : (
          <ul className="divide-y divide-sand-100 rounded-lg border border-sand-100 px-4">
            {items.map((participant) => (
              <li key={participant.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <span className="font-medium text-sand-900">
                  {participant.volunteerProfile?.user
                    ? `${participant.volunteerProfile.user.firstName} ${participant.volunteerProfile.user.lastName}`
                    : '—'}
                </span>
                <span className="rounded-full bg-sand-100 px-2 py-0.5 text-xs font-semibold text-sand-700">
                  {participant.status}
                </span>
                <span className="text-sand-500">
                  {dict.common.hours}: {String(participant.hours)}
                </span>
                <span className="text-sand-500">
                  {formatDate(participant.participationDate, locale)}
                </span>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}

/** Contribution ledger — `GET /orgs/:orgId/campaigns/:id/contributions` (donors masked). */
interface ContributionResult {
  items: Array<{
    id: string;
    amount: number | string;
    currency: string;
    status: 'PENDING' | 'CONFIRMED' | 'REJECTED';
    reference: string | null;
    note: string | null;
    reason: string | null;
    decidedAt: string | null;
    createdAt: string;
    donor: { id: string; name: string; email: string };
  }>;
}

/**
 * Org-only contribution ledger for one campaign: fetched on toggle, donors
 * masked server-side, and PENDING rows get the CONFIRM/REJECT decision
 * (POST …/contributions/:cid — OWNER via `organization.billing.manage`;
 * REJECT demands a reason, both outcomes are terminal).
 */
export function CampaignContributions({
  locale,
  orgId,
  campaignId,
}: {
  locale: LocaleCode;
  orgId: string;
  campaignId: string;
}) {
  const { dict } = getDictionary(locale);
  const labels = dict.workspace.campaigns;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [items, setItems] = useState<ContributionResult['items']>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});

  async function load(): Promise<void> {
    const result = await api.get<ContributionResult>(
      `/orgs/${orgId}/campaigns/${encodeURIComponent(campaignId)}/contributions?page=1&limit=20`,
    );
    setItems(result.data.items);
  }

  async function toggle(): Promise<void> {
    if (open) {
      setOpen(false);
      return;
    }
    setError(null);
    setNotice(null);
    setBusyKey('toggle');
    try {
      await load();
      setOpen(true);
    } catch (cause) {
      setError(
        errorMessageFor(cause, { errors: dict.errors, genericFallback: dict.errors.generic }),
      );
    } finally {
      setBusyKey(null);
    }
  }

  async function decide(id: string, action: 'CONFIRM' | 'REJECT'): Promise<void> {
    const reason = (reasons[id] ?? '').trim();
    if (action === 'REJECT' && !reason) {
      setError(labels.contributionReason + ': ' + dict.common.required);
      return;
    }
    setError(null);
    setNotice(null);
    setBusyKey(`${id}:${action}`);
    try {
      await api.post(
        `/orgs/${orgId}/campaigns/${encodeURIComponent(campaignId)}/contributions/${encodeURIComponent(id)}`,
        { action, ...(reason ? { reason } : {}) },
      );
      setNotice(labels.contributionUpdated);
      await load();
      router.refresh(); // public funding totals on the campaign page
    } catch (cause) {
      setError(
        errorMessageFor(cause, { errors: dict.errors, genericFallback: dict.errors.generic }),
      );
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="mt-2 space-y-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => void toggle()}
        disabled={busyKey === 'toggle'}
        className="hover:border-brand-300 hover:text-brand-700"
      >
        {labels.contributions}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm font-medium text-brand-700">
          {notice}
        </p>
      ) : null}
      {open ? (
        items.length === 0 ? (
          <p className="text-sm text-sand-500">{labels.noContributions}</p>
        ) : (
          <ul className="divide-y divide-sand-100 rounded-lg border border-sand-100 px-4">
            {items.map((item) => (
              <li key={item.id} className="py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sand-900">{item.donor.name}</p>
                    <p className="text-xs text-sand-500">{item.donor.email}</p>
                  </div>
                  <StatusBadge
                    status={item.status}
                    label={labels.contributionStatuses[item.status]}
                  />
                </div>
                <p className="mt-1 flex flex-wrap gap-x-3 text-sand-600">
                  <span>
                    {labels.contributionAmount}: {String(item.amount)} {item.currency}
                  </span>
                  {item.reference ? (
                    <span>
                      {dict.campaigns.contributeReference}: {item.reference}
                    </span>
                  ) : null}
                  <span>{formatDate(item.createdAt, locale)}</span>
                </p>
                {item.note ? <p className="mt-1 text-sand-600">{item.note}</p> : null}
                {item.status === 'PENDING' ? (
                  <div className="mt-2 flex flex-wrap items-end gap-2">
                    <div className="min-w-56 flex-1">
                      <Input
                        label={`${labels.contributionReason} (${dict.common.optional})`}
                        value={reasons[item.id] ?? ''}
                        onChange={(event) =>
                          setReasons((prev) => ({ ...prev, [item.id]: event.target.value }))
                        }
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void decide(item.id, 'CONFIRM')}
                      disabled={busyKey === `${item.id}:CONFIRM`}
                      className="hover:border-brand-300 hover:text-brand-700"
                    >
                      {labels.confirmAction}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void decide(item.id, 'REJECT')}
                      disabled={busyKey === `${item.id}:REJECT`}
                      className="hover:border-brand-300 hover:text-brand-700"
                    >
                      {labels.rejectAction}
                    </Button>
                  </div>
                ) : item.reason ? (
                  <p className="mt-1 text-xs text-sand-500">
                    {labels.contributionReason}: {item.reason}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}
