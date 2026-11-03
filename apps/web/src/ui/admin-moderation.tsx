'use client';

import { Fragment, useState, type FormEvent, type ReactNode } from 'react';
import { REPORT_STATUSES, RISK_LEVELS, VERIFICATION_STATUSES } from '@bladna/types';
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
import { api } from '@/ui/api/client';
import { getDictionary, type LocaleCode, type Dictionary } from '@/ui/i18n';
import { badgeLabel, formatDateTime, formatNumber, formatDate } from '@/ui/format';
import { ListPager } from '@/ui/components/list-pager';
import { StatusBadge } from '@/ui/status';
import { FilterBar, NoticeBar, td, th, useFail, usePagedList } from './admin-shared';

// ── Row shapes ─────────────────────────────────────────────────

type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];
type ReportStatus = (typeof REPORT_STATUSES)[number];
type RiskLevel = (typeof RISK_LEVELS)[number];

interface BadgeLabels {
  code: string;
  labelAr: string;
  labelFr: string;
  labelEn: string;
}

interface VerifRow {
  id: string;
  level: string;
  status: VerificationStatus;
  submittedAt: string | Date;
  reviewedAt: string | Date | null;
  notes: string | null;
  rejectReason: string | null;
  expiresAt: string | Date | null;
  _count: { documents: number };
  organization: {
    id: string;
    name: string;
    slug: string;
    trustLevel: string;
    verificationStatus: string;
    badge: BadgeLabels;
  };
}

interface VerifDocument {
  id: string;
  label: string;
  status: string;
  createdAt: string | Date;
  document: {
    id: string;
    type: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    downloadUrl: string;
  };
}

interface VerifDetail {
  id: string;
  level: string;
  status: VerificationStatus;
  submittedAt: string | Date;
  reviewedAt: string | Date | null;
  notes: string | null;
  rejectReason: string | null;
  expiresAt: string | Date | null;
  organization: {
    id: string;
    name: string;
    legalName: string | null;
    officialEmail: string;
    phone: string | null;
    website: string | null;
    status: string;
    verificationStatus: string;
    trustLevel: string;
    badge: BadgeLabels;
  };
  documents: VerifDocument[];
}

interface ReportRow {
  id: string;
  targetType: string;
  targetId: string;
  reason: string;
  description: string | null;
  status: ReportStatus;
  assignedTo: { id: string; firstName: string; lastName: string } | null;
  resolution: string | null;
  createdAt: string | Date;
  resolvedAt: string | Date | null;
  reporter: { id: string; email: string; firstName: string; lastName: string } | null;
}

interface AssessmentRow {
  id: string;
  targetType: string;
  targetId: string;
  riskScore: number;
  riskLevel: RiskLevel;
  reasons: unknown;
  recommendedAction: string | null;
  engineVersion: string;
  decision: string | null;
  decisionNote: string | null;
  decidedAt: string | Date | null;
  createdAt: string | Date;
}

interface IncidentRow {
  id: string;
  type: string;
  severity: RiskLevel;
  status: string;
  title: string;
  reporter: { id: string; firstName: string; lastName: string } | null;
  assignedTo: { id: string; firstName: string; lastName: string } | null;
  createdAt: string | Date;
}

const REPORT_TARGET_TYPES = [
  'USER',
  'ORGANIZATION',
  'OPPORTUNITY',
  'CAMPAIGN',
  'MESSAGE',
  'CERTIFICATE',
] as const;

const REPORT_ACTIONS = ['NONE', 'RESTRICT', 'SUSPEND', 'REMOVE_CONTENT', 'WARN'] as const;

const RISK_TARGET_TYPES = ['USER', 'ORGANIZATION', 'OPPORTUNITY', 'CAMPAIGN', 'PAYMENT'] as const;
const RISK_DECISIONS = ['approve', 'restrict', 'suspend', 'override'] as const;
const INCIDENT_TYPES = ['SECURITY', 'FRAUD', 'ABUSE', 'SAFETY', 'MISCONDUCT', 'OTHER'] as const;
const INCIDENT_STATUSES = ['OPEN', 'INVESTIGATING', 'RESOLVED', 'CLOSED'] as const;

const VERIF_DECISIONS = ['VERIFIED', 'REJECTED', 'UNDER_REVIEW', 'REQUEST_INFO'] as const;

const pagerLabels = (dict: Dictionary) => ({
  page: dict.common.page,
  of: dict.common.of,
  previous: dict.common.previous,
  next: dict.common.next,
});

const fullName = (person: { firstName: string; lastName: string } | null): string =>
  person ? `${person.firstName} ${person.lastName}` : '—';

