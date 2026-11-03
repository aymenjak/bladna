'use client';

import { Fragment, useState, type FormEvent } from 'react';
import { Alert, Button, Card, CardTitle, EmptyState, Input, Select, cn } from '@bladna/ui';
import type { VerificationStatus } from '@bladna/types';
import { api } from '@/ui/api/client';
import { getDictionary, type Dictionary, type LocaleCode } from '@/ui/i18n';
import { formatDateTime } from '@/ui/format';
import { ListPager } from '@/ui/components/list-pager';
import { StatusBadge } from '@/ui/status';
import {
  ActionForm,
  FilterBar,
  NoticeBar,
  td,
  th,
  type ActionOption,
  useFail,
  usePagedList,
} from './admin-shared';

/**
 * Sponsors console section — the platform SaaS surface for sponsor accounts
 * (server/modules/sponsors.ts): list all statuses, create a sponsor (PENDING),
 * edit workspace fields, and drive the PENDING/ACTIVE/SUSPENDED/ARCHIVED state
 * machine. Read rides `sponsor.read:platform`, every write re-checks
 * `sponsor.manage` server-side; SUSPEND requires a reason there and here.
 */

type SponsorStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';

const pagerLabels = (dict: Dictionary) => ({
  page: dict.common.page,
  of: dict.common.of,
  previous: dict.common.previous,
  next: dict.common.next,
});

const SPONSOR_STATUSES: SponsorStatus[] = ['PENDING', 'ACTIVE', 'SUSPENDED', 'ARCHIVED'];

/** Mirrors SPONSOR_WORKSPACE_SELECT (public select + legal/contact/audit). */
interface SponsorRow {
  id: string;
  commercialName: string;
  slug: string;
  description: string | null;
  website: string | null;
  industry: string | null;
  status: SponsorStatus;
  legalName: string;
  contactEmail: string;
  contactPhone: string | null;
  verificationStatus: VerificationStatus;
  updatedAt: string | Date;
}

interface SponsorForm {
  legalName: string;
  commercialName: string;
  contactEmail: string;
  contactPhone: string;
  website: string;
  industry: string;
  description: string;
}

const EMPTY_FORM: SponsorForm = {
  legalName: '',
  commercialName: '',
  contactEmail: '',
  contactPhone: '',
  website: '',
  industry: '',
  description: '',
};

const SPONSOR_REASON_REQUIRED: ReadonlySet<string> = new Set(['SUSPEND']);

