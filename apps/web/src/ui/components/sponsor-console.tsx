'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardTitle,
  EmptyState,
  Input,
  Select,
  Textarea,
  useConfirm,
} from '@bladna/ui';
import { api, errorMessageFor, fieldErrors as extractFieldErrors } from '@/ui/api/client';
import { useFocusFirstError } from '@/ui/use-focus-first-error';
import { getDictionary, type Dictionary, type LocaleCode } from '@/ui/i18n';
import { formatDate } from '@/ui/format';
import { ListPager } from '@/ui/components/list-pager';
import { StatusBadge } from '@/ui/status';

// ── Shapes (server-filled, JSON-plain by the time they cross the RSC boundary) ──

export type SponsorTab = 'overview' | 'profile' | 'sponsorships' | 'programs' | 'members';

export const SPONSOR_TABS: readonly SponsorTab[] = [
  'overview',
  'profile',
  'sponsorships',
  'programs',
  'members',
];

export type SponsorStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
export type SponsorshipStatus = 'PROPOSED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
/** CASH (money) or IN_KIND (goods/services); in-kind gifts describe themselves. */
export type SponsorshipKind = 'CASH' | 'IN_KIND';
export type SponsorshipAction = 'ACTIVATE' | 'COMPLETE' | 'CANCEL';
export type ProgramStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED';
export type ProgramAction = 'ACTIVATE' | 'PAUSE' | 'COMPLETE' | 'ARCHIVE';
export type MemberRole = 'SPONSOR_MEMBER' | 'SPONSOR_ADMIN';

/** Page envelope shared by every paginated list response (`buildPageMeta`). */
export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** `SPONSOR_WORKSPACE_SELECT` behind `access: 'workspace'`. */
export interface SponsorProfileData {
  id: string;
  legalName: string;
  commercialName: string;
  slug: string;
  description: string | null;
  website: string | null;
  industry: string | null;
  contactEmail: string;
  contactPhone: string | null;
  logo: string | null;
  verificationStatus: string;
  status: SponsorStatus;
  createdAt: string;
  updatedAt: string;
}

/** `SPONSORSHIP_SELECT` row plus the server-computed state-machine actions. */
export interface SponsorshipRow {
  id: string;
  amount: string;
  currency: string;
  kind: SponsorshipKind;
  description: string | null;
  status: SponsorshipStatus;
  startDate: string;
  endDate: string | null;
  createdAt: string;
  campaign: { id: string; name: string; status: string } | null;
  csrProgram: { id: string; title: string; status: string } | null;
  allowedActions: SponsorshipAction[];
}

/** `PROGRAM_WORKSPACE_SELECT` row plus the server-computed state-machine actions. */
export interface ProgramRow {
  id: string;
  title: string;
  description: string | null;
  budget: string;
  currency: string;
  startDate: string;
  endDate: string;
  status: ProgramStatus;
  volunteerTarget: number | null;
  hourTarget: number | null;
  beneficiaryTarget: number | null;
  impactTarget: string | null;
  createdAt: string;
  allowedActions: ProgramAction[];
}

/** `MEMBER_SELECT` row (workspace members list). */
export interface MemberRow {
  id: string;
  role: MemberRole;
  createdAt: string;
  user: { id: string; firstName: string; lastName: string; email: string };
}

export interface OptionItem {
  id: string;
  name: string;
}

export interface SponsorshipsList {
  items: SponsorshipRow[];
  meta: PageMeta;
  campaigns: OptionItem[];
  programs: OptionItem[];
}

export interface SponsorConsoleProps {
  locale: LocaleCode;
  sponsorId: string;
  activeTab: SponsorTab;
  registered?: boolean;
  sponsor: SponsorProfileData;
  canManage: boolean;
  counts?: { sponsorships: number; programs: number } | null;
  sponsorshipsList?: SponsorshipsList | null;
  programsList?: { items: ProgramRow[]; meta: PageMeta } | null;
  membersList?: { items: MemberRow[]; meta: PageMeta } | null;
  listError?: string | null;
}

// ── Helpers ─────────────────────────────────────────────────────

/** Tab links and pager hrefs share one URL shape (`?tab=&id=&page=`). */
function listPageHref(
  locale: LocaleCode,
  sponsorId: string,
  tab: SponsorTab,
  page: number,
): string {
  const params = new URLSearchParams({ tab, id: sponsorId });
  if (page > 1) params.set('page', String(page));
  return `/${locale}/sponsor?${params.toString()}`;
}

/** ISO date → `YYYY-MM-DD` for `<input type="date">`. */
function toDateInput(value: string): string {
  return value.slice(0, 10);
}

function optionalNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

function errorMessage(cause: unknown, dict: Dictionary): string {
  return errorMessageFor(cause, { errors: dict.errors, genericFallback: dict.errors.generic });
}

function ErrorAlert({ message }: { message: string }) {
  return <Alert tone="danger">{message}</Alert>;
}

function SuccessNotice({ message }: { message: string }) {
  return <Alert tone="success">{message}</Alert>;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-sand-50 px-3 py-2">
      <dt className="text-sm font-medium text-sand-700">{label}</dt>
      <dd className="min-w-0 truncate text-sm text-sand-900">{value || '—'}</dd>
    </div>
  );
}