/** Reasons column: Prisma string[] or JSON, rendered as readable text. */
function reasonsText(reasons: unknown): string {
  if (reasons == null) return '—';
  if (typeof reasons === 'string') return reasons;
  if (Array.isArray(reasons)) {
    return reasons
      .map((entry) => (typeof entry === 'string' ? entry : JSON.stringify(entry)))
      .join(' · ');
  }
  if (typeof reasons === 'object') {
    return Object.entries(reasons as Record<string, unknown>)
      .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
      .join(' · ');
  }
  return String(reasons);
}

// ── Verification ───────────────────────────────────────────────

export function VerificationSection({ locale }: { locale: LocaleCode }) {
  const { dict } = getDictionary(locale);
  const fail = useFail(locale);
  const [draft, setDraft] = useState({ status: '' });
  const [filters, setFilters] = useState({ status: '' });
  const [page, setPage] = useState(1);
  const list = usePagedList<VerifRow>(locale, '/admin/verifications', {
    page,
    limit: 10,
    ...filters,
  });
  const [notice, setNotice] = useState<string | null>(null);
  const [detail, setDetail] = useState<VerifDetail | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);

  function apply(): void {
    setFilters(draft);
    setPage(1);
    setDetail(null);
  }
  function clear(): void {
    setDraft({ status: '' });
    setFilters({ status: '' });
    setPage(1);
    setDetail(null);
  }

  async function openDetail(id: string): Promise<void> {
    setDetailBusy(true);
    list.setError(null);
    try {
      const result = await api.get<{ verification: VerifDetail }>(
        `/admin/verifications/${encodeURIComponent(id)}`,
      );
      setDetail(result.data.verification);
    } catch (cause) {
      const message = fail(cause);
      if (message) list.setError(message);
    } finally {
      setDetailBusy(false);
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
        <div className="w-44">
          <Select
            label={dict.admin.filters.status}
            value={draft.status}
            onChange={(event) => setDraft({ status: event.target.value })}
          >
            <option value="">{dict.common.all}</option>
            {VERIFICATION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {dict.admin.verificationStatuses[status]}
              </option>
            ))}
          </Select>
        </div>
      </FilterBar>

      <NoticeBar message={notice} />
      {list.error ? <Alert>{list.error}</Alert> : null}

      <Card className="overflow-x-auto p-0">
        {!rows ? (
          <p className="px-4 py-6 text-sm text-sand-500">{dict.common.loading}</p>
        ) : rows.items.length === 0 ? (
          <EmptyState className="m-4">{dict.admin.queueEmpty}</EmptyState>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-sand-50">
                <th className={th}>{dict.admin.columns.organization}</th>
                <th className={th}>{dict.admin.columns.status}</th>
                <th className={th}>{dict.admin.levelLabel}</th>
                <th className={th}>{dict.admin.submittedLabel}</th>
                <th className={th}>{dict.admin.documentsLabel}</th>
                <th className={th}>{dict.admin.columns.action}</th>
              </tr>
            </thead>
            <tbody>
              {rows.items.map((row) => (
                <tr key={row.id} className="border-t border-sand-100">
                  <td className={cn(td, 'font-medium text-sand-900')}>
                    {row.organization.name}
                    <p className="mt-0.5">
                      <Badge tone="neutral">{badgeLabel(row.organization.badge, locale)}</Badge>
                    </p>
                  </td>
                  <td className={td}>
                    <StatusBadge
                      status={row.status}
                      label={dict.admin.verificationStatuses[row.status]}
                    />
                  </td>
                  <td className={cn(td, 'text-sand-600')}>
                    {dict.admin.trustLevels[row.level as keyof typeof dict.admin.trustLevels] ??
                      row.level}
                  </td>
                  <td className={cn(td, 'text-sand-600')}>
                    {formatDateTime(row.submittedAt, locale)}
                  </td>
                  <td className={td}>{row._count.documents}</td>
                  <td className={td}>
                    <Button
                      size="sm"
                      variant="outline"
                      loading={detailBusy && detail?.id !== row.id}
                      aria-expanded={detail?.id === row.id}
                      onClick={() => void openDetail(row.id)}
                    >
                      {dict.admin.actions.review}
                    </Button>
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

      {detail ? (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>{dict.admin.verificationTitle}</CardTitle>
            <Button size="sm" variant="ghost" onClick={() => setDetail(null)}>
              {dict.common.close}
            </Button>
          </div>

          <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-sand-500">{dict.admin.columns.organization}</dt>
              <dd className="font-medium text-sand-900">{detail.organization.name}</dd>
            </div>
            <div>
              <dt className="text-sand-500">{dict.admin.legalNameLabel}</dt>
              <dd className="text-sand-900">{detail.organization.legalName ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-sand-500">{dict.admin.columns.email}</dt>
              <dd className="text-sand-900">{detail.organization.officialEmail}</dd>
            </div>
            <div>
              <dt className="text-sand-500">{dict.admin.filters.status}</dt>
              <dd>
                <StatusBadge
                  status={detail.organization.verificationStatus}
                  label={badgeLabel(detail.organization.badge, locale)}
                />
              </dd>
            </div>
            <div>
              <dt className="text-sand-500">{dict.admin.levelLabel}</dt>
              <dd className="text-sand-900">
                {dict.admin.trustLevels[detail.level as keyof typeof dict.admin.trustLevels] ??
                  detail.level}
              </dd>
            </div>
            <div>
              <dt className="text-sand-500">{dict.admin.submittedLabel}</dt>
              <dd className="text-sand-900">{formatDateTime(detail.submittedAt, locale)}</dd>
            </div>
            {detail.notes ? (
              <div className="sm:col-span-2">
                <dt className="text-sand-500">{dict.admin.notesLabel}</dt>
                <dd className="whitespace-pre-wrap text-sand-900">{detail.notes}</dd>
              </div>
            ) : null}
            {detail.rejectReason ? (
              <div className="sm:col-span-2">
                <dt className="text-sand-500">{dict.admin.rejectReasonLabel}</dt>
                <dd className="text-sand-900">{detail.rejectReason}</dd>
              </div>
            ) : null}
            {detail.expiresAt ? (
              <div>
                <dt className="text-sand-500">{dict.admin.expiresLabel}</dt>
                <dd className="text-sand-900">{formatDate(detail.expiresAt, locale)}</dd>
              </div>
            ) : null}
          </dl>

          <div className="mt-4">
            <p className="text-sm font-medium text-sand-700">{dict.admin.evidenceTitle}</p>
            {detail.documents.length === 0 ? (
              <p className="mt-1 text-sm text-sand-500">{dict.admin.evidenceEmpty}</p>
            ) : (
              <ul className="mt-2 divide-y divide-sand-100 rounded-lg border border-sand-200">
                {detail.documents.map((doc) => (
                  <li
                    key={doc.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-sm"
                  >
                    <span className="font-medium text-sand-900">{doc.label}</span>
                    <span className="text-xs text-sand-500">
                      {dict.admin.evidenceType}: {doc.document.type} · {doc.document.fileName}
                    </span>
                    <span className="text-xs text-sand-500">
                      {dict.admin.evidenceSize}: {formatNumber(doc.document.sizeBytes, locale)} B
                    </span>
                    <a
                      href={doc.document.downloadUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="ms-auto text-sm font-semibold text-brand-700 hover:text-brand-800"
                    >
                      {dict.admin.evidenceOpen}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {detail.status === 'PENDING' || detail.status === 'UNDER_REVIEW' ? (
            <DecideForm
              key={detail.id}
              locale={locale}
              id={detail.id}
              initialLevel={detail.level}
              onDone={(message) => {
                setNotice(message);
                setDetail(null);
                list.reload();
              }}
            />
          ) : (
            <p className="mt-4 rounded-lg border border-sand-200 bg-sand-50 px-3 py-2 text-xs text-sand-600">
              {dict.admin.verificationStatuses[detail.status]}
            </p>
          )}
        </Card>
      ) : null}
    </section>
  );
}

function DecideForm({
  locale,
  id,
  initialLevel,
  onDone,
}: {
  locale: LocaleCode;
  id: string;
  initialLevel: string;
  onDone: (message: string) => void;
}) {
  const { dict } = getDictionary(locale);
  const fail = useFail(locale);
  const [decision, setDecision] = useState<(typeof VERIF_DECISIONS)[number]>('VERIFIED');
  const [level, setLevel] = useState(initialLevel);
  const [notes, setNotes] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (decision === 'REJECTED' && !rejectReason.trim()) {
      setError(dict.admin.reasonRequired);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post(`/admin/verifications/${encodeURIComponent(id)}/decide`, {
        decision,
        ...(level ? { level } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(decision === 'REJECTED' ? { rejectReason: rejectReason.trim() } : {}),
        ...(expiresAt ? { expiresAt } : {}),
      });
      onDone(dict.admin.actionDone);
    } catch (cause) {
      const message = fail(cause);
      if (message) setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="mt-4 space-y-3 rounded-lg border border-sand-200 bg-sand-50 p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label={dict.admin.columns.decision}
          value={decision}
          onChange={(event) => setDecision(event.target.value as (typeof VERIF_DECISIONS)[number])}
        >
          {VERIF_DECISIONS.map((option) => (
            <option key={option} value={option}>
              {dict.admin.verificationDecisions[option]}
            </option>
          ))}
        </Select>
        <Select
          label={dict.admin.levelLabel}
          value={level}
          onChange={(event) => setLevel(event.target.value)}
        >
          {(
            [
              'LEVEL_0_UNVERIFIED',
              'LEVEL_1_BASIC_VERIFIED',
              'LEVEL_2_ORGANIZATION_VERIFIED',
              'LEVEL_3_TRUSTED_PARTNER',
              'LEVEL_4_STRATEGIC_PARTNER',
            ] as const
          ).map((option) => (
            <option key={option} value={option}>
              {dict.admin.trustLevels[option]}
            </option>
          ))}
        </Select>
      </div>
      <Textarea
        label={dict.admin.notesLabel}
        rows={2}
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
      />
      {decision === 'REJECTED' ? (
        <Textarea
          label={dict.admin.rejectReasonLabel}
          required
          rows={2}
          value={rejectReason}
          onChange={(event) => setRejectReason(event.target.value)}
        />
      ) : null}
      <Input
        type="date"
        label={dict.admin.expiresLabel}
        value={expiresAt}
        onChange={(event) => setExpiresAt(event.target.value)}
      />
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" loading={busy}>
          {dict.admin.actions.decide}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </form>
  );
}

// ── Reports ────────────────────────────────────────────────────

export function ReportsSection({ locale }: { locale: LocaleCode }) {
  const { dict } = getDictionary(locale);
  const fail = useFail(locale);
  const [draft, setDraft] = useState({ status: '', targetType: '', assignedToMe: false });
  const [filters, setFilters] = useState({ status: '', targetType: '', assignedToMe: '' });
  const [page, setPage] = useState(1);
  const list = usePagedList<ReportRow>(locale, '/reports', { page, limit: 10, ...filters });
  const [notice, setNotice] = useState<string | null>(null);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState(false);

  function apply(): void {
    setFilters({
      status: draft.status,
      targetType: draft.targetType,
      assignedToMe: draft.assignedToMe ? 'true' : '',
    });
    setPage(1);
  }
  function clear(): void {
    setDraft({ status: '', targetType: '', assignedToMe: false });
    setFilters({ status: '', targetType: '', assignedToMe: '' });
    setPage(1);
  }

  async function submitReview(
    id: string,
    status: string,
    action: string,
    resolution: string,
  ): Promise<void> {
    setRowBusy(true);
    setNotice(null);
    try {
      await api.post(`/reports/${encodeURIComponent(id)}/review`, {
        status,
        action,
        ...(resolution ? { resolution } : {}),
      });
      setNotice(dict.admin.actionDone);
      setOpenRow(null);
      list.reload();
    } catch (cause) {
      const message = fail(cause);
      if (message) list.setError(message);
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
        <div className="w-44">
          <Select
            label={dict.admin.filters.status}
            value={draft.status}
            onChange={(event) => setDraft({ ...draft, status: event.target.value })}
          >
            <option value="">{dict.common.all}</option>
            {REPORT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {dict.admin.reportStatuses[status]}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-48">
          <Select
            label={dict.admin.columns.type}
            value={draft.targetType}
            onChange={(event) => setDraft({ ...draft, targetType: event.target.value })}
          >
            <option value="">{dict.common.all}</option>
            {REPORT_TARGET_TYPES.map((type) => (
              <option key={type} value={type}>
                {dict.admin.reportTargetTypes[type]}
              </option>
            ))}
          </Select>
        </div>
        <label className="flex h-10 items-center gap-2 pb-0.5 text-sm text-sand-700">
          <input
            type="checkbox"
            checked={draft.assignedToMe}
            onChange={(event) => setDraft({ ...draft, assignedToMe: event.target.checked })}
          />
          {dict.admin.columns.assignedTo}
        </label>
      </FilterBar>

      <NoticeBar message={notice} />
      {list.error ? <Alert>{list.error}</Alert> : null}

      <Card className="overflow-x-auto p-0">
        {!rows ? (
          <p className="px-4 py-6 text-sm text-sand-500">{dict.common.loading}</p>
        ) : rows.items.length === 0 ? (
          <EmptyState className="m-4">{dict.common.empty}</EmptyState>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-sand-50">
                <th className={th}>{dict.admin.columns.reason}</th>
                <th className={th}>{dict.admin.columns.type}</th>
                <th className={th}>{dict.admin.columns.status}</th>
                <th className={th}>{dict.admin.columns.reporter}</th>
                <th className={th}>{dict.common.createdAt}</th>
                <th className={th}>{dict.admin.columns.assignedTo}</th>
                <th className={th}>{dict.admin.columns.action}</th>
              </tr>
            </thead>
            <tbody>
              {rows.items.map((report) => (
                <Fragment key={report.id}>
                  <tr className="border-t border-sand-100">
                    <td className={cn(td, 'font-medium text-sand-900')}>
                      {dict.admin.reportReasons[
                        report.reason as keyof typeof dict.admin.reportReasons
                      ] ?? report.reason}
                      {report.resolution ? (
                        <p className="mt-0.5 max-w-56 text-xs font-normal text-sand-500">
                          {report.resolution}
                        </p>
                      ) : null}
                    </td>
                    <td className={td}>
                      <Badge tone="neutral">
                        {
                          dict.admin.reportTargetTypes[
                            report.targetType as keyof typeof dict.admin.reportTargetTypes
                          ]
                        }
                      </Badge>
                      <p className="mt-0.5 max-w-32 truncate font-mono text-xs text-sand-500">
                        {report.targetId}
                      </p>
                    </td>
                    <td className={td}>
                      <StatusBadge
                        status={report.status}
                        label={dict.admin.reportStatuses[report.status]}
                      />
                    </td>
                    <td className={td}>
                      {report.reporter ? (
                        <>
                          <span className="block text-sand-900">
                            {report.reporter.firstName} {report.reporter.lastName}
                          </span>
                          <span className="text-xs text-sand-500">{report.reporter.email}</span>
                        </>
                      ) : (
                        <span className="text-sand-400">—</span>
                      )}
                    </td>
                    <td className={cn(td, 'whitespace-nowrap text-sand-600')}>
                      {formatDateTime(report.createdAt, locale)}
                    </td>
                    <td className={cn(td, 'text-sand-600')}>{fullName(report.assignedTo)}</td>
                    <td className={td}>
                      <Button
                        size="sm"
                        variant="outline"
                        aria-expanded={openRow === report.id}
                        onClick={() => setOpenRow(openRow === report.id ? null : report.id)}
                      >
                        {dict.admin.actions.review}
                      </Button>
                    </td>
                  </tr>
                  {openRow === report.id ? (
                    <tr className="border-t border-sand-100 bg-sand-50">
                      <td colSpan={7} className="px-3 py-3">
                        <ReportReviewForm
                          key={report.id}
                          locale={locale}
                          targetType={report.targetType}
                          defaultStatus={report.status}
                          busy={rowBusy}
                          error={list.error}
                          onCancel={() => setOpenRow(null)}
                          onSubmit={(status, action, resolution) =>
                            void submitReview(report.id, status, action, resolution)
                          }
                        />
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

function ReportReviewForm({
  locale,
  targetType,
  defaultStatus,
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  locale: LocaleCode;
  targetType: string;
  defaultStatus: ReportStatus;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (status: string, action: string, resolution: string) => void;
}) {
  const { dict } = getDictionary(locale);
  const [status, setStatus] = useState<ReportStatus>(defaultStatus);
  const [action, setAction] = useState<(typeof REPORT_ACTIONS)[number]>('NONE');
  const [resolution, setResolution] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  // Server rule: REMOVE_CONTENT only applies to content targets.
  const actionOptions = REPORT_ACTIONS.filter(
    (option) =>
      option !== 'REMOVE_CONTENT' || (targetType !== 'USER' && targetType !== 'ORGANIZATION'),
  );

  function submit(event: FormEvent): void {
    event.preventDefault();
    if ((action !== 'NONE' || status === 'ACTION_TAKEN') && !resolution.trim()) {
      setLocalError(dict.admin.reasonRequired);
      return;
    }
    setLocalError(null);
    onSubmit(status, action, resolution.trim());
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-sand-200 bg-white p-3"
    >
      <div className="w-44">
        <Select
          label={dict.admin.filters.status}
          value={status}
          onChange={(event) => setStatus(event.target.value as ReportStatus)}
        >
          {REPORT_STATUSES.map((option) => (
            <option key={option} value={option}>
              {dict.admin.reportStatuses[option]}
            </option>
          ))}
        </Select>
      </div>
      <div className="w-48">
        <Select
          label={dict.admin.columns.action}
          value={action}
          onChange={(event) => setAction(event.target.value as (typeof REPORT_ACTIONS)[number])}
        >
          {actionOptions.map((option) => (
            <option key={option} value={option}>
              {dict.admin.reportActions[option]}
            </option>
          ))}
        </Select>
      </div>
      <div className="min-w-56 flex-1">
        <Textarea
          label={dict.admin.columns.resolution}
          rows={2}
          value={resolution}
          onChange={(event) => setResolution(event.target.value)}
        />
      </div>
      <div className="flex items-center gap-2 pb-0.5">
        <Button type="submit" size="sm" loading={busy}>
          {dict.admin.actions.decide}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          {dict.common.cancel}
        </Button>
      </div>
      {(localError ?? error) ? (
        <p role="alert" className="w-full text-sm text-red-700">
          {localError ?? error}
        </p>
      ) : null}
    </form>
  );
}

// ── Trust & risk ───────────────────────────────────────────────

type RiskView = 'queue' | 'signals' | 'incidents';

export function RiskSection({ locale }: { locale: LocaleCode }) {
  const { dict } = getDictionary(locale);
  const [view, setView] = useState<RiskView>('queue');

  const views: Array<{ id: RiskView; label: string }> = [
    { id: 'queue', label: dict.dashboard.moderationTitle },
    { id: 'signals', label: dict.admin.signalsTitle },
    { id: 'incidents', label: dict.admin.incidentsTitle },
  ];

  return (
    <section className="space-y-4">
      <TabsRoot active={view} onSelect={setView} className="space-y-4">
        <Tabs items={views} active={view} onSelect={setView} ariaLabel={dict.admin.tabs.risk} />

        <TabPanel id="queue" active={view}>
          <QueuePanel locale={locale} />
        </TabPanel>
        <TabPanel id="signals" active={view}>
          <SignalsPanel locale={locale} />
        </TabPanel>
        <TabPanel id="incidents" active={view}>
          <IncidentsPanel locale={locale} />
        </TabPanel>
      </TabsRoot>
    </section>
  );
}

function AssessmentTable({
  locale,
  rows,
  children,
}: {
  locale: LocaleCode;
  rows: AssessmentRow[];
  children?: (row: AssessmentRow) => ReactNode;
}) {
  const { dict } = getDictionary(locale);
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-sand-50">
          <th className={th}>{dict.admin.columns.type}</th>
          <th className={th}>{dict.admin.columns.score}</th>
          <th className={th}>{dict.admin.filters.riskLevel}</th>
          <th className={th}>{dict.admin.columns.reason}</th>
          <th className={th}>{dict.common.createdAt}</th>
          <th className={th}>{dict.admin.columns.decision}</th>
          {children ? <th className={th}>{dict.admin.columns.action}</th> : null}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <Fragment key={row.id}>
            <tr className="border-t border-sand-100 align-top">
              <td className={td}>
                <Badge tone="neutral">
                  {
                    dict.admin.riskTargetTypes[
                      row.targetType as keyof typeof dict.admin.riskTargetTypes
                    ]
                  }
                </Badge>
                <p className="mt-0.5 max-w-36 truncate font-mono text-xs text-sand-500">
                  {row.targetId}
                </p>
              </td>
              <td className={cn(td, 'font-semibold text-sand-900')}>{row.riskScore}</td>
              <td className={td}>
                <StatusBadge status={row.riskLevel} label={dict.admin.riskLevels[row.riskLevel]} />
              </td>
              <td className={cn(td, 'max-w-56 text-xs text-sand-600')}>
                {reasonsText(row.reasons)}
                {row.recommendedAction ? (
                  <p className="mt-0.5 font-mono text-xs text-sand-500">{row.recommendedAction}</p>
                ) : null}
              </td>
              <td className={cn(td, 'whitespace-nowrap text-sand-600')}>
                {formatDateTime(row.createdAt, locale)}
              </td>
              <td className={td}>
                {row.decision ? (
                  <Badge tone="info">
                    {dict.admin.riskDecisions[
                      row.decision as keyof typeof dict.admin.riskDecisions
                    ] ?? row.decision}
                  </Badge>
                ) : (
                  <span className="text-sand-400">—</span>
                )}
              </td>
              {children ? <td className={td}>{children(row)}</td> : null}
            </tr>
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}

function QueuePanel({ locale }: { locale: LocaleCode }) {
  const { dict } = getDictionary(locale);
  const fail = useFail(locale);
  const [draft, setDraft] = useState({ riskLevel: '', targetType: '' });
  const [filters, setFilters] = useState({ riskLevel: '', targetType: '' });
  const [page, setPage] = useState(1);
  const list = usePagedList<AssessmentRow>(locale, '/admin/moderation/queue', {
    page,
    limit: 10,
    ...filters,
  });
  const [notice, setNotice] = useState<string | null>(null);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState(false);

  function apply(): void {
    setFilters(draft);
    setPage(1);
  }
  function clear(): void {
    setDraft({ riskLevel: '', targetType: '' });
    setFilters({ riskLevel: '', targetType: '' });
    setPage(1);
  }

  async function decide(id: string, decision: string, note: string): Promise<void> {
    setRowBusy(true);
    setNotice(null);
    try {
      await api.post('/admin/risk/decisions', {
        assessmentId: id,
        decision,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      setNotice(dict.admin.actionDone);
      setOpenRow(null);
      list.reload();
    } catch (cause) {
      const message = fail(cause);
      if (message) list.setError(message);
    } finally {
      setRowBusy(false);
    }
  }

  const rows = list.rows;

  return (
    <div className="space-y-4">
      <FilterBar
        onApply={apply}
        onClear={clear}
        busy={list.busy}
        labels={{ apply: dict.admin.filters.apply, clear: dict.admin.filters.clear }}
      >
        <div className="w-40">
          <Select
            label={dict.admin.filters.riskLevel}
            value={draft.riskLevel}
            onChange={(event) => setDraft({ ...draft, riskLevel: event.target.value })}
          >
            <option value="">{dict.common.all}</option>
            {RISK_LEVELS.map((level) => (
              <option key={level} value={level}>
                {dict.admin.riskLevels[level]}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-48">
          <Select
            label={dict.admin.columns.type}
            value={draft.targetType}
            onChange={(event) => setDraft({ ...draft, targetType: event.target.value })}
          >
            <option value="">{dict.common.all}</option>
            {RISK_TARGET_TYPES.map((type) => (
              <option key={type} value={type}>
                {dict.admin.riskTargetTypes[type]}
              </option>
            ))}
          </Select>
        </div>
      </FilterBar>

      <NoticeBar message={notice} />
      {list.error ? <Alert>{list.error}</Alert> : null}

      <Card className="overflow-x-auto p-0">
        {!rows ? (
          <p className="px-4 py-6 text-sm text-sand-500">{dict.common.loading}</p>
        ) : rows.items.length === 0 ? (
          <EmptyState className="m-4">{dict.admin.queueEmpty}</EmptyState>
        ) : (
          <AssessmentTable locale={locale} rows={rows.items}>
            {(row) => (
              <Button
                size="sm"
                variant="outline"
                aria-expanded={openRow === row.id}
                onClick={() => setOpenRow(openRow === row.id ? null : row.id)}
              >
                {dict.admin.actions.decide}
              </Button>
            )}
          </AssessmentTable>
        )}
      </Card>

      {rows && openRow ? (
        <RiskDecisionForm
          key={openRow}
          locale={locale}
          busy={rowBusy}
          error={list.error}
          onCancel={() => setOpenRow(null)}
          onSubmit={(decision, note) => void decide(openRow, decision, note)}
        />
      ) : null}

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

function RiskDecisionForm({
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
  onSubmit: (decision: string, note: string) => void;
}) {
  const { dict } = getDictionary(locale);
  const [decision, setDecision] = useState<(typeof RISK_DECISIONS)[number]>('approve');
  const [note, setNote] = useState('');

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(decision, note);
      }}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-sand-200 bg-sand-50 p-3"
    >
      <div className="w-44">
        <Select
          label={dict.admin.columns.decision}
          value={decision}
          onChange={(event) => setDecision(event.target.value as (typeof RISK_DECISIONS)[number])}
        >
          {RISK_DECISIONS.map((option) => (
            <option key={option} value={option}>
              {dict.admin.riskDecisions[option]}
            </option>
          ))}
        </Select>
      </div>
      <div className="min-w-56 flex-1">
        <Textarea
          label={dict.admin.columns.resolution}
          rows={2}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>
      <div className="flex items-center gap-2 pb-0.5">
        <Button type="submit" size="sm" loading={busy}>
          {dict.admin.actions.decide}
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

function SignalsPanel({ locale }: { locale: LocaleCode }) {
  const { dict } = getDictionary(locale);
  const [page, setPage] = useState(1);
  // Note: `targetType` may not be sent alone (the API requires it paired with
  // targetId), so this read-only list is intentionally unfiltered.
  const list = usePagedList<AssessmentRow>(locale, '/admin/risk/signals', { page, limit: 10 });
  const rows = list.rows;

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold text-sand-900">{dict.admin.signalsTitle}</h3>
      {list.error ? <Alert>{list.error}</Alert> : null}
      <Card className="overflow-x-auto p-0">
        {!rows ? (
          <p className="px-4 py-6 text-sm text-sand-500">{dict.common.loading}</p>
        ) : rows.items.length === 0 ? (
          <EmptyState className="m-4">{dict.common.empty}</EmptyState>
        ) : (
          <AssessmentTable locale={locale} rows={rows.items} />
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

function IncidentsPanel({ locale }: { locale: LocaleCode }) {
  const { dict } = getDictionary(locale);
  const [draft, setDraft] = useState({ status: '', severity: '', type: '' });
  const [filters, setFilters] = useState({ status: '', severity: '', type: '' });
  const [page, setPage] = useState(1);
  const list = usePagedList<IncidentRow>(locale, '/admin/incidents', {
    page,
    limit: 10,
    ...filters,
  });
  const rows = list.rows;

  function apply(): void {
    setFilters(draft);
    setPage(1);
  }
  function clear(): void {
    setDraft({ status: '', severity: '', type: '' });
    setFilters({ status: '', severity: '', type: '' });
    setPage(1);
  }

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold text-sand-900">{dict.admin.incidentsTitle}</h3>

      <FilterBar
        onApply={apply}
        onClear={clear}
        busy={list.busy}
        labels={{ apply: dict.admin.filters.apply, clear: dict.admin.filters.clear }}
      >
        <div className="w-44">
          <Select
            label={dict.admin.filters.status}
            value={draft.status}
            onChange={(event) => setDraft({ ...draft, status: event.target.value })}
          >
            <option value="">{dict.common.all}</option>
            {INCIDENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {dict.admin.incidentStatuses[status]}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-40">
          <Select
            label={dict.admin.columns.severity}
            value={draft.severity}
            onChange={(event) => setDraft({ ...draft, severity: event.target.value })}
          >
            <option value="">{dict.common.all}</option>
            {RISK_LEVELS.map((level) => (
              <option key={level} value={level}>
                {dict.admin.riskLevels[level]}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-44">
          <Select
            label={dict.admin.columns.type}
            value={draft.type}
            onChange={(event) => setDraft({ ...draft, type: event.target.value })}
          >
            <option value="">{dict.common.all}</option>
            {INCIDENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {dict.admin.incidentTypes[type]}
              </option>
            ))}
          </Select>
        </div>
      </FilterBar>

      {list.error ? <Alert>{list.error}</Alert> : null}

      <Card className="overflow-x-auto p-0">
        {!rows ? (
          <p className="px-4 py-6 text-sm text-sand-500">{dict.common.loading}</p>
        ) : rows.items.length === 0 ? (
          <EmptyState className="m-4">{dict.common.empty}</EmptyState>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-sand-50">
                <th className={th}>{dict.admin.columns.type}</th>
                <th className={th}>{dict.admin.columns.severity}</th>
                <th className={th}>{dict.admin.columns.status}</th>
                <th className={th}>{dict.admin.columns.title}</th>
                <th className={th}>{dict.admin.columns.reporter}</th>
                <th className={th}>{dict.admin.columns.assignedTo}</th>
                <th className={th}>{dict.common.createdAt}</th>
              </tr>
            </thead>
            <tbody>
              {rows.items.map((incident) => (
                <tr key={incident.id} className="border-t border-sand-100">
                  <td className={td}>
                    <Badge tone="neutral">
                      {dict.admin.incidentTypes[
                        incident.type as keyof typeof dict.admin.incidentTypes
                      ] ?? incident.type}
                    </Badge>
                  </td>
                  <td className={td}>
                    <StatusBadge
                      status={incident.severity}
                      label={dict.admin.riskLevels[incident.severity]}
                    />
                  </td>
                  <td className={td}>
                    <StatusBadge
                      status={incident.status}
                      label={
                        dict.admin.incidentStatuses[
                          incident.status as keyof typeof dict.admin.incidentStatuses
                        ] ?? incident.status
                      }
                    />
                  </td>
                  <td className={cn(td, 'font-medium text-sand-900')}>{incident.title}</td>
                  <td className={cn(td, 'text-sand-600')}>{fullName(incident.reporter)}</td>
                  <td className={cn(td, 'text-sand-600')}>{fullName(incident.assignedTo)}</td>
                  <td className={cn(td, 'whitespace-nowrap text-sand-600')}>
                    {formatDateTime(incident.createdAt, locale)}
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
    </div>
  );
}
