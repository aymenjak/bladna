'use client';

import { Fragment, useState, type FormEvent } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardTitle,
  EmptyState,
  Input,
  Select,
  TabPanel,
  Tabs,
  TabsRoot,
  Textarea,
  cn,
} from '@bladna/ui';
import {
  INTERNATIONAL_APPLICATION_STATUSES,
  INTERNATIONAL_PROJECT_TYPES,
  type InternationalApplicationStatus,
  type InternationalPassportReadiness,
  type InternationalProjectType,
  type VerificationStatus,
} from '@bladna/types';
import { api } from '@/ui/api/client';
import { getDictionary, type Dictionary, type LocaleCode } from '@/ui/i18n';
import { formatDate, formatDateTime } from '@/ui/format';
import { titleFor } from '@/ui/opportunity';
import { ListPager } from '@/ui/components/list-pager';
import { StatusBadge } from '@/ui/status';
import { FilterBar, NoticeBar, td, th, useFail, usePagedList } from './admin-shared';

/**
 * International console section — the admin surface for the international
 * opportunity endpoints (server/modules/international.ts). Read access rides
 * `opportunity.read:platform`; create/edit forms are display-gated on
 * `content.manage` because POST/PATCH re-check it server-side. New records are
 * created `PENDING` and only appear on the public surface once verified.
 *
 * The section renders three sub-panels behind one tab bar: the opportunity
 * moderation queue (verify workflow + append-only verification history), the
 * application queue (strict status transition machine, server 422s surfaced
 * verbatim) and the experience verification list. Mutations are display-gated
 * on `content.manage` and every failure goes through `useFail` like the rest
 * of the console (403 → localized copy, 422 → the server's own message).
 */

type IntlPanelId = 'queue' | 'applications' | 'experiences';

const pagerLabels = (dict: Dictionary) => ({
  page: dict.common.page,
  of: dict.common.of,
  previous: dict.common.previous,
  next: dict.common.next,
});

const VERIFICATION_FILTERS: VerificationStatus[] = [
  'PENDING',
  'UNDER_REVIEW',
  'VERIFIED',
  'REJECTED',
  'SUSPENDED',
  'EXPIRED',
];

/**
 * Client-side mirror of the server's STRICT transition machine for
 * `PATCH /admin/international/applications/:id` — the status select only ever
 * offers these legal next states, and the server still re-checks (422).
 */
const APPLICATION_NEXT: Record<InternationalApplicationStatus, InternationalApplicationStatus[]> = {
  DRAFT: ['SUBMITTED', 'WITHDRAWN'],
  SUBMITTED: ['UNDER_REVIEW', 'REJECTED', 'WITHDRAWN'],
  UNDER_REVIEW: ['SHORTLISTED', 'WAITLISTED', 'REJECTED', 'WITHDRAWN'],
  SHORTLISTED: ['INTERVIEW', 'WAITLISTED', 'REJECTED'],
  INTERVIEW: ['ACCEPTED', 'WAITLISTED', 'REJECTED'],
  WAITLISTED: ['ACCEPTED', 'REJECTED'],
  ACCEPTED: ['COMPLETED'],
  REJECTED: [],
  WITHDRAWN: [],
  COMPLETED: [],
};

const PANELS: ReadonlyArray<{ id: IntlPanelId; label: (dict: Dictionary) => string }> = [
  { id: 'queue', label: (dict) => dict.international.adminQueueTitle },
  { id: 'applications', label: (dict) => dict.international.adminApplicationsTitle },
  { id: 'experiences', label: (dict) => dict.international.adminExperiencesTitle },
];

/** Confirm-button label for a chosen verification target status. */
function verifyConfirmLabel(status: VerificationStatus, dict: Dictionary): string {
  if (status === 'VERIFIED') return dict.international.adminVerify;
  if (status === 'REJECTED') return dict.international.adminReject;
  if (status === 'SUSPENDED') return dict.international.adminSuspend;
  // PENDING / UNDER_REVIEW / EXPIRED all mean "put it back on the review pile".
  return dict.international.adminNeedsReview;
}

/** Localized passport-readiness copy for an application payload. */
function passportLabel(readiness: InternationalPassportReadiness, dict: Dictionary): string {
  if (readiness === 'READY') return dict.international.passportReady;
  if (readiness === 'IN_PROGRESS') return dict.international.passportInProgress;
  return dict.international.passportNone;
}

/** Mirrors OPPORTUNITY_ADMIN_SELECT (public select + admin audit columns). */
interface IntlRow {
  id: string;
  titleAr: string;
  titleFr: string;
  titleEn: string;
  city: string | null;
  program: string;
  provider: string;
  category: InternationalProjectType;
  duration: string | null;
  deadline: string | Date | null;
  sourceUrl: string | null;
  sourceType: string;
  verificationStatus: VerificationStatus;
  updatedAt: string | Date;
}