/**
 * Campaign/program picker for `createSponsorshipSchema` (exactly one target).
 * A non-empty option list renders a select; otherwise a raw uuid input keeps
 * the path usable when the option fetch failed or the list is empty.
 */
function TargetPicker({
  label,
  options,
  value,
  onChange,
  error,
}: {
  label: string;
  options: OptionItem[];
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  if (options.length === 0) {
    return (
      <Input
        label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="00000000-0000-0000-0000-000000000000"
        error={error}
      />
    );
  }
  return (
    <Select
      label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      error={error}
    >
      <option value="">—</option>
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.name}
        </option>
      ))}
    </Select>
  );
}

// ── Overview ────────────────────────────────────────────────────

function OverviewSection({
  dict,
  status,
  counts,
  listError,
}: {
  dict: Dictionary;
  status: SponsorStatus;
  counts: { sponsorships: number; programs: number } | null;
  listError: string | null;
}) {
  const overview = dict.sponsorConsole.overview;
  return (
    <Card className="p-6">
      <CardTitle>{dict.sponsorConsole.tabs.overview}</CardTitle>
      {listError ? (
        <div className="mt-4">
          <ErrorAlert message={listError} />
        </div>
      ) : (
        <>
          <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-sand-100 bg-sand-50 px-4 py-3">
              <dt className="text-xs font-semibold uppercase tracking-wide text-sand-500">
                {overview.statSponsorships}
              </dt>
              <dd className="mt-1 text-2xl font-bold text-sand-900">{counts?.sponsorships ?? 0}</dd>
            </div>
            <div className="rounded-lg border border-sand-100 bg-sand-50 px-4 py-3">
              <dt className="text-xs font-semibold uppercase tracking-wide text-sand-500">
                {overview.statPrograms}
              </dt>
              <dd className="mt-1 text-2xl font-bold text-sand-900">{counts?.programs ?? 0}</dd>
            </div>
            <div className="rounded-lg border border-sand-100 bg-sand-50 px-4 py-3">
              <dt className="text-xs font-semibold uppercase tracking-wide text-sand-500">
                {overview.statStatus}
              </dt>
              <dd className="mt-1">
                <StatusBadge status={status} label={dict.admin.sponsorAdmin.statuses[status]} />
              </dd>
            </div>
          </dl>
          {counts && counts.sponsorships === 0 && counts.programs === 0 ? (
            <EmptyState className="mt-4">{overview.empty}</EmptyState>
          ) : null}
        </>
      )}
    </Card>
  );
}

// ── Profile ─────────────────────────────────────────────────────

/**
 * `PATCH /sponsors/:sponsorId` (needs `sponsor.manage` — the server returns
 * FORBIDDEN for SPONSOR_MEMBER, so the probe result renders a read-only view
 * instead of a form that could only ever fail).
 */