export function SponsorsSection({ locale, canManage }: { locale: LocaleCode; canManage: boolean }) {
  const { dict } = getDictionary(locale);
  const fail = useFail(locale);
  const [draft, setDraft] = useState({ q: '', status: '' });
  const [filters, setFilters] = useState({ q: '', status: '' });
  const [page, setPage] = useState(1);
  const list = usePagedList<SponsorRow>(locale, '/admin/sponsors', {
    page,
    limit: 10,
    ...filters,
  });
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState<SponsorForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState(false);

  function apply(): void {
    setFilters(draft);
    setPage(1);
  }
  function clear(): void {
    setDraft({ q: '', status: '' });
    setFilters({ q: '', status: '' });
    setPage(1);
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setFormBusy(true);
    setFormError(null);
    setNotice(null);
    try {
      const payload = {
        legalName: form.legalName.trim(),
        commercialName: form.commercialName.trim(),
        contactEmail: form.contactEmail.trim(),
        ...(form.contactPhone.trim() ? { contactPhone: form.contactPhone.trim() } : {}),
        ...(form.website.trim() ? { website: form.website.trim() } : {}),
        ...(form.industry.trim() ? { industry: form.industry.trim() } : {}),
        ...(form.description.trim() ? { description: form.description.trim() } : {}),
      };
      if (editingId) await api.patch(`/admin/sponsors/${editingId}`, payload);
      else await api.post('/admin/sponsors', payload);
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

  function startEdit(row: SponsorRow): void {
    setEditingId(row.id);
    setForm({
      legalName: row.legalName,
      commercialName: row.commercialName,
      contactEmail: row.contactEmail,
      contactPhone: row.contactPhone ?? '',
      website: row.website ?? '',
      industry: row.industry ?? '',
      description: row.description ?? '',
    });
    setFormError(null);
  }

  function cancelEdit(): void {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  async function runAction(id: string, action: string, reason: string): Promise<void> {
    setRowBusy(true);
    setNotice(null);
    try {
      await api.post(`/admin/sponsors/${id}/status`, {
        action,
        ...(reason ? { reason } : {}),
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

  const options: ActionOption[] = [
    { value: 'ACTIVATE', label: dict.admin.sponsorAdmin.statusActions.ACTIVATE },
    { value: 'SUSPEND', label: dict.admin.sponsorAdmin.statusActions.SUSPEND },
    { value: 'ARCHIVE', label: dict.admin.sponsorAdmin.statusActions.ARCHIVE },
    { value: 'RESTORE', label: dict.admin.sponsorAdmin.statusActions.RESTORE },
  ];

  const rows = list.rows;
  const submitLabel = editingId ? dict.admin.actions.save : dict.admin.sponsorAdmin.create;

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
        <div className="w-44">
          <Select
            label={dict.admin.filters.status}
            value={draft.status}
            onChange={(event) => setDraft({ ...draft, status: event.target.value })}
          >
            <option value="">{dict.common.all}</option>
            {SPONSOR_STATUSES.map((status) => (
              <option key={status} value={status}>
                {dict.admin.sponsorAdmin.statuses[status]}
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
          <form onSubmit={(event) => void submit(event)} className="mt-3 space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Input
                label={dict.admin.sponsorAdmin.legalName}
                required
                value={form.legalName}
                onChange={(event) => setForm({ ...form, legalName: event.target.value })}
              />
              <Input
                label={dict.admin.sponsorAdmin.commercialName}
                required
                value={form.commercialName}
                onChange={(event) => setForm({ ...form, commercialName: event.target.value })}
              />
              <Input
                label={dict.admin.sponsorAdmin.contactEmail}
                required
                type="email"
                value={form.contactEmail}
                onChange={(event) => setForm({ ...form, contactEmail: event.target.value })}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Input
                label={dict.admin.sponsorAdmin.contactPhone}
                value={form.contactPhone}
                onChange={(event) => setForm({ ...form, contactPhone: event.target.value })}
              />
              <Input
                label={dict.admin.sponsorAdmin.website}
                type="url"
                value={form.website}
                onChange={(event) => setForm({ ...form, website: event.target.value })}
              />
              <Input
                label={dict.admin.sponsorAdmin.industry}
                value={form.industry}
                onChange={(event) => setForm({ ...form, industry: event.target.value })}
              />
            </div>
            <Input
              label={dict.common.description}
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
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
          <EmptyState className="m-4">{dict.common.empty}</EmptyState>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-sand-50">
                <th className={th}>{dict.admin.columns.name}</th>
                <th className={th}>{dict.admin.legalNameLabel}</th>
                <th className={th}>{dict.admin.columns.email}</th>
                <th className={th}>{dict.admin.columns.status}</th>
                <th className={th}>{dict.admin.filters.verificationStatus}</th>
                <th className={th}>{dict.admin.columns.updatedAt}</th>
                <th className={th}>{dict.admin.columns.action}</th>
              </tr>
            </thead>
            <tbody>
              {rows.items.map((row) => (
                <Fragment key={row.id}>
                  <tr className="border-t border-sand-100">
                    <td className={cn(td, 'font-medium')}>{row.commercialName}</td>
                    <td className={cn(td, 'text-sand-700')}>{row.legalName}</td>
                    <td className={cn(td, 'text-sand-600')}>{row.contactEmail}</td>
                    <td className={td}>
                      <StatusBadge
                        status={row.status}
                        label={dict.admin.sponsorAdmin.statuses[row.status]}
                      />
                    </td>
                    <td className={td}>
                      <StatusBadge
                        status={row.verificationStatus}
                        label={dict.admin.verificationStatuses[row.verificationStatus]}
                      />
                    </td>
                    <td className={cn(td, 'text-sand-600')}>
                      {formatDateTime(row.updatedAt, locale)}
                    </td>
                    <td className={td}>
                      {canManage ? (
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" onClick={() => startEdit(row)}>
                            {dict.admin.actions.edit}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setOpenRow(openRow === row.id ? null : row.id)}
                          >
                            {dict.admin.columns.action}
                          </Button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                  {canManage && openRow === row.id ? (
                    <tr className="border-t border-sand-100 bg-sand-50">
                      <td colSpan={7} className="px-3 py-3">
                        <ActionForm
                          actionLabel={dict.admin.columns.action}
                          options={options}
                          requireReason={SPONSOR_REASON_REQUIRED}
                          labels={{
                            reason: dict.admin.reasonLabel,
                            hint: dict.admin.reasonHint,
                            required: dict.admin.reasonRequired,
                            cancel: dict.common.cancel,
                          }}
                          busy={rowBusy}
                          error={list.error}
                          onCancel={() => setOpenRow(null)}
                          onSubmit={(action, reason) => void runAction(row.id, action, reason)}
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
    </div>
  );
}