/** One append-only InternationalVerificationEvent row. */
interface IntlEventRow {
  id: string;
  status: VerificationStatus;
  notes: string | null;
  checkedById: string | null;
  checkedAt: string | Date;
}

/**
 * Volunteer identity exactly as the local (workspace) admin application list
 * exposes it — profile + account basics only, never sensitive documents.
 */
interface VolunteerIdentity {
  id: string;
  volunteerId: string;
  verificationStatus: string;
  publicEmail: boolean;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    profileImage: string | null;
  };
}

/** `GET /admin/international/applications` row. */
interface IntlApplicationRow {
  id: string;
  status: InternationalApplicationStatus;
  motivationLetter: string | null;
  languages: string | null;
  availability: string | null;
  previousExperience: string | null;
  passportReadiness: InternationalPassportReadiness;
  submittedAt: string | Date;
  reviewedAt: string | Date | null;
  reviewedById: string | null;
  decisionNote: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  volunteer: VolunteerIdentity;
  opportunity: {
    id: string;
    titleAr: string;
    titleFr: string;
    titleEn: string;
    provider: string;
  };
}

/** `GET /admin/international/experiences` row (no sensitive documents). */
interface IntlExperienceRow {
  id: string;
  volunteerProfileId: string;
  countryId: string | null;
  opportunityId: string | null;
  organizationName: string;
  program: string;
  role: string | null;
  activity: string | null;
  startDate: string | Date;
  endDate: string | Date | null;
  // Prisma Decimal serializes as a string; direct JSON numbers also possible.
  hours: number | string | null;
  certificateId: string | null;
  verified: boolean;
  verifiedBy: string | null;
  verifiedAt: string | Date | null;
  sourceUrl: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  volunteer: VolunteerIdentity;
}

interface IntlForm {
  titleAr: string;
  titleFr: string;
  titleEn: string;
  program: string;
  provider: string;
  city: string;
  duration: string;
  deadline: string;
  sourceUrl: string;
}

const EMPTY_FORM: IntlForm = {
  titleAr: '',
  titleFr: '',
  titleEn: '',
  program: '',
  provider: '',
  city: '',
  duration: '',
  deadline: '',
  sourceUrl: '',
};

function isoDate(value: string | Date): string {
  return new Date(value).toISOString().slice(0, 10);
}

/** Volunteer-supplied URLs only ever become `href` when they are http(s). */
function safeExternalUrl(url: string | null): string | null {
  if (!url) return null;
  return /^https?:\/\//i.test(url) ? url : null;
}

export function InternationalSection({
  locale,
  canManage,
}: {
  locale: LocaleCode;
  canManage: boolean;
}) {
  const { dict } = getDictionary(locale);
  const [active, setActive] = useState<IntlPanelId>('queue');

  return (
    <div className="space-y-4">
      <TabsRoot active={active} onSelect={setActive} className="space-y-4">
        {/* Sub-panel bar — kit Tabs (role=tablist + arrow keys, RESEARCH §5). */}
        <Tabs
          items={PANELS.map((panel) => ({ id: panel.id, label: panel.label(dict) }))}
          active={active}
          onSelect={setActive}
          ariaLabel={dict.international.title}
        />

        <TabPanel id={active} active={active}>
          {active === 'queue' ? <QueuePanel locale={locale} canManage={canManage} /> : null}
          {active === 'applications' ? (
            <ApplicationsPanel locale={locale} canManage={canManage} />
          ) : null}
          {active === 'experiences' ? (
            <ExperiencesPanel locale={locale} canManage={canManage} />
          ) : null}
        </TabPanel>
      </TabsRoot>
    </div>
  );
}

// ── Opportunity moderation queue ───────────────────────────────