function ProfileSection({
  dict,
  sponsor,
  canManage,
}: {
  dict: Dictionary;
  sponsor: SponsorProfileData;
  canManage: boolean;
}) {
  const router = useRouter();
  const [legalName, setLegalName] = useState(sponsor.legalName);
  const [commercialName, setCommercialName] = useState(sponsor.commercialName);
  const [contactEmail, setContactEmail] = useState(sponsor.contactEmail);
  const [contactPhone, setContactPhone] = useState(sponsor.contactPhone ?? '');
  const [website, setWebsite] = useState(sponsor.website ?? '');
  const [industry, setIndustry] = useState(sponsor.industry ?? '');
  const [description, setDescription] = useState(sponsor.description ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fieldErrs, setFieldErrs] = useState<Record<string, string>>({});
  useFocusFirstError(fieldErrs);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const errs: Record<string, string> = {};
    if (legalName.trim().length < 2) errs.legalName = dict.common.required;
    if (commercialName.trim().length < 2) errs.commercialName = dict.common.required;
    if (!contactEmail.trim()) errs.contactEmail = dict.common.required;
    // The API cannot clear a phone number (phoneSchema rejects '') — say so
    // instead of silently keeping the old value behind an empty box.
    if (sponsor.contactPhone && !contactPhone.trim()) errs.contactPhone = dict.common.required;
    if (Object.keys(errs).length > 0) {
      setError(null);
      setNotice(null);
      setFieldErrs(errs);
      return;
    }
    setError(null);
    setNotice(null);
    setFieldErrs({});
    setBusy(true);
    try {
      await api.patch(`/sponsors/${sponsor.id}`, {
        legalName: legalName.trim(),
        commercialName: commercialName.trim(),
        contactEmail: contactEmail.trim(),
        ...(contactPhone.trim() ? { contactPhone: contactPhone.trim() } : {}),
        website: website.trim(),
        industry: industry.trim(),
        description: description.trim(),
      });
      setNotice(dict.sponsorConsole.profile.saved);
      router.refresh();
    } catch (cause) {
      setFieldErrs(extractFieldErrors(cause));
      setError(errorMessage(cause, dict));
    } finally {
      setBusy(false);
    }
  }

  if (!canManage) {
    return (
      <Card className="p-6">
        <CardTitle>{dict.sponsorConsole.tabs.profile}</CardTitle>
        <dl className="mt-4 space-y-2">
          <DetailRow label={dict.admin.sponsorAdmin.legalName} value={sponsor.legalName} />
          <DetailRow
            label={dict.admin.sponsorAdmin.commercialName}
            value={sponsor.commercialName}
          />
          <DetailRow label={dict.admin.sponsorAdmin.contactEmail} value={sponsor.contactEmail} />
          <DetailRow
            label={dict.admin.sponsorAdmin.contactPhone}
            value={sponsor.contactPhone ?? ''}
          />
          <DetailRow label={dict.admin.sponsorAdmin.website} value={sponsor.website ?? ''} />
          <DetailRow label={dict.admin.sponsorAdmin.industry} value={sponsor.industry ?? ''} />
          <DetailRow label={dict.common.description} value={sponsor.description ?? ''} />
        </dl>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <CardTitle>{dict.sponsorConsole.tabs.profile}</CardTitle>
      <form onSubmit={submit} noValidate className="mt-4 space-y-4">
        {error ? <ErrorAlert message={error} /> : null}
        {notice ? <SuccessNotice message={notice} /> : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label={dict.admin.sponsorAdmin.legalName}
            required
            maxLength={200}
            value={legalName}
            onChange={(event) => setLegalName(event.target.value)}
            error={fieldErrs.legalName}
          />
          <Input
            label={dict.admin.sponsorAdmin.commercialName}
            required
            maxLength={200}
            value={commercialName}
            onChange={(event) => setCommercialName(event.target.value)}
            error={fieldErrs.commercialName}
          />
          <Input
            label={dict.admin.sponsorAdmin.contactEmail}
            type="email"
            required
            maxLength={254}
            value={contactEmail}
            onChange={(event) => setContactEmail(event.target.value)}
            error={fieldErrs.contactEmail}
          />
          <Input
            label={`${dict.admin.sponsorAdmin.contactPhone} (${dict.common.optional})`}
            type="tel"
            maxLength={20}
            value={contactPhone}
            onChange={(event) => setContactPhone(event.target.value)}
            error={fieldErrs.contactPhone}
          />
          <Input
            label={`${dict.admin.sponsorAdmin.website} (${dict.common.optional})`}
            type="url"
            maxLength={300}
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
            error={fieldErrs.website}
          />
          <Input
            label={`${dict.admin.sponsorAdmin.industry} (${dict.common.optional})`}
            maxLength={120}
            value={industry}
            onChange={(event) => setIndustry(event.target.value)}
            error={fieldErrs.industry}
          />
        </div>

        <Textarea
          label={`${dict.common.description} (${dict.common.optional})`}
          maxLength={8000}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          error={fieldErrs.description}
        />

        <Button type="submit" loading={busy}>
          {dict.common.save}
        </Button>
      </form>
    </Card>
  );
}

// ── Sponsorships ────────────────────────────────────────────────

/**
 * List + propose + transition, all behind `sponsor.read`; the mutations need
 * `sponsorship.create`/`sponsorship.manage` (SPONSOR_ADMIN), so `canManage`
 * hides the controls a member could never use.
 */
function SponsorshipsSection({
  dict,
  locale,
  sponsorId,
  list,
  canManage,
  listError,
}: {
  dict: Dictionary;
  locale: LocaleCode;
  sponsorId: string;
  list: SponsorshipsList;
  canManage: boolean;
  listError: string | null;
}) {
  const router = useRouter();
  const copy = dict.sponsorConsole.sponsorships;
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fieldErrs, setFieldErrs] = useState<Record<string, string>>({});
  useFocusFirstError(fieldErrs);
  const [showCreate, setShowCreate] = useState(false);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('DZD');
  const [kind, setKind] = useState<SponsorshipKind>('CASH');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [programId, setProgramId] = useState('');
  const [reasons, setReasons] = useState<Record<string, string>>({});

  function resetFeedback(): void {
    setError(null);
    setNotice(null);
    setFieldErrs({});
  }

  async function guard(
    key: string,
    action: () => Promise<unknown>,
    success: string,
  ): Promise<boolean> {
    resetFeedback();
    setBusyKey(key);
    try {
      await action();
      setNotice(success);
      router.refresh();
      return true;
    } catch (cause) {
      setFieldErrs(extractFieldErrors(cause));
      setError(errorMessage(cause, dict));
      return false;
    } finally {
      setBusyKey(null);
    }
  }

  async function createSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const errs: Record<string, string> = {};
    const parsedAmount = amount.trim() === '' ? 0 : Number(amount);
    if (kind === 'CASH' && !(parsedAmount > 0)) errs.amount = dict.common.required;
    if (amount.trim() !== '' && (!Number.isFinite(parsedAmount) || parsedAmount < 0)) {
      errs.amount = dict.errors.validation;
    }
    if (kind === 'IN_KIND' && !description.trim()) errs.description = dict.common.required;
    if (currency.trim().length !== 3) errs.currency = dict.errors.validation;
    if (!startDate) errs.startDate = dict.common.required;
    if (Object.keys(errs).length > 0) {
      resetFeedback();
      setFieldErrs(errs);
      return;
    }
    if (!campaignId && !programId) {
      // createSponsorshipSchema requires exactly one target — the hint copy
      // reads as the instruction it is.
      resetFeedback();
      setError(copy.targetHint);
      return;
    }
    const done = await guard(
      'create',
      () =>
        api.post(`/sponsors/${sponsorId}/sponsorships`, {
          amount: parsedAmount,
          currency: currency.trim(),
          kind,
          ...(description.trim() ? { description: description.trim() } : {}),
          startDate,
          ...(endDate ? { endDate } : {}),
          ...(campaignId ? { campaignId } : {}),
          ...(programId ? { csrProgramId: programId } : {}),
        }),
      copy.created,
    );
    if (done) {
      setShowCreate(false);
      setAmount('');
      setKind('CASH');
      setDescription('');
      setStartDate('');
      setEndDate('');
      setCampaignId('');
      setProgramId('');
    }
  }

  async function transition(id: string, action: SponsorshipAction): Promise<void> {
    const reason = (reasons[id] ?? '').trim();
    await guard(
      id,
      () =>
        api.post(`/sponsors/${sponsorId}/sponsorships/${id}/transition`, {
          action,
          ...(reason ? { reason } : {}),
        }),
      copy.updated,
    );
  }

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>{dict.sponsorConsole.tabs.sponsorships}</CardTitle>
        {canManage ? (
          <Button
            size="sm"
            onClick={() => {
              resetFeedback();
              setShowCreate((open) => !open);
            }}
          >
            {showCreate ? dict.common.cancel : copy.create}
          </Button>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-sand-500">{copy.transitionHint}</p>

      {error ? (
        <div className="mt-4">
          <ErrorAlert message={error} />
        </div>
      ) : null}
      {notice ? (
        <div className="mt-4">
          <SuccessNotice message={notice} />
        </div>
      ) : null}

      {showCreate && canManage ? (
        <form
          onSubmit={createSubmit}
          noValidate
          className="mt-4 space-y-4 rounded-lg border border-sand-200 bg-sand-50 p-4"
        >
          <p className="text-sm font-semibold text-sand-800">{copy.createTitle}</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label={copy.amountLabel}
              type="number"
              min="0"
              step="0.01"
              required={kind === 'CASH'}
              hint={kind === 'IN_KIND' ? copy.inKindHint : undefined}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              error={fieldErrs.amount}
            />
            <Input
              label={copy.currencyLabel}
              required
              maxLength={3}
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
              error={fieldErrs.currency}
            />
            <Select
              label={copy.kindLabel}
              value={kind}
              onChange={(event) => setKind(event.target.value as SponsorshipKind)}
              error={fieldErrs.kind}
            >
              <option value="CASH">{copy.kinds.CASH}</option>
              <option value="IN_KIND">{copy.kinds.IN_KIND}</option>
            </Select>
            <Input
              label={copy.startLabel}
              type="date"
              required
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              error={fieldErrs.startDate}
            />
            <Input
              label={`${copy.endLabel} (${dict.common.optional})`}
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              error={fieldErrs.endDate}
            />
            <TargetPicker
              label={copy.campaignLabel}
              options={list.campaigns}
              value={campaignId}
              onChange={(value) => {
                setCampaignId(value);
                if (value) setProgramId('');
              }}
              error={fieldErrs.campaignId}
            />
            <TargetPicker
              label={copy.programLabel}
              options={list.programs}
              value={programId}
              onChange={(value) => {
                setProgramId(value);
                if (value) setCampaignId('');
              }}
              error={fieldErrs.csrProgramId}
            />
          </div>
          <p className="text-xs text-sand-500">{copy.targetHint}</p>
          <Textarea
            label={copy.descriptionLabel}
            required={kind === 'IN_KIND'}
            hint={kind === 'IN_KIND' ? copy.inKindHint : dict.common.optional}
            rows={3}
            maxLength={2000}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            error={fieldErrs.description}
          />
          <Button type="submit" loading={busyKey === 'create'}>
            {dict.common.submit}
          </Button>
        </form>
      ) : null}

      {listError ? (
        <div className="mt-4">
          <ErrorAlert message={listError} />
        </div>
      ) : list.items.length === 0 ? (
        <EmptyState className="mt-4">{copy.none}</EmptyState>
      ) : (
        <ul className="mt-4 space-y-4">
          {list.items.map((item) => (
            <li key={item.id} className="rounded-lg border border-sand-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-sand-900">
                    {item.campaign
                      ? `${dict.common.campaign}: ${item.campaign.name}`
                      : item.csrProgram
                        ? `${copy.programLabel}: ${item.csrProgram.title}`
                        : '—'}
                  </p>
                  <p className="mt-1 flex flex-wrap gap-x-3 text-sm text-sand-600">
                    <span>
                      {item.amount} {item.currency}
                    </span>
                    <span>{copy.kinds[item.kind]}</span>
                    <span>
                      {copy.startLabel}: {formatDate(item.startDate, locale)}
                    </span>
                    {item.endDate ? (
                      <span>
                        {copy.endLabel}: {formatDate(item.endDate, locale)}
                      </span>
                    ) : null}
                  </p>
                  {item.description ? (
                    <p className="mt-1 text-sm text-sand-600">{item.description}</p>
                  ) : null}
                </div>
                <StatusBadge status={item.status} label={copy.statuses[item.status]} />
              </div>
              {canManage && item.allowedActions.length > 0 ? (
                <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-sand-100 pt-3">
                  <div className="w-64">
                    <Input
                      label={`${copy.reasonLabel} (${dict.common.optional})`}
                      maxLength={1000}
                      value={reasons[item.id] ?? ''}
                      onChange={(event) =>
                        setReasons((current) => ({ ...current, [item.id]: event.target.value }))
                      }
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 pb-0.5">
                    {item.allowedActions.map((action) => (
                      <Button
                        key={action}
                        size="sm"
                        variant="outline"
                        disabled={busyKey !== null}
                        onClick={() => transition(item.id, action)}
                      >
                        {copy.actions[action]}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {!listError ? (
        <ListPager
          meta={list.meta}
          busy={busyKey !== null}
          onPrev={() =>
            router.push(listPageHref(locale, sponsorId, 'sponsorships', list.meta.page - 1))
          }
          onNext={() =>
            router.push(listPageHref(locale, sponsorId, 'sponsorships', list.meta.page + 1))
          }
          labels={{
            page: dict.common.page,
            of: dict.common.of,
            previous: dict.common.previous,
            next: dict.common.next,
          }}
        />
      ) : null}
    </Card>
  );
}

// ── Programs ────────────────────────────────────────────────────

/**
 * Shared create/edit form → `POST|PATCH /sponsors/:sponsorId/programs[/:programId]`
 * (`csr.create` for create, `csr.manage` for update — both callers already hold
 * them by the time this renders).
 */
function ProgramForm({
  dict,
  sponsorId,
  initial,
  onSaved,
  onCancel,
}: {
  dict: Dictionary;
  sponsorId: string;
  initial: ProgramRow | null;
  onSaved: (message: string) => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const copy = dict.sponsorConsole.programs;
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [budget, setBudget] = useState(initial ? String(initial.budget) : '');
  const [currency, setCurrency] = useState(initial?.currency ?? 'DZD');
  const [startDate, setStartDate] = useState(initial ? toDateInput(initial.startDate) : '');
  const [endDate, setEndDate] = useState(initial ? toDateInput(initial.endDate) : '');
  const [volunteerTarget, setVolunteerTarget] = useState(optionalNumber(initial?.volunteerTarget));
  const [hourTarget, setHourTarget] = useState(optionalNumber(initial?.hourTarget));
  const [beneficiaryTarget, setBeneficiaryTarget] = useState(
    optionalNumber(initial?.beneficiaryTarget),
  );
  const [impactTarget, setImpactTarget] = useState(initial?.impactTarget ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrs, setFieldErrs] = useState<Record<string, string>>({});
  useFocusFirstError(fieldErrs);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const errs: Record<string, string> = {};
    if (title.trim().length < 2) errs.title = dict.common.required;
    if (!budget.trim()) errs.budget = dict.common.required;
    else if (!(Number(budget) > 0)) errs.budget = dict.errors.validation;
    if (currency.trim().length !== 3) errs.currency = dict.errors.validation;
    if (!startDate) errs.startDate = dict.common.required;
    if (!endDate) errs.endDate = dict.common.required;
    // The schema refuses end < start (END_BEFORE_START) — pre-check with
    // localized copy instead of surfacing the machine string.
    else if (startDate && endDate && endDate < startDate) errs.endDate = dict.errors.validation;
    if (volunteerTarget.trim() && !Number.isInteger(Number(volunteerTarget))) {
      errs.volunteerTarget = dict.errors.validation;
    }
    if (beneficiaryTarget.trim() && !Number.isInteger(Number(beneficiaryTarget))) {
      errs.beneficiaryTarget = dict.errors.validation;
    }
    if (hourTarget.trim() && !(Number(hourTarget) >= 0)) {
      errs.hourTarget = dict.errors.validation;
    }
    if (Object.keys(errs).length > 0) {
      setError(null);
      setFieldErrs(errs);
      return;
    }
    setError(null);
    setFieldErrs({});
    setBusy(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        budget: Number(budget),
        currency: currency.trim(),
        startDate,
        endDate,
        ...(volunteerTarget.trim() ? { volunteerTarget: Number(volunteerTarget) } : {}),
        ...(hourTarget.trim() ? { hourTarget: Number(hourTarget) } : {}),
        ...(beneficiaryTarget.trim() ? { beneficiaryTarget: Number(beneficiaryTarget) } : {}),
        ...(impactTarget.trim() ? { impactTarget: impactTarget.trim() } : {}),
      };
      if (initial) {
        await api.patch(`/sponsors/${sponsorId}/programs/${initial.id}`, payload);
      } else {
        await api.post(`/sponsors/${sponsorId}/programs`, payload);
      }
      onSaved(initial ? copy.updated : copy.created);
      router.refresh();
    } catch (cause) {
      setFieldErrs(extractFieldErrors(cause));
      setError(errorMessage(cause, dict));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <p className="text-sm font-semibold text-sand-800">
        {initial ? copy.editTitle : copy.createTitle}
      </p>
      {error ? <ErrorAlert message={error} /> : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label={copy.titleLabel}
          required
          maxLength={200}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          error={fieldErrs.title}
        />
        <Input
          label={copy.budgetLabel}
          type="number"
          min="0"
          step="0.01"
          required
          value={budget}
          onChange={(event) => setBudget(event.target.value)}
          error={fieldErrs.budget}
        />
        <Input
          label={dict.sponsorConsole.sponsorships.currencyLabel}
          required
          maxLength={3}
          value={currency}
          onChange={(event) => setCurrency(event.target.value)}
          error={fieldErrs.currency}
        />
        <Input
          label={`${copy.impactTargetLabel} (${dict.common.optional})`}
          maxLength={1000}
          value={impactTarget}
          onChange={(event) => setImpactTarget(event.target.value)}
          error={fieldErrs.impactTarget}
        />
        <Input
          label={copy.startLabel}
          type="date"
          required
          value={startDate}
          onChange={(event) => setStartDate(event.target.value)}
          error={fieldErrs.startDate}
        />
        <Input
          label={copy.endLabel}
          type="date"
          required
          value={endDate}
          onChange={(event) => setEndDate(event.target.value)}
          error={fieldErrs.endDate}
        />
        <Input
          label={`${copy.volunteerTargetLabel} (${dict.common.optional})`}
          type="number"
          min="0"
          step="1"
          value={volunteerTarget}
          onChange={(event) => setVolunteerTarget(event.target.value)}
          error={fieldErrs.volunteerTarget}
        />
        <Input
          label={`${copy.hourTargetLabel} (${dict.common.optional})`}
          type="number"
          min="0"
          step="any"
          value={hourTarget}
          onChange={(event) => setHourTarget(event.target.value)}
          error={fieldErrs.hourTarget}
        />
        <Input
          label={`${copy.beneficiaryTargetLabel} (${dict.common.optional})`}
          type="number"
          min="0"
          step="1"
          value={beneficiaryTarget}
          onChange={(event) => setBeneficiaryTarget(event.target.value)}
          error={fieldErrs.beneficiaryTarget}
        />
      </div>
      <Textarea
        label={`${copy.descriptionLabel} (${dict.common.optional})`}
        maxLength={8000}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        error={fieldErrs.description}
      />
      <div className="flex gap-2">
        <Button type="submit" loading={busy}>
          {initial ? dict.common.save : dict.common.submit}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          {dict.common.cancel}
        </Button>
      </div>
    </form>
  );
}

/**
 * List + create + edit + transition. Listing/updating/transitions sit behind
 * `sponsor.read`/`csr.manage` (every member); only create needs `csr.create`,
 * which is SPONSOR_ADMIN — hence `canManage` gates just the create button.
 */
function ProgramsSection({
  dict,
  locale,
  sponsorId,
  list,
  canManage,
  listError,
}: {
  dict: Dictionary;
  locale: LocaleCode;
  sponsorId: string;
  list: { items: ProgramRow[]; meta: PageMeta };
  canManage: boolean;
  listError: string | null;
}) {
  const router = useRouter();
  const copy = dict.sponsorConsole.programs;
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});

  async function transition(id: string, action: ProgramAction): Promise<void> {
    setError(null);
    setNotice(null);
    const reason = (reasons[id] ?? '').trim();
    setBusyKey(id);
    try {
      await api.post(`/sponsors/${sponsorId}/programs/${id}/transition`, {
        action,
        ...(reason ? { reason } : {}),
      });
      setNotice(copy.updated);
      router.refresh();
    } catch (cause) {
      setError(errorMessage(cause, dict));
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>{dict.sponsorConsole.tabs.programs}</CardTitle>
        {canManage ? (
          <Button
            size="sm"
            onClick={() => {
              setError(null);
              setNotice(null);
              setShowCreate((open) => !open);
            }}
          >
            {showCreate ? dict.common.cancel : copy.create}
          </Button>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-sand-500">{copy.transitionHint}</p>

      {error ? (
        <div className="mt-4">
          <ErrorAlert message={error} />
        </div>
      ) : null}
      {notice ? (
        <div className="mt-4">
          <SuccessNotice message={notice} />
        </div>
      ) : null}

      {showCreate && canManage ? (
        <div className="mt-4 rounded-lg border border-sand-200 bg-sand-50 p-4">
          <ProgramForm
            dict={dict}
            sponsorId={sponsorId}
            initial={null}
            onSaved={(message) => {
              setNotice(message);
              setShowCreate(false);
            }}
            onCancel={() => setShowCreate(false)}
          />
        </div>
      ) : null}

      {listError ? (
        <div className="mt-4">
          <ErrorAlert message={listError} />
        </div>
      ) : list.items.length === 0 ? (
        <EmptyState className="mt-4">{copy.none}</EmptyState>
      ) : (
        <ul className="mt-4 space-y-4">
          {list.items.map((item) => (
            <li key={item.id} className="rounded-lg border border-sand-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-sand-900">{item.title}</p>
                  {item.description ? (
                    <p className="mt-1 text-sm text-sand-600">{item.description}</p>
                  ) : null}
                  <p className="mt-1 flex flex-wrap gap-x-3 text-sm text-sand-600">
                    <span>
                      {copy.budgetLabel}: {item.budget} {item.currency}
                    </span>
                    <span>
                      {copy.startLabel}: {formatDate(item.startDate, locale)}
                    </span>
                    <span>
                      {copy.endLabel}: {formatDate(item.endDate, locale)}
                    </span>
                  </p>
                  <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-sand-500">
                    {item.volunteerTarget !== null ? (
                      <span>
                        {copy.volunteerTargetLabel}: {item.volunteerTarget}
                      </span>
                    ) : null}
                    {item.hourTarget !== null ? (
                      <span>
                        {copy.hourTargetLabel}: {item.hourTarget}
                      </span>
                    ) : null}
                    {item.beneficiaryTarget !== null ? (
                      <span>
                        {copy.beneficiaryTargetLabel}: {item.beneficiaryTarget}
                      </span>
                    ) : null}
                    {item.impactTarget ? (
                      <span>
                        {copy.impactTargetLabel}: {item.impactTarget}
                      </span>
                    ) : null}
                  </p>
                </div>
                <StatusBadge status={item.status} label={copy.statuses[item.status]} />
              </div>

              {editingId === item.id ? (
                <div className="mt-3 border-t border-sand-100 pt-3">
                  <ProgramForm
                    dict={dict}
                    sponsorId={sponsorId}
                    initial={item}
                    onSaved={(message) => {
                      setNotice(message);
                      setEditingId(null);
                    }}
                    onCancel={() => setEditingId(null)}
                  />
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-sand-100 pt-3">
                  <div className="w-64">
                    <Input
                      label={`${copy.reasonLabel} (${dict.common.optional})`}
                      maxLength={1000}
                      value={reasons[item.id] ?? ''}
                      onChange={(event) =>
                        setReasons((current) => ({ ...current, [item.id]: event.target.value }))
                      }
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 pb-0.5">
                    {item.allowedActions.map((action) => (
                      <Button
                        key={action}
                        size="sm"
                        variant="outline"
                        disabled={busyKey !== null}
                        onClick={() => transition(item.id, action)}
                      >
                        {copy.actions[action]}
                      </Button>
                    ))}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setError(null);
                        setNotice(null);
                        setEditingId(item.id);
                      }}
                    >
                      {copy.editTitle}
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {!listError ? (
        <ListPager
          meta={list.meta}
          busy={busyKey !== null}
          onPrev={() =>
            router.push(listPageHref(locale, sponsorId, 'programs', list.meta.page - 1))
          }
          onNext={() =>
            router.push(listPageHref(locale, sponsorId, 'programs', list.meta.page + 1))
          }
          labels={{
            page: dict.common.page,
            of: dict.common.of,
            previous: dict.common.previous,
            next: dict.common.next,
          }}
        />
      ) : null}
    </Card>
  );
}

// ── Members ─────────────────────────────────────────────────────

/**
 * The whole section (list, add, remove) sits behind `sponsor.manage`, so a
 * failed list renders the server's own message instead of pretending there
 * are no members. Adding is by email against an existing account — invite
 * emails are not wired in this build (the server message says so).
 */
function MembersSection({
  dict,
  locale,
  sponsorId,
  list,
  canManage,
  listError,
}: {
  dict: Dictionary;
  locale: LocaleCode;
  sponsorId: string;
  list: { items: MemberRow[]; meta: PageMeta };
  canManage: boolean;
  listError: string | null;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const copy = dict.sponsorConsole.members;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fieldErrs, setFieldErrs] = useState<Record<string, string>>({});
  useFocusFirstError(fieldErrs);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<MemberRole>('SPONSOR_MEMBER');

  async function guard(action: () => Promise<unknown>, success: string): Promise<boolean> {
    setError(null);
    setNotice(null);
    setFieldErrs({});
    setBusy(true);
    try {
      await action();
      setNotice(success);
      router.refresh();
      return true;
    } catch (cause) {
      setFieldErrs(extractFieldErrors(cause));
      setError(errorMessage(cause, dict));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function invite(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!email.trim()) {
      setError(null);
      setNotice(null);
      setFieldErrs({ email: dict.common.required });
      return;
    }
    const done = await guard(
      () => api.post(`/sponsors/${sponsorId}/members`, { email: email.trim(), role }),
      copy.inviteSent,
    );
    if (done) setEmail('');
  }

  async function remove(memberId: string): Promise<void> {
    if (!(await confirm(copy.confirmRemove))) return;
    await guard(() => api.delete(`/sponsors/${sponsorId}/members/${memberId}`), copy.removed);
  }

  return (
    <Card className="p-6">
      <CardTitle>{dict.sponsorConsole.tabs.members}</CardTitle>

      {listError ? (
        <div className="mt-4">
          <ErrorAlert message={listError} />
        </div>
      ) : (
        <>
          {error ? (
            <div className="mt-4">
              <ErrorAlert message={error} />
            </div>
          ) : null}
          {notice ? (
            <div className="mt-4">
              <SuccessNotice message={notice} />
            </div>
          ) : null}

          {canManage ? (
            <form
              onSubmit={invite}
              noValidate
              className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-sand-200 bg-sand-50 p-4"
            >
              <div className="min-w-56 flex-1">
                <Input
                  label={copy.emailLabel}
                  type="email"
                  required
                  maxLength={254}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  error={fieldErrs.email}
                />
              </div>
              <div className="w-48">
                <Select
                  label={copy.roleLabel}
                  value={role}
                  onChange={(event) => setRole(event.target.value as MemberRole)}
                  error={fieldErrs.role}
                >
                  <option value="SPONSOR_MEMBER">{copy.roles.SPONSOR_MEMBER}</option>
                  <option value="SPONSOR_ADMIN">{copy.roles.SPONSOR_ADMIN}</option>
                </Select>
              </div>
              <Button type="submit" loading={busy}>
                {copy.invite}
              </Button>
            </form>
          ) : null}

          {list.items.length === 0 ? (
            <EmptyState className="mt-4">{copy.none}</EmptyState>
          ) : (
            <ul className="mt-4 divide-y divide-sand-100">
              {list.items.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-sand-900">
                      {item.user.firstName} {item.user.lastName}
                    </p>
                    <p className="truncate text-sm text-sand-500">{item.user.email}</p>
                    <p className="text-xs text-sand-400">
                      {dict.common.createdAt}: {formatDate(item.createdAt, locale)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge tone={item.role === 'SPONSOR_ADMIN' ? 'info' : 'neutral'}>
                      {copy.roles[item.role]}
                    </Badge>
                    {canManage ? (
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={busy}
                        onClick={() => remove(item.id)}
                      >
                        {copy.remove}
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <ListPager
            meta={list.meta}
            busy={busy}
            onPrev={() =>
              router.push(listPageHref(locale, sponsorId, 'members', list.meta.page - 1))
            }
            onNext={() =>
              router.push(listPageHref(locale, sponsorId, 'members', list.meta.page + 1))
            }
            labels={{
              page: dict.common.page,
              of: dict.common.of,
              previous: dict.common.previous,
              next: dict.common.next,
            }}
          />
        </>
      )}
    </Card>
  );
}

// ── Shell ───────────────────────────────────────────────────────

/**
 * Tabbed sponsor console. Every section talks only to real workspace
 * endpoints (`/sponsors/:id/…`); `canManage` comes from the server-side
 * `sponsor.manage` probe so admin-only controls never render for a member.
 * There is no workspace switcher: the API exposes no "my sponsors" listing.
 */
export function SponsorConsole({
  locale,
  sponsorId,
  activeTab,
  registered = false,
  sponsor,
  canManage,
  counts = null,
  sponsorshipsList = null,
  programsList = null,
  membersList = null,
  listError = null,
}: SponsorConsoleProps) {
  const { dict } = getDictionary(locale);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-lg font-semibold text-sand-900">{sponsor.commercialName}</p>
          <StatusBadge
            status={sponsor.status}
            label={dict.admin.sponsorAdmin.statuses[sponsor.status]}
          />
          {sponsor.verificationStatus === 'VERIFIED' ? (
            <Badge tone="success">{dict.common.verified}</Badge>
          ) : null}
        </div>
        {registered ? <SuccessNotice message={dict.sponsorConsole.registered} /> : null}
      </div>

      <nav
        className="flex flex-wrap gap-1 border-b border-sand-200"
        aria-label={dict.sponsorConsole.title}
      >
        {SPONSOR_TABS.map((tab) => (
          <Link
            key={tab}
            href={listPageHref(locale, sponsorId, tab, 1)}
            aria-current={tab === activeTab ? 'page' : undefined}
            className={`flex min-h-11 items-center rounded-t-lg px-3 text-sm font-medium ${
              tab === activeTab
                ? 'bg-white text-brand-700 shadow-sm ring-1 ring-sand-200'
                : 'text-sand-600 hover:text-sand-900'
            }`}
          >
            {dict.sponsorConsole.tabs[tab]}
          </Link>
        ))}
      </nav>

      {activeTab === 'overview' ? (
        <OverviewSection
          dict={dict}
          status={sponsor.status}
          counts={counts}
          listError={listError}
        />
      ) : null}
      {activeTab === 'profile' ? (
        <ProfileSection dict={dict} sponsor={sponsor} canManage={canManage} />
      ) : null}
      {activeTab === 'sponsorships' && sponsorshipsList ? (
        <SponsorshipsSection
          dict={dict}
          locale={locale}
          sponsorId={sponsorId}
          list={sponsorshipsList}
          canManage={canManage}
          listError={listError}
        />
      ) : null}
      {activeTab === 'programs' && programsList ? (
        <ProgramsSection
          dict={dict}
          locale={locale}
          sponsorId={sponsorId}
          list={programsList}
          canManage={canManage}
          listError={listError}
        />
      ) : null}
      {activeTab === 'members' && membersList ? (
        <MembersSection
          dict={dict}
          locale={locale}
          sponsorId={sponsorId}
          list={membersList}
          canManage={canManage}
          listError={listError}
        />
      ) : null}
    </div>
  );
}