function QueuePanel({ locale, canManage }: { locale: LocaleCode; canManage: boolean }) {
  const { dict } = getDictionary(locale);
  const fail = useFail(locale);
  const [draft, setDraft] = useState({ q: '', verificationStatus: '', category: '' });
  const [filters, setFilters] = useState({ q: '', verificationStatus: '', category: '' });
  const [page, setPage] = useState(1);
  const list = usePagedList<IntlRow>(locale, '/admin/international/opportunities', {
    page,
    limit: 10,
    ...filters,
  });
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState<IntlForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [verifyId, setVerifyId] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  function apply(): void {
    setFilters(draft);
    setPage(1);
  }
  function clear(): void {
    const blank = { q: '', verificationStatus: '', category: '' };
    setDraft(blank);
    setFilters(blank);
    setPage(1);
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setFormBusy(true);
    setFormError(null);
    setNotice(null);
    try {
      // deadline is nullable on both schemas (clears on edit when emptied);
      // optional texts are omitted when empty — the schema does not accept
      // null/'' for them, so an emptied field keeps its stored value.
      const payload = {
        titleAr: form.titleAr.trim(),
        titleFr: form.titleFr.trim(),
        titleEn: form.titleEn.trim(),
        program: form.program.trim(),
        provider: form.provider.trim(),
        deadline: form.deadline ? new Date(`${form.deadline}T00:00:00Z`).toISOString() : null,
        ...(form.city.trim() ? { city: form.city.trim() } : {}),
        ...(form.duration.trim() ? { duration: form.duration.trim() } : {}),
        ...(form.sourceUrl.trim() ? { sourceUrl: form.sourceUrl.trim() } : {}),
      };
      if (editingId) await api.patch(`/admin/international/opportunities/${editingId}`, payload);
      else await api.post('/admin/international/opportunities', payload);
      setNotice(dict.admin.actionDone);
      setEditingId(null);
      setForm(EMPTY_FORM);
      list.reload();
    } catch (cause) {
      const message = fail(cause);
      if (message) setFormError(message);
    } finally {
      setFormBusy(false);
    }
  }

  /** POST /admin/international/opportunities/:id/verification (content.manage). */
  async function runVerification(
    id: string,
    status: VerificationStatus,
    notes: string,
  ): Promise<void> {
    setRowBusy(true);
    setRowError(null);
    setNotice(null);
    try {
      await api.post(`/admin/international/opportunities/${id}/verification`, {
        status,
        ...(notes ? { notes } : {}),
      });
      setNotice(dict.international.adminActioned);
      setVerifyId(null);
      list.reload();
    } catch (cause) {
      // 403 → localized copy, 422 → the server's business-rule message.
      const message = fail(cause);
      if (message) setRowError(message);
    } finally {
      setRowBusy(false);
    }
  }

  function startEdit(row: IntlRow): void {
    setEditingId(row.id);
    setForm({
      titleAr: row.titleAr,
      titleFr: row.titleFr,
      titleEn: row.titleEn,
      program: row.program,
      provider: row.provider,
      city: row.city ?? '',
      duration: row.duration ?? '',
      deadline: row.deadline ? isoDate(row.deadline) : '',
      sourceUrl: row.sourceUrl ?? '',
    });
    setFormError(null);
  }

  function cancelEdit(): void {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  const rows = list.rows;
  const submitLabel = editingId ? dict.admin.intl.update : dict.admin.intl.create;

  return (
    <div className="space-y-4">
      <FilterBar
        onApply={apply}
        onClear={clear}
        busy={list.busy}
        labels={{ apply: dict.admin.filters.apply, clear: dict.admin.filters.clear }}
      >
        <div className="w-56">
          <Input
            label={dict.admin.filters.search}
            value={draft.q}
            onChange={(event) => setDraft({ ...draft, q: event.target.value })}
          />
        </div>
        <div className="w-48">
          <Select
            label={dict.admin.filters.verificationStatus}
            value={draft.verificationStatus}
            onChange={(event) => setDraft({ ...draft, verificationStatus: event.target.value })}
          >
            <option value="">{dict.common.all}</option>
            {VERIFICATION_FILTERS.map((status) => (
              <option key={status} value={status}>
                {dict.international.verificationStatuses[status]}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-52">
          <Select
            label={dict.international.filtersCategory}
            value={draft.category}
            onChange={(event) => setDraft({ ...draft, category: event.target.value })}
          >
            <option value="">{dict.common.all}</option>
            {INTERNATIONAL_PROJECT_TYPES.map((category) => (
              <option key={category} value={category}>
                {dict.international.categories[category]}
              </option>
            ))}
          </Select>
        </div>
      </FilterBar>

      {!canManage ? (
        <Alert>{dict.errors.forbidden}</Alert>
      ) : (
        <Card>
          <CardTitle>{submitLabel}</CardTitle>
          <p className="mt-2 text-xs text-sand-500">{dict.admin.intl.hint}</p>
          <form onSubmit={(event) => void submit(event)} className="mt-3 space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Input
                label={dict.admin.cms.titleAr}
                required
                value={form.titleAr}
                onChange={(event) => setForm({ ...form, titleAr: event.target.value })}
              />
              <Input
                label={dict.admin.cms.titleFr}
                required
                value={form.titleFr}
                onChange={(event) => setForm({ ...form, titleFr: event.target.value })}
              />
              <Input
                label={dict.admin.cms.titleEn}
                required
                value={form.titleEn}
                onChange={(event) => setForm({ ...form, titleEn: event.target.value })}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Input
                label={dict.admin.intl.program}
                required
                value={form.program}
                onChange={(event) => setForm({ ...form, program: event.target.value })}
              />
              <Input
                label={dict.admin.intl.provider}
                required
                value={form.provider}
                onChange={(event) => setForm({ ...form, provider: event.target.value })}
              />
              <Input
                label={dict.admin.intl.city}
                value={form.city}
                onChange={(event) => setForm({ ...form, city: event.target.value })}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Input
                label={dict.admin.intl.duration}
                value={form.duration}
                onChange={(event) => setForm({ ...form, duration: event.target.value })}
              />
              <Input
                label={dict.common.deadline}
                type="date"
                value={form.deadline}
                onChange={(event) => setForm({ ...form, deadline: event.target.value })}
              />
              <Input
                label={dict.admin.intl.sourceUrl}
                type="url"
                value={form.sourceUrl}
                onChange={(event) => setForm({ ...form, sourceUrl: event.target.value })}
              />
            </div>
            {formError ? <Alert>{formError}</Alert> : null}
            <div className="flex gap-2">
              <Button type="submit" size="sm" loading={formBusy}>
                {submitLabel}
              </Button>
              {editingId ? (
                <Button type="button" size="sm" variant="ghost" onClick={cancelEdit}>
                  {dict.common.cancel}
                </Button>
              ) : null}
            </div>
          </form>
        </Card>
      )}

      <NoticeBar message={notice} />
      {list.error ? <Alert>{list.error}</Alert> : null}

      <Card className="overflow-x-auto p-0">
        {!rows ? (
          <p className="px-4 py-6 text-sm text-sand-500">{dict.common.loading}</p>
        ) : rows.items.length === 0 ? (
          <EmptyState className="m-4">{dict.international.adminQueueEmpty}</EmptyState>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-sand-50">
                <th className={th}>{dict.admin.columns.title}</th>
                <th className={th}>{dict.admin.intl.program}</th>
                <th className={th}>{dict.international.filtersCategory}</th>
                <th className={th}>{dict.admin.intl.provider}</th>
                <th className={th}>{dict.common.deadline}</th>
                <th className={th}>{dict.admin.filters.verificationStatus}</th>
                <th className={th}>{dict.admin.columns.action}</th>
              </tr>
            </thead>
            <tbody>
              {rows.items.map((row) => (
                <Fragment key={row.id}>
                  <tr className="border-t border-sand-100">
                    <td className={td}>{titleFor(row, locale)}</td>
                    <td className={cn(td, 'text-sand-700')}>{row.program}</td>
                    <td className={cn(td, 'text-sand-700')}>
                      {row.category ? dict.international.categories[row.category] : '—'}
                    </td>
                    <td className={cn(td, 'text-sand-700')}>{row.provider}</td>
                    <td className={cn(td, 'text-sand-600')}>
                      {row.deadline ? formatDate(row.deadline, locale) : '—'}
                    </td>
                    <td className={td}>
                      <StatusBadge
                        status={row.verificationStatus}
                        label={dict.international.verificationStatuses[row.verificationStatus]}
                      />
                    </td>
                    <td className={td}>
                      <div className="flex flex-wrap gap-2">
                        {canManage ? (
                          <Button size="sm" variant="outline" onClick={() => startEdit(row)}>
                            {dict.admin.actions.edit}
                          </Button>
                        ) : null}
                        {canManage ? (
                          <Button
                            size="sm"
                            variant="outline"
                            aria-expanded={verifyId === row.id}
                            onClick={() => {
                              setHistoryId(null);
                              setRowError(null);
                              setVerifyId(verifyId === row.id ? null : row.id);
                            }}
                          >
                            {dict.international.adminVerify}
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-expanded={historyId === row.id}
                          onClick={() => {
                            setVerifyId(null);
                            setHistoryId(historyId === row.id ? null : row.id);
                          }}
                        >
                          {dict.international.adminHistoryTitle}
                        </Button>
                      </div>
                    </td>
                  </tr>
                  {canManage && verifyId === row.id ? (
                    <tr className="border-t border-sand-100 bg-sand-50">
                      <td colSpan={7} className="px-3 py-3">
                        <VerificationForm
                          locale={locale}
                          busy={rowBusy}
                          error={rowError}
                          onCancel={() => {
                            setVerifyId(null);
                            setRowError(null);
                          }}
                          onSubmit={(status, notes) => void runVerification(row.id, status, notes)}
                        />
                      </td>
                    </tr>
                  ) : null}
                  {historyId === row.id ? (
                    <tr className="border-t border-sand-100 bg-sand-50">
                      <td colSpan={7} className="px-3 py-3">
                        <HistoryPanel locale={locale} opportunityId={row.id} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {rows ? (
        <ListPager
          meta={rows.meta}
          busy={list.busy}
          onPrev={() => setPage(page - 1)}
          onNext={() => setPage(page + 1)}
          labels={pagerLabels(dict)}
        />
      ) : null}
    </div>
  );
}

// ── Verification workflow (inline row panel) ───────────────────

function VerificationForm({
  locale,
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  locale: LocaleCode;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (status: VerificationStatus, notes: string) => void;
}) {
  const { dict } = getDictionary(locale);
  const [status, setStatus] = useState<VerificationStatus>('VERIFIED');
  const [notes, setNotes] = useState('');

  const confirmLabel = verifyConfirmLabel(status, dict);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(status, notes.trim());
      }}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-sand-200 bg-sand-50 p-3"
    >
      <div className="w-56">
        <Select
          label={dict.admin.filters.verificationStatus}
          value={status}
          onChange={(event) => setStatus(event.target.value as VerificationStatus)}
        >
          {VERIFICATION_FILTERS.map((option) => (
            <option key={option} value={option}>
              {dict.international.verificationStatuses[option]}
            </option>
          ))}
        </Select>
      </div>
      <div className="min-w-56 flex-1">
        <Textarea
          label={dict.international.adminNotesLabel}
          rows={2}
          maxLength={2000}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>
      <div className="flex items-center gap-2 pb-0.5">
        <Button type="submit" size="sm" loading={busy}>
          {confirmLabel}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          {dict.common.cancel}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="w-full text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </form>
  );
}

// ── Verification history (append-only events, inline row panel) ─

function HistoryPanel({ locale, opportunityId }: { locale: LocaleCode; opportunityId: string }) {
  const { dict } = getDictionary(locale);
  const [page, setPage] = useState(1);
  const list = usePagedList<IntlEventRow>(
    locale,
    `/admin/international/opportunities/${opportunityId}/events`,
    { page, limit: 10 },
  );
  const rows = list.rows;

  return (
    <div className="space-y-2 rounded-lg border border-sand-200 bg-white p-3">
      <h3 className="text-sm font-semibold text-sand-800">
        {dict.international.adminHistoryTitle}
      </h3>
      {list.error ? <Alert>{list.error}</Alert> : null}
      {!rows ? (
        <p className="text-sm text-sand-500">{dict.common.loading}</p>
      ) : rows.items.length === 0 ? (
        <p className="text-sm text-sand-500">{dict.international.adminHistoryEmpty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-sand-50">
                <th className={th}>{dict.international.adminHistoryAt}</th>
                <th className={th}>{dict.admin.filters.verificationStatus}</th>
                <th className={th}>{dict.international.adminHistoryBy}</th>
              </tr>
            </thead>
            <tbody>
              {rows.items.map((event) => (
                <tr key={event.id} className="border-t border-sand-100 align-top">
                  <td className={cn(td, 'whitespace-nowrap text-sand-600')}>
                    {formatDateTime(event.checkedAt, locale)}
                  </td>
                  <td className={td}>
                    <StatusBadge
                      status={event.status}
                      label={dict.international.verificationStatuses[event.status]}
                    />
                    {event.notes ? (
                      <p className="mt-1 max-w-64 text-xs text-sand-500">
                        {dict.admin.notesLabel}: {event.notes}
                      </p>
                    ) : null}
                  </td>
                  <td className={td}>
                    {event.checkedById ? (
                      <span className="block max-w-40 truncate font-mono text-xs text-sand-600">
                        {event.checkedById}
                      </span>
                    ) : (
                      <span className="text-sand-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows ? (
        <ListPager
          meta={rows.meta}
          busy={list.busy}
          onPrev={() => setPage(page - 1)}
          onNext={() => setPage(page + 1)}
          labels={pagerLabels(dict)}
        />
      ) : null}
    </div>
  );
}

// ── Application queue ──────────────────────────────────────────

function ApplicationsPanel({ locale, canManage }: { locale: LocaleCode; canManage: boolean }) {
  const { dict } = getDictionary(locale);
  const fail = useFail(locale);
  const [draft, setDraft] = useState({ status: '', opportunityId: '' });
  const [filters, setFilters] = useState({ status: '', opportunityId: '' });
  const [page, setPage] = useState(1);
  const list = usePagedList<IntlApplicationRow>(locale, '/admin/international/applications', {
    page,
    limit: 10,
    ...filters,
  });
  const [notice, setNotice] = useState<string | null>(null);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [formStatus, setFormStatus] = useState('');
  const [decisionNote, setDecisionNote] = useState('');
  const [rowBusy, setRowBusy] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  function apply(): void {
    setFilters(draft);
    setPage(1);
  }
  function clear(): void {
    const blank = { status: '', opportunityId: '' };
    setDraft(blank);
    setFilters(blank);
    setPage(1);
  }

  function openForm(row: IntlApplicationRow): void {
    setOpenRow(row.id);
    setFormStatus((APPLICATION_NEXT[row.status] ?? [])[0] ?? '');
    setDecisionNote('');
    setRowError(null);
  }

  /** PATCH /admin/international/applications/:id — strict transition machine. */
  async function submitStatus(row: IntlApplicationRow): Promise<void> {
    if (!formStatus) return;
    setRowBusy(true);
    setRowError(null);
    setNotice(null);
    try {
      await api.patch(`/admin/international/applications/${row.id}`, {
        status: formStatus,
        ...(decisionNote.trim() ? { decisionNote: decisionNote.trim() } : {}),
      });
      setNotice(dict.international.adminStatusUpdated);
      setOpenRow(null);
      list.reload();
    } catch (cause) {
      // 422 business-rule rejections surface the server's message verbatim.
      const message = fail(cause);
      if (message) setRowError(message);
    } finally {
      setRowBusy(false);
    }
  }

  const rows = list.rows;

  return (
    <section className="space-y-4">
      <FilterBar
        onApply={apply}
        onClear={clear}
        busy={list.busy}
        labels={{ apply: dict.admin.filters.apply, clear: dict.admin.filters.clear }}
      >
        <div className="w-52">
          <Select
            label={dict.admin.filters.status}
            value={draft.status}
            onChange={(event) => setDraft({ ...draft, status: event.target.value })}
          >
            <option value="">{dict.common.all}</option>
            {INTERNATIONAL_APPLICATION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {dict.international.statuses[status]}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-72">
          <Input
            label={dict.workspace.applications.filterOpportunity}
            value={draft.opportunityId}
            onChange={(event) => setDraft({ ...draft, opportunityId: event.target.value })}
          />
        </div>
      </FilterBar>

      <NoticeBar message={notice} />
      {list.error ? <Alert>{list.error}</Alert> : null}

      <Card className="overflow-x-auto p-0">
        {!rows ? (
          <p className="px-4 py-6 text-sm text-sand-500">{dict.common.loading}</p>
        ) : rows.items.length === 0 ? (
          <EmptyState className="m-4">{dict.international.adminApplicationsEmpty}</EmptyState>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-sand-50">
                <th className={th}>{dict.workspace.hours.volunteerLabel}</th>
                <th className={th}>{dict.workspace.applications.opportunityColumn}</th>
                <th className={th}>{dict.admin.columns.status}</th>
                <th className={th}>{dict.international.applicationDate}</th>
                <th className={th}>{dict.admin.columns.action}</th>
              </tr>
            </thead>
            <tbody>
              {rows.items.map((row) => (
                <Fragment key={row.id}>
                  <tr className="border-t border-sand-100">
                    <td className={td}>
                      <VolunteerIdentityCell volunteer={row.volunteer} />
                    </td>
                    <td className={td}>
                      <span className="block font-medium text-sand-900">
                        {titleFor(row.opportunity, locale)}
                      </span>
                      <span className="text-xs text-sand-500">{row.opportunity.provider}</span>
                    </td>
                    <td className={td}>
                      <StatusBadge
                        status={row.status}
                        label={dict.international.statuses[row.status]}
                      />
                    </td>
                    <td className={cn(td, 'text-sand-600')}>
                      {formatDate(row.submittedAt, locale)}
                    </td>
                    <td className={td}>
                      <Button
                        size="sm"
                        variant="outline"
                        aria-expanded={openRow === row.id}
                        onClick={() => (openRow === row.id ? setOpenRow(null) : openForm(row))}
                      >
                        {dict.admin.columns.action}
                      </Button>
                    </td>
                  </tr>
                  {openRow === row.id ? (
                    <tr className="border-t border-sand-100 bg-sand-50">
                      <td colSpan={5} className="space-y-3 px-3 py-3">
                        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                          <div>
                            <p className="text-xs font-medium uppercase text-sand-500">
                              {dict.international.applyMotivation}
                            </p>
                            <p className="whitespace-pre-wrap text-sand-700">
                              {row.motivationLetter ?? '—'}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs font-medium uppercase text-sand-500">
                              {dict.international.applyLanguages}
                            </p>
                            <p className="text-sand-700">{row.languages ?? '—'}</p>
                          </div>
                          <div>
                            <p className="text-xs font-medium uppercase text-sand-500">
                              {dict.international.applyAvailability}
                            </p>
                            <p className="text-sand-700">{row.availability ?? '—'}</p>
                          </div>
                          <div>
                            <p className="text-xs font-medium uppercase text-sand-500">
                              {dict.international.applyExperience}
                            </p>
                            <p className="text-sand-700">{row.previousExperience ?? '—'}</p>
                          </div>
                          <div>
                            <p className="text-xs font-medium uppercase text-sand-500">
                              {dict.international.applyPassport}
                            </p>
                            <p className="text-sand-700">
                              {passportLabel(row.passportReadiness, dict)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs font-medium uppercase text-sand-500">
                              {dict.international.applicationDate}
                            </p>
                            <p className="text-sand-700">
                              {formatDateTime(row.submittedAt, locale)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs font-medium uppercase text-sand-500">
                              {dict.international.lastUpdateLabel}
                            </p>
                            <p className="text-sand-700">
                              {formatDateTime(row.reviewedAt, locale)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs font-medium uppercase text-sand-500">
                              {dict.international.adminHistoryBy}
                            </p>
                            {row.reviewedById ? (
                              <span className="block max-w-40 truncate font-mono text-xs text-sand-600">
                                {row.reviewedById}
                              </span>
                            ) : (
                              <span className="text-sand-400">—</span>
                            )}
                          </div>
                          <div className="sm:col-span-2">
                            <p className="text-xs font-medium uppercase text-sand-500">
                              {dict.workspace.applications.noteLabel}
                            </p>
                            <p className="whitespace-pre-wrap text-sand-700">
                              {row.decisionNote ?? '—'}
                            </p>
                          </div>
                        </div>

                        {canManage && (APPLICATION_NEXT[row.status] ?? []).length > 0 ? (
                          <form
                            onSubmit={(event) => {
                              event.preventDefault();
                              void submitStatus(row);
                            }}
                            className="flex flex-wrap items-end gap-3 rounded-lg border border-sand-200 bg-white p-3"
                          >
                            <div className="w-56">
                              <Select
                                label={dict.international.adminSetStatus}
                                value={formStatus}
                                onChange={(event) => {
                                  setFormStatus(event.target.value);
                                  setRowError(null);
                                }}
                              >
                                {(APPLICATION_NEXT[row.status] ?? []).map((option) => (
                                  <option key={option} value={option}>
                                    {dict.international.statuses[option]}
                                  </option>
                                ))}
                              </Select>
                            </div>
                            <div className="min-w-56 flex-1">
                              <Textarea
                                label={dict.workspace.applications.noteLabel}
                                rows={2}
                                maxLength={2000}
                                value={decisionNote}
                                onChange={(event) => setDecisionNote(event.target.value)}
                              />
                            </div>
                            <div className="flex items-center gap-2 pb-0.5">
                              <Button
                                type="submit"
                                size="sm"
                                loading={rowBusy}
                                disabled={!formStatus}
                              >
                                {dict.admin.actions.save}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => setOpenRow(null)}
                              >
                                {dict.common.cancel}
                              </Button>
                            </div>
                            {rowError ? (
                              <p role="alert" className="w-full text-sm text-red-700">
                                {rowError}
                              </p>
                            ) : null}
                          </form>
                        ) : null}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {rows ? (
        <ListPager
          meta={rows.meta}
          busy={list.busy}
          onPrev={() => setPage(page - 1)}
          onNext={() => setPage(page + 1)}
          labels={pagerLabels(dict)}
        />
      ) : null}
    </section>
  );
}

// ── Experience verification ────────────────────────────────────

function ExperiencesPanel({ locale, canManage }: { locale: LocaleCode; canManage: boolean }) {
  const { dict } = getDictionary(locale);
  const fail = useFail(locale);
  const [draft, setDraft] = useState({ verified: '', volunteerProfileId: '' });
  const [filters, setFilters] = useState({ verified: '', volunteerProfileId: '' });
  const [page, setPage] = useState(1);
  const list = usePagedList<IntlExperienceRow>(locale, '/admin/international/experiences', {
    page,
    limit: 10,
    ...filters,
  });
  const [notice, setNotice] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function apply(): void {
    setFilters(draft);
    setPage(1);
  }
  function clear(): void {
    const blank = { verified: '', volunteerProfileId: '' };
    setDraft(blank);
    setFilters(blank);
    setPage(1);
  }

  /** POST /admin/international/experiences/:id/verify — verify / un-verify. */
  async function setVerified(row: IntlExperienceRow, verified: boolean): Promise<void> {
    setBusyId(row.id);
    setRowError(null);
    setNotice(null);
    try {
      await api.post(`/admin/international/experiences/${row.id}/verify`, { verified });
      setNotice(
        verified ? dict.international.adminExperienceVerified : dict.international.adminActioned,
      );
      list.reload();
    } catch (cause) {
      const message = fail(cause);
      if (message) setRowError(message);
    } finally {
      setBusyId(null);
    }
  }

  const rows = list.rows;

  return (
    <section className="space-y-4">
      <FilterBar
        onApply={apply}
        onClear={clear}
        busy={list.busy}
        labels={{ apply: dict.admin.filters.apply, clear: dict.admin.filters.clear }}
      >
        <div className="w-52">
          <Select
            label={dict.common.status}
            value={draft.verified}
            onChange={(event) => setDraft({ ...draft, verified: event.target.value })}
          >
            <option value="">{dict.common.all}</option>
            <option value="true">{dict.common.verified}</option>
            <option value="false">{dict.international.selfDeclared}</option>
          </Select>
        </div>
        <div className="w-64">
          <Input
            label={dict.dashboard.statVolunteerId}
            value={draft.volunteerProfileId}
            onChange={(event) => setDraft({ ...draft, volunteerProfileId: event.target.value })}
          />
        </div>
      </FilterBar>

      <NoticeBar message={notice} />
      {list.error ? <Alert>{list.error}</Alert> : null}
      {rowError ? <Alert>{rowError}</Alert> : null}

      <Card className="overflow-x-auto p-0">
        {!rows ? (
          <p className="px-4 py-6 text-sm text-sand-500">{dict.common.loading}</p>
        ) : rows.items.length === 0 ? (
          <EmptyState className="m-4">{dict.common.empty}</EmptyState>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-sand-50">
                <th className={th}>{dict.workspace.hours.volunteerLabel}</th>
                <th className={th}>{dict.international.experienceOrg}</th>
                <th className={th}>{dict.international.experienceProgram}</th>
                <th className={th}>{dict.workspace.members.roleLabel}</th>
                <th className={th}>{dict.international.datesLabel}</th>
                <th className={th}>{dict.international.experienceHours}</th>
                <th className={th}>{dict.admin.columns.status}</th>
                <th className={th}>{dict.admin.columns.action}</th>
              </tr>
            </thead>
            <tbody>
              {rows.items.map((row) => (
                <tr key={row.id} className="border-t border-sand-100">
                  <td className={td}>
                    <VolunteerIdentityCell volunteer={row.volunteer} />
                  </td>
                  <td className={cn(td, 'font-medium text-sand-900')}>
                    {row.organizationName}
                    {safeExternalUrl(row.sourceUrl) ? (
                      <span className="block text-xs font-normal">
                        <a
                          href={safeExternalUrl(row.sourceUrl) ?? undefined}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-brand-700 underline hover:text-brand-800"
                        >
                          {dict.international.experienceUrl}
                        </a>
                      </span>
                    ) : null}
                  </td>
                  <td className={cn(td, 'text-sand-700')}>
                    {row.program}
                    {row.activity ? (
                      <p className="text-xs text-sand-500">
                        {dict.international.experienceActivity}: {row.activity}
                      </p>
                    ) : null}
                  </td>
                  <td className={cn(td, 'text-sand-700')}>{row.role ?? '—'}</td>
                  <td className={cn(td, 'whitespace-nowrap text-sand-600')}>
                    {formatDate(row.startDate, locale)}
                    {row.endDate ? ` – ${formatDate(row.endDate, locale)}` : ''}
                  </td>
                  <td className={cn(td, 'text-sand-700')}>{row.hours ?? '—'}</td>
                  <td className={td}>
                    {row.verified ? (
                      <Badge tone="success">{dict.common.verified}</Badge>
                    ) : (
                      <Badge tone="warning">{dict.international.selfDeclared}</Badge>
                    )}
                  </td>
                  <td className={td}>
                    {canManage ? (
                      <Button
                        size="sm"
                        variant={row.verified ? 'outline' : 'primary'}
                        loading={busyId === row.id}
                        onClick={() => void setVerified(row, !row.verified)}
                      >
                        {row.verified
                          ? dict.workspace.hours.revoke
                          : dict.international.adminExperienceVerify}
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {rows ? (
        <ListPager
          meta={rows.meta}
          busy={list.busy}
          onPrev={() => setPage(page - 1)}
          onNext={() => setPage(page + 1)}
          labels={pagerLabels(dict)}
        />
      ) : null}
    </section>
  );
}

// ── Shared cell ────────────────────────────────────────────────

/** Name + `email · volunteerId`, the way the local application list renders it. */
function VolunteerIdentityCell({ volunteer }: { volunteer: VolunteerIdentity }) {
  const first = volunteer.user?.firstName ?? '';
  const last = volunteer.user?.lastName ?? '';
  const name = `${first} ${last}`.trim();
  return (
    <div className="space-y-0.5">
      <span className="block font-medium text-sand-900">{name || volunteer.volunteerId}</span>
      <span className="block text-xs text-sand-500">
        {volunteer.user?.email ?? '—'}
        {volunteer.volunteerId ? ` · ${volunteer.volunteerId}` : ''}
      </span>
    </div>
  );
}
