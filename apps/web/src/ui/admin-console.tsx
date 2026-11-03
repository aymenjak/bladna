'use client';

import { Fragment, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { canTransition, OPPORTUNITY_TRANSITIONS } from '@bladna/domain';
import {
  OPPORTUNITY_STATUSES,
  ORGANIZATION_STATUSES,
  ORGANIZATION_TYPES,
  SYSTEM_ROLES,
  USER_STATUSES,
  type SystemRole,
} from '@bladna/types';
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
import { getDictionary, type LocaleCode } from '@/ui/i18n';
import { badgeLabel, formatDate, formatDateTime } from '@/ui/format';
import { titleFor } from '@/ui/opportunity';
import { ListPager } from '@/ui/components/list-pager';
import { StatusBadge } from '@/ui/status';
import type { AdminSectionId } from '@/server/admin-access';
import { ReportsSection, RiskSection, VerificationSection } from './admin-moderation';
import { ContentSection } from './admin-content';
import { InternationalSection } from './admin-international';
import { SponsorsSection } from './admin-sponsors';
import { ExportsSection } from './components/admin-exports';
import { PaymentsSection } from './components/admin-payments';
import {
  ActionForm,
  FilterBar,
  NoticeBar,
  td,
  th,
  useFail,
  usePagedList,
  type ActionOption,
} from './admin-shared';

// ── Row shapes (mirror the module SELECTs) ─────────────────────

type UserStatus = (typeof USER_STATUSES)[number];
type OrgStatus = (typeof ORGANIZATION_STATUSES)[number];
type OrgType = (typeof ORGANIZATION_TYPES)[number];
type OppStatus = (typeof OPPORTUNITY_STATUSES)[number];

interface UserRow {
  id: string;
  email: string;
  phone: string | null;
  firstName: string;
  lastName: string;
  roles: string[];
  status: UserStatus;
  lastLoginAt: string | Date | null;
  suspendReason: string | null;
  suspendedUntil: string | Date | null;
  createdAt: string | Date;
  _count: { sessions: number; memberships: number };
}

interface AdminOrgRow {
  id: string;
  name: string;
  legalName: string | null;
  organizationType: OrgType;
  status: OrgStatus;
  verificationStatus: string;
  trustLevel: string;
  createdAt: string | Date;
  _count: { members: number; opportunities: number };
  badge: { code: string; labelAr: string; labelFr: string; labelEn: string };
}

interface AdminOppRow {
  id: string;
  slug: string;
  titleAr: string;
  titleFr: string;
  titleEn: string;
  status: OppStatus;
  applicationDeadline: string | Date | null;
  viewCount: number;
  applicationCount: number;
  createdAt: string | Date;
  organization: {
    id: string;
    name: string;
    slug: string;
    badge: { code: string; labelAr: string; labelFr: string; labelEn: string };
  };
}

interface AuditRow {
  id: string;
  actor: { id: string; firstName: string; lastName: string; email: string } | null;
  actorUserId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: unknown;
  ipAddress: string | null;
  createdAt: string | Date;
}

interface SettingRow {
  key: string;
  scope: string;
  value: unknown;
  updatedAt: string | Date;
}

interface FlagRow {
  key: string;
  description: string | null;
  enabled: boolean;
  rollout: number;
  updatedAt: string | Date;
}

const USER_REASON_REQUIRED = new Set(['SUSPEND', 'BAN']);
const ORG_REASON_REQUIRED = new Set(['SUSPEND']);
const OPP_REASON_REQUIRED = new Set(['REJECT', 'SUSPEND']);

/** Admin action → target status (mirrors ADMIN_ACTION_TARGET on the server). */
const OPP_ACTION_TARGET: Record<string, OppStatus> = {
  PUBLISH: 'PUBLISHED',
  REJECT: 'REJECTED',
  SUSPEND: 'SUSPENDED',
  RESTORE: 'PUBLISHED',
};

const pagerLabels = (dict: {
  common: { page: string; of: string; previous: string; next: string };
}) => ({
  page: dict.common.page,
  of: dict.common.of,
  previous: dict.common.previous,
  next: dict.common.next,
});

// ── Shell ──────────────────────────────────────────────────────

/**
 * Console shell: tab bar limited to GRANTED sections (server-computed), each
 * tab renders its panel which fetches its own data with display-only action
 * gating via `perms`. Selecting a tab pushes the `/admin/{section}` sub-route
 * so reload/back/deep links keep state — the server revalidates the grant on
 * every load (an ungranted or unknown section canonicalises to the first
 * granted one).
 */
export function AdminConsole({
  locale,
  section,
  sections,
  perms,
}: {
  locale: LocaleCode;
  section: AdminSectionId;
  sections: AdminSectionId[];
  perms: string[];
}) {
  const { dict } = getDictionary(locale);
  const router = useRouter();
  const [active, setActive] = useState<AdminSectionId>(section);

  useEffect(() => setActive(section), [section]);

  function selectTab(id: AdminSectionId): void {
    setActive(id);
    router.push(`/${locale}/admin/${id}`, { scroll: false });
  }

  const tabLabels = dict.admin.tabs;

  return (
    <div className="space-y-6">
      <TabsRoot active={active} onSelect={selectTab} className="space-y-6">
        <Tabs
          items={sections.map((id) => ({ id, label: tabLabels[id] }))}
          active={active}
          onSelect={selectTab}
          ariaLabel={dict.admin.title}
        />

        <TabPanel id={active} active={active}>
          {active === 'users' ? (
            <UsersSection locale={locale} canAct={perms.includes('user.suspend')} />
          ) : null}
          {active === 'organizations' ? (
            <OrganizationsSection locale={locale} canAct={perms.includes('organization.suspend')} />
          ) : null}
          {active === 'sponsors' ? (
            <SponsorsSection locale={locale} canManage={perms.includes('sponsor.manage')} />
          ) : null}
          {active === 'opportunities' ? (
            <OpportunitiesSection locale={locale} canAct={perms.includes('opportunity.moderate')} />
          ) : null}
          {active === 'international' ? (
            <InternationalSection locale={locale} canManage={perms.includes('content.manage')} />
          ) : null}
          {active === 'verification' ? <VerificationSection locale={locale} /> : null}
          {active === 'reports' ? <ReportsSection locale={locale} /> : null}
          {active === 'risk' ? <RiskSection locale={locale} /> : null}
          {active === 'audit' ? <AuditSection locale={locale} /> : null}
          {active === 'content' ? (
            <ContentSection locale={locale} canManage={perms.includes('content.manage')} />
          ) : null}
          {active === 'settings' ? (
            <SettingsSection locale={locale} canManage={perms.includes('admin.settings.manage')} />
          ) : null}
          {active === 'flags' ? (
            <FlagsSection locale={locale} canManage={perms.includes('featureflag.manage')} />
          ) : null}
          {active === 'exports' ? <ExportsSection locale={locale} /> : null}
          {active === 'billing' ? (
            <PaymentsSection locale={locale} canManage={perms.includes('payment.manage')} />
          ) : null}
        </TabPanel>
      </TabsRoot>
    </div>
  );
}

// ── Users ──────────────────────────────────────────────────────

function UsersSection({ locale, canAct }: { locale: LocaleCode; canAct: boolean }) {
  const { dict } = getDictionary(locale);
  const fail = useFail(locale);
  const [draft, setDraft] = useState({ q: '', status: '', role: '' });
  const [filters, setFilters] = useState({ q: '', status: '', role: '' });
  const [page, setPage] = useState(1);
  const list = usePagedList<UserRow>(locale, '/admin/users', { page, limit: 10, ...filters });
  const [notice, setNotice] = useState<string | null>(null);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState(false);

  function apply(): void {
    setFilters(draft);
    setPage(1);
  }
  function clear(): void {
    const blank = { q: '', status: '', role: '' };
    setDraft(blank);
    setFilters(blank);
    setPage(1);
  }

  async function runAction(id: string, action: string, reason: string): Promise<void> {
    setRowBusy(true);
    setNotice(null);
    try {
      await api.post(`/admin/users/${id}/action`, { action, ...(reason ? { reason } : {}) });
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
    { value: 'SUSPEND', label: dict.admin.actions.suspend },
    { value: 'BAN', label: dict.admin.actions.ban },
    { value: 'REINSTATE', label: dict.admin.actions.reinstate },
    { value: 'FORCE_LOGOUT', label: dict.admin.actions.forceLogout },
  ];
  const rows = list.rows;

  return (
    <section className="space-y-4">
      <p className="text-xs text-sand-500">{dict.admin.changeRoleOmitted}</p>

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
            {USER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {dict.admin.userStatuses[status]}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-52">
          <Select
            label={dict.admin.filters.role}
            value={draft.role}
            onChange={(event) => setDraft({ ...draft, role: event.target.value })}
          >
            <option value="">{dict.common.all}</option>
            {SYSTEM_ROLES.map((role) => (
              <option key={role} value={role}>
                {dict.admin.roles[role as SystemRole] ?? role}
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
          <EmptyState className="m-4">{dict.common.empty}</EmptyState>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-sand-50">
                <th className={th}>{dict.admin.columns.name}</th>
                <th className={th}>{dict.admin.columns.email}</th>
                <th className={th}>{dict.admin.columns.status}</th>
                <th className={th}>{dict.admin.columns.roles}</th>
                <th className={th}>{dict.admin.columns.lastLogin}</th>
                <th className={th}>{dict.admin.columns.joinedAt}</th>
                <th className={th}>{dict.admin.columns.sessions}</th>
                <th className={th}>{dict.admin.columns.action}</th>
              </tr>
            </thead>
            <tbody>
              {rows.items.map((user) => (
                <Fragment key={user.id}>
                  <tr className="border-t border-sand-100">
                    <td className={cn(td, 'font-medium text-sand-900')}>
                      {user.firstName} {user.lastName}
                    </td>
                    <td className={td}>{user.email}</td>
                    <td className={td}>
                      <StatusBadge
                        status={user.status}
                        label={dict.admin.userStatuses[user.status]}
                      />
                      {user.suspendReason ? (
                        <p className="mt-1 max-w-48 text-xs text-sand-500">
                          {dict.admin.reasonLabel}: {user.suspendReason}
                        </p>
                      ) : null}
                    </td>
                    <td className={td}>
                      <div className="flex flex-wrap gap-1">
                        {user.roles.map((role) => (
                          <Badge key={role} tone="neutral">
                            {dict.admin.roles[role as SystemRole] ?? role}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className={cn(td, 'text-sand-600')}>
                      {formatDate(user.lastLoginAt, locale)}
                    </td>
                    <td className={cn(td, 'text-sand-600')}>
                      {formatDate(user.createdAt, locale)}
                    </td>
                    <td className={td}>{user._count.sessions}</td>
                    <td className={td}>
                      {canAct ? (
                        <Button
                          size="sm"
                          variant="outline"
                          aria-expanded={openRow === user.id}
                          onClick={() => setOpenRow(openRow === user.id ? null : user.id)}
                        >
                          {dict.admin.columns.action}
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                  {canAct && openRow === user.id ? (
                    <tr className="border-t border-sand-100 bg-sand-50">
                      <td colSpan={8} className="px-3 py-3">
                        <ActionForm
                          actionLabel={dict.admin.columns.action}
                          options={options}
                          requireReason={USER_REASON_REQUIRED}
                          labels={{
                            reason: dict.admin.reasonLabel,
                            hint: dict.admin.reasonHint,
                            required: dict.admin.reasonRequired,
                            cancel: dict.common.cancel,
                          }}
                          busy={rowBusy}
                          error={list.error}
                          onCancel={() => setOpenRow(null)}
                          onSubmit={(action, reason) => void runAction(user.id, action, reason)}
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

// ── Organizations ──────────────────────────────────────────────

function OrganizationsSection({ locale, canAct }: { locale: LocaleCode; canAct: boolean }) {
  const { dict } = getDictionary(locale);
  const fail = useFail(locale);
  const [draft, setDraft] = useState({
    q: '',
    status: '',
    verificationStatus: '',
    organizationType: '',
  });
  const [filters, setFilters] = useState({
    q: '',
    status: '',
    verificationStatus: '',
    organizationType: '',
  });
  const [page, setPage] = useState(1);
  const list = usePagedList<AdminOrgRow>(locale, '/admin/organizations', {
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
    const blank = { q: '', status: '', verificationStatus: '', organizationType: '' };
    setDraft(blank);
    setFilters(blank);
    setPage(1);
  }

  async function runAction(id: string, action: string, reason: string): Promise<void> {
    setRowBusy(true);
    setNotice(null);
    try {
      await api.post(`/admin/organizations/${id}/action`, {
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
    { value: 'SUSPEND', label: dict.admin.actions.suspend },
    { value: 'RESTORE', label: dict.admin.actions.restore },
  ];
  const rows = list.rows;

  return (
    <section className="space-y-4">
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
            {ORGANIZATION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {dict.admin.orgStatuses[status]}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-44">
          <Select
            label={dict.admin.filters.verificationStatus}
            value={draft.verificationStatus}
            onChange={(event) => setDraft({ ...draft, verificationStatus: event.target.value })}
          >
            <option value="">{dict.common.all}</option>
            {(
              ['PENDING', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'SUSPENDED', 'EXPIRED'] as const
            ).map((status) => (
              <option key={status} value={status}>
                {dict.admin.verificationStatuses[status]}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-52">
          <Select
            label={dict.admin.filters.organizationType}
            value={draft.organizationType}
            onChange={(event) => setDraft({ ...draft, organizationType: event.target.value })}
          >
            <option value="">{dict.common.all}</option>
            {ORGANIZATION_TYPES.map((type) => (
              <option key={type} value={type}>
                {dict.organizations.types[type]}
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
          <EmptyState className="m-4">{dict.common.empty}</EmptyState>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-sand-50">
                <th className={th}>{dict.admin.columns.name}</th>
                <th className={th}>{dict.admin.filters.organizationType}</th>
                <th className={th}>{dict.admin.columns.status}</th>
                <th className={th}>{dict.admin.filters.verificationStatus}</th>
                <th className={th}>{dict.admin.columns.trustLevel}</th>
                <th className={th}>{dict.admin.columns.members}</th>
                <th className={th}>{dict.admin.columns.opportunities}</th>
                <th className={th}>{dict.admin.columns.action}</th>
              </tr>
            </thead>
            <tbody>
              {rows.items.map((org) => (
                <Fragment key={org.id}>
                  <tr className="border-t border-sand-100">
                    <td className={cn(td, 'font-medium text-sand-900')}>
                      {org.name}
                      {org.legalName && org.legalName !== org.name ? (
                        <p className="text-xs font-normal text-sand-500">{org.legalName}</p>
                      ) : null}
                    </td>
                    <td className={td}>{dict.organizations.types[org.organizationType]}</td>
                    <td className={td}>
                      <StatusBadge status={org.status} label={dict.admin.orgStatuses[org.status]} />
                    </td>
                    <td className={td}>
                      <StatusBadge
                        status={org.verificationStatus}
                        label={badgeLabel(org.badge, locale)}
                      />
                    </td>
                    <td className={cn(td, 'text-sand-600')}>
                      {dict.admin.trustLevels[
                        org.trustLevel as keyof typeof dict.admin.trustLevels
                      ] ?? org.trustLevel}
                    </td>
                    <td className={td}>{org._count.members}</td>
                    <td className={td}>{org._count.opportunities}</td>
                    <td className={td}>
                      {canAct ? (
                        <Button
                          size="sm"
                          variant="outline"
                          aria-expanded={openRow === org.id}
                          onClick={() => setOpenRow(openRow === org.id ? null : org.id)}
                        >
                          {dict.admin.columns.action}
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                  {canAct && openRow === org.id ? (
                    <tr className="border-t border-sand-100 bg-sand-50">
                      <td colSpan={8} className="px-3 py-3">
                        <ActionForm
                          actionLabel={dict.admin.columns.action}
                          options={options}
                          requireReason={ORG_REASON_REQUIRED}
                          labels={{
                            reason: dict.admin.reasonLabel,
                            hint: dict.admin.reasonHint,
                            required: dict.admin.reasonRequired,
                            cancel: dict.common.cancel,
                          }}
                          busy={rowBusy}
                          error={list.error}
                          onCancel={() => setOpenRow(null)}
                          onSubmit={(action, reason) => void runAction(org.id, action, reason)}
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

// ── Opportunities ──────────────────────────────────────────────

function OpportunitiesSection({ locale, canAct }: { locale: LocaleCode; canAct: boolean }) {
  const { dict } = getDictionary(locale);
  const fail = useFail(locale);
  const [draft, setDraft] = useState({ q: '', status: '' });
  const [filters, setFilters] = useState({ q: '', status: '' });
  const [page, setPage] = useState(1);
  const list = usePagedList<AdminOppRow>(locale, '/admin/opportunities', {
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
    const blank = { q: '', status: '' };
    setDraft(blank);
    setFilters(blank);
    setPage(1);
  }

  async function runAction(id: string, action: string, reason: string): Promise<void> {
    setRowBusy(true);
    setNotice(null);
    try {
      await api.post(`/admin/opportunities/${id}/action`, {
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
    { value: 'PUBLISH', label: dict.admin.actions.publish },
    { value: 'REJECT', label: dict.admin.actions.reject },
    { value: 'SUSPEND', label: dict.admin.actions.suspend },
    { value: 'RESTORE', label: dict.admin.actions.restore },
  ];
  /** Only the actions the state machine allows from this row's status —
      e.g. DRAFT rows wait for the organization to submit them for review. */
  const legalOptions = (status: OppStatus): ActionOption[] =>
    options.filter((option) =>
      canTransition(OPPORTUNITY_TRANSITIONS, status, OPP_ACTION_TARGET[option.value]),
    );
  const rows = list.rows;

  return (
    <section className="space-y-4">
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
            {OPPORTUNITY_STATUSES.map((status) => (
              <option key={status} value={status}>
                {dict.admin.opportunityStatuses[status]}
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
          <EmptyState className="m-4">{dict.common.empty}</EmptyState>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-sand-50">
                <th className={th}>{dict.admin.columns.title}</th>
                <th className={th}>{dict.admin.columns.organization}</th>
                <th className={th}>{dict.admin.columns.status}</th>
                <th className={th}>{dict.common.deadline}</th>
                <th className={th}>{dict.common.views}</th>
                <th className={th}>{dict.common.applicants}</th>
                <th className={th}>{dict.admin.columns.action}</th>
              </tr>
            </thead>
            <tbody>
              {rows.items.map((opportunity) => {
                const rowOptions = legalOptions(opportunity.status);
                return (
                  <Fragment key={opportunity.id}>
                    <tr className="border-t border-sand-100">
                      <td className={cn(td, 'font-medium text-sand-900')}>
                        {titleFor(opportunity, locale)}
                      </td>
                      <td className={td}>
                        <span className="block">{opportunity.organization.name}</span>
                        <Badge tone="neutral">
                          {badgeLabel(opportunity.organization.badge, locale)}
                        </Badge>
                      </td>
                      <td className={td}>
                        <StatusBadge
                          status={opportunity.status}
                          label={dict.admin.opportunityStatuses[opportunity.status]}
                        />
                      </td>
                      <td className={cn(td, 'text-sand-600')}>
                        {formatDate(opportunity.applicationDeadline, locale)}
                      </td>
                      <td className={td}>{opportunity.viewCount}</td>
                      <td className={td}>{opportunity.applicationCount}</td>
                      <td className={td}>
                        {canAct && rowOptions.length > 0 ? (
                          <Button
                            size="sm"
                            variant="outline"
                            aria-expanded={openRow === opportunity.id}
                            onClick={() =>
                              setOpenRow(openRow === opportunity.id ? null : opportunity.id)
                            }
                          >
                            {dict.admin.columns.action}
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                    {canAct && rowOptions.length > 0 && openRow === opportunity.id ? (
                      <tr className="border-t border-sand-100 bg-sand-50">
                        <td colSpan={7} className="px-3 py-3">
                          <ActionForm
                            actionLabel={dict.admin.columns.action}
                            options={rowOptions}
                            requireReason={OPP_REASON_REQUIRED}
                            labels={{
                              reason: dict.admin.reasonLabel,
                              hint: dict.admin.reasonHint,
                              required: dict.admin.reasonRequired,
                              cancel: dict.common.cancel,
                            }}
                            busy={rowBusy}
                            error={list.error}
                            onCancel={() => setOpenRow(null)}
                            onSubmit={(action, reason) =>
                              void runAction(opportunity.id, action, reason)
                            }
                          />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
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

// ── Audit ──────────────────────────────────────────────────────

function AuditSection({ locale }: { locale: LocaleCode }) {
  const { dict } = getDictionary(locale);
  const [draft, setDraft] = useState({ action: '', entityType: '', from: '', to: '' });
  const [filters, setFilters] = useState({ action: '', entityType: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const list = usePagedList<AuditRow>(locale, '/admin/audit', { page, limit: 20, ...filters });

  function apply(): void {
    setFilters(draft);
    setPage(1);
  }
  function clear(): void {
    const blank = { action: '', entityType: '', from: '', to: '' };
    setDraft(blank);
    setFilters(blank);
    setPage(1);
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
          <Input
            label={dict.admin.filters.action}
            value={draft.action}
            onChange={(event) => setDraft({ ...draft, action: event.target.value })}
          />
        </div>
        <div className="w-44">
          <Input
            label={dict.admin.filters.entityType}
            value={draft.entityType}
            onChange={(event) => setDraft({ ...draft, entityType: event.target.value })}
          />
        </div>
        <div className="w-40">
          <Input
            type="date"
            label={dict.common.startDate}
            value={draft.from}
            onChange={(event) => setDraft({ ...draft, from: event.target.value })}
          />
        </div>
        <div className="w-40">
          <Input
            type="date"
            label={dict.common.endDate}
            value={draft.to}
            onChange={(event) => setDraft({ ...draft, to: event.target.value })}
          />
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
                <th className={th}>{dict.admin.columns.when}</th>
                <th className={th}>{dict.admin.columns.action}</th>
                <th className={th}>{dict.admin.columns.actor}</th>
                <th className={th}>{dict.admin.columns.entity}</th>
                <th className={th}>{dict.admin.columns.ip}</th>
                <th className={th}>{dict.admin.columns.metadata}</th>
              </tr>
            </thead>
            <tbody>
              {rows.items.map((row) => (
                <tr key={row.id} className="border-t border-sand-100 align-top">
                  <td className={cn(td, 'whitespace-nowrap text-sand-600')}>
                    {formatDateTime(row.createdAt, locale)}
                  </td>
                  <td className={cn(td, 'font-mono text-xs text-sand-900')}>{row.action}</td>
                  <td className={td}>
                    {row.actor ? (
                      <>
                        <span className="block text-sand-900">
                          {row.actor.firstName} {row.actor.lastName}
                        </span>
                        <span className="text-xs text-sand-500">{row.actor.email}</span>
                      </>
                    ) : (
                      <span className="text-sand-400">—</span>
                    )}
                  </td>
                  <td className={td}>
                    {row.entityType ? (
                      <>
                        <span className="block text-sand-700">{row.entityType}</span>
                        {row.entityId ? (
                          <span className="block max-w-40 truncate font-mono text-xs text-sand-500">
                            {row.entityId}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-sand-400">—</span>
                    )}
                  </td>
                  <td className={cn(td, 'font-mono text-xs text-sand-600')}>
                    {row.ipAddress ?? '—'}
                  </td>
                  <td className={td}>
                    {row.metadata == null ? (
                      <span className="text-sand-400">—</span>
                    ) : (
                      <details>
                        <summary className="cursor-pointer text-xs text-brand-700">
                          {dict.admin.columns.metadata}
                        </summary>
                        <pre className="mt-1 max-w-md overflow-x-auto whitespace-pre-wrap text-xs text-sand-600">
                          {JSON.stringify(row.metadata, null, 2)}
                        </pre>
                      </details>
                    )}
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

// ── Settings ───────────────────────────────────────────────────

function SettingsSection({ locale, canManage }: { locale: LocaleCode; canManage: boolean }) {
  const { dict } = getDictionary(locale);
  const fail = useFail(locale);
  const [draft, setDraft] = useState({ key: '' });
  const [filters, setFilters] = useState({ key: '' });
  const [page, setPage] = useState(1);
  const list = usePagedList<SettingRow>(locale, '/admin/settings', { page, limit: 20, ...filters });
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({ key: '', scope: 'global', value: '' });
  const [formBusy, setFormBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  function apply(): void {
    setFilters(draft);
    setPage(1);
  }
  function clear(): void {
    setDraft({ key: '' });
    setFilters({ key: '' });
    setPage(1);
  }

  async function saveSetting(event: FormEvent): Promise<void> {
    event.preventDefault();
    let parsed: unknown;
    try {
      parsed = JSON.parse(form.value);
    } catch {
      list.setError(dict.errors.validation);
      return;
    }
    setFormBusy(true);
    list.setError(null);
    setNotice(null);
    try {
      await api.put('/admin/settings', {
        key: form.key.trim(),
        scope: form.scope.trim() || 'global',
        value: parsed,
      });
      setNotice(dict.admin.settingsSaved);
      setForm({ key: '', scope: 'global', value: '' });
      list.reload();
    } catch (cause) {
      const message = fail(cause);
      if (message) list.setError(message);
    } finally {
      setFormBusy(false);
    }
  }

  async function deleteSetting(key: string): Promise<void> {
    setPendingDelete(null);
    list.setError(null);
    setNotice(null);
    try {
      await api.delete(`/admin/settings/${encodeURIComponent(key)}`);
      setNotice(dict.admin.settingsDeleted);
      list.reload();
    } catch (cause) {
      const message = fail(cause);
      if (message) list.setError(message);
    }
  }

  const rows = list.rows;

  return (
    <section className="space-y-4">
      {!canManage ? (
        <Alert>{dict.errors.forbidden}</Alert>
      ) : (
        <Card>
          <CardTitle>{dict.dashboard.settingsTitle}</CardTitle>
          <form onSubmit={(event) => void saveSetting(event)} className="mt-3 space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                label={dict.admin.settingsKeyLabel}
                required
                value={form.key}
                onChange={(event) => setForm({ ...form, key: event.target.value })}
              />
              <Input
                label={dict.admin.settingsScopeLabel}
                value={form.scope}
                onChange={(event) => setForm({ ...form, scope: event.target.value })}
              />
            </div>
            <Textarea
              label={dict.admin.settingsValueLabel}
              hint={dict.admin.settingsValueHint}
              required
              rows={3}
              value={form.value}
              onChange={(event) => setForm({ ...form, value: event.target.value })}
            />
            <Button type="submit" size="sm" loading={formBusy}>
              {dict.admin.actions.save}
            </Button>
          </form>
        </Card>
      )}

      <FilterBar
        onApply={apply}
        onClear={clear}
        busy={list.busy}
        labels={{ apply: dict.admin.filters.apply, clear: dict.admin.filters.clear }}
      >
        <div className="w-64">
          <Input
            label={dict.admin.settingsKeyLabel}
            value={draft.key}
            onChange={(event) => setDraft({ key: event.target.value })}
          />
        </div>
      </FilterBar>

      <NoticeBar message={notice} />
      {list.error ? <Alert>{list.error}</Alert> : null}

      <Card className="overflow-x-auto p-0">
        {!rows ? (
          <p className="px-4 py-6 text-sm text-sand-500">{dict.common.loading}</p>
        ) : rows.items.length === 0 ? (
          <EmptyState className="m-4">{dict.admin.settingsEmpty}</EmptyState>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-sand-50">
                <th className={th}>{dict.admin.settingsKeyLabel}</th>
                <th className={th}>{dict.admin.settingsScopeLabel}</th>
                <th className={th}>{dict.admin.settingsValueLabel}</th>
                <th className={th}>{dict.admin.columns.updatedAt}</th>
                <th className={th}>{dict.admin.columns.action}</th>
              </tr>
            </thead>
            <tbody>
              {rows.items.map((setting) => (
                <tr key={setting.key} className="border-t border-sand-100">
                  <td className={cn(td, 'font-mono text-xs text-sand-900')}>{setting.key}</td>
                  <td className={cn(td, 'text-sand-600')}>{setting.scope}</td>
                  <td className={td}>
                    <code
                      className="block max-w-md truncate text-xs text-sand-700"
                      title={JSON.stringify(setting.value)}
                    >
                      {JSON.stringify(setting.value)}
                    </code>
                  </td>
                  <td className={cn(td, 'text-sand-600')}>
                    {formatDate(setting.updatedAt, locale)}
                  </td>
                  <td className={td}>
                    {canManage ? (
                      pendingDelete === setting.key ? (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => void deleteSetting(setting.key)}
                          >
                            {dict.admin.actions.confirmDelete}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setPendingDelete(null)}>
                            {dict.common.cancel}
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setPendingDelete(setting.key)}
                        >
                          {dict.admin.actions.delete}
                        </Button>
                      )
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

// ── Feature flags ──────────────────────────────────────────────

function FlagsSection({ locale, canManage }: { locale: LocaleCode; canManage: boolean }) {
  const { dict } = getDictionary(locale);
  const fail = useFail(locale);
  const [page, setPage] = useState(1);
  const list = usePagedList<FlagRow, { effective: Record<string, boolean> }>(
    locale,
    '/admin/flags',
    { page, limit: 20 },
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({ key: '', description: '', enabled: false });
  const [formBusy, setFormBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  async function saveFlag(event: FormEvent): Promise<void> {
    event.preventDefault();
    setFormBusy(true);
    list.setError(null);
    setNotice(null);
    try {
      await api.put('/admin/flags', {
        key: form.key.trim(),
        enabled: form.enabled,
        ...(form.description.trim() ? { description: form.description.trim() } : {}),
      });
      setNotice(dict.admin.settingsSaved);
      setForm({ key: '', description: '', enabled: false });
      list.reload();
    } catch (cause) {
      const message = fail(cause);
      if (message) list.setError(message);
    } finally {
      setFormBusy(false);
    }
  }

  async function toggleFlag(row: FlagRow): Promise<void> {
    list.setError(null);
    setNotice(null);
    try {
      await api.put('/admin/flags', {
        key: row.key,
        enabled: !row.enabled,
        ...(row.description ? { description: row.description } : {}),
      });
      setNotice(dict.admin.settingsSaved);
      list.reload();
    } catch (cause) {
      const message = fail(cause);
      if (message) list.setError(message);
    }
  }

  async function deleteFlag(key: string): Promise<void> {
    setPendingDelete(null);
    list.setError(null);
    setNotice(null);
    try {
      await api.delete(`/admin/flags/${encodeURIComponent(key)}`);
      setNotice(dict.admin.settingsDeleted);
      list.reload();
    } catch (cause) {
      const message = fail(cause);
      if (message) list.setError(message);
    }
  }

  const rows = list.rows;

  return (
    <section className="space-y-4">
      {!canManage ? (
        <Alert>{dict.errors.forbidden}</Alert>
      ) : (
        <Card>
          <CardTitle>{dict.dashboard.flagsTitle}</CardTitle>
          <form onSubmit={(event) => void saveFlag(event)} className="mt-3 space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                label={dict.admin.settingsKeyLabel}
                required
                value={form.key}
                onChange={(event) => setForm({ ...form, key: event.target.value })}
              />
              <Input
                label={dict.admin.flagsDescriptionLabel}
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-sand-700">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(event) => setForm({ ...form, enabled: event.target.checked })}
              />
              {dict.admin.flagsEnabledLabel}
            </label>
            <Button type="submit" size="sm" loading={formBusy}>
              {dict.admin.actions.save}
            </Button>
          </form>
        </Card>
      )}

      <NoticeBar message={notice} />
      {list.error ? <Alert>{list.error}</Alert> : null}

      <Card className="overflow-x-auto p-0">
        {!rows ? (
          <p className="px-4 py-6 text-sm text-sand-500">{dict.common.loading}</p>
        ) : rows.items.length === 0 ? (
          <EmptyState className="m-4">{dict.admin.flagsEmpty}</EmptyState>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-sand-50">
                <th className={th}>{dict.admin.settingsKeyLabel}</th>
                <th className={th}>{dict.admin.flagsEnabledLabel}</th>
                <th className={th}>{dict.admin.flagsRolloutLabel}</th>
                <th className={th}>{dict.admin.flagsDescriptionLabel}</th>
                <th className={th}>{dict.admin.columns.updatedAt}</th>
                <th className={th}>{dict.admin.columns.action}</th>
              </tr>
            </thead>
            <tbody>
              {rows.items.map((flag) => (
                <tr key={flag.key} className="border-t border-sand-100">
                  <td className={cn(td, 'font-mono text-xs text-sand-900')}>{flag.key}</td>
                  <td className={td}>
                    <Badge tone={flag.enabled ? 'success' : 'neutral'}>
                      {flag.enabled ? dict.common.yes : dict.common.no}
                    </Badge>
                  </td>
                  <td className={td}>{flag.rollout}%</td>
                  <td className={cn(td, 'max-w-56 text-sand-600')}>{flag.description ?? '—'}</td>
                  <td className={cn(td, 'text-sand-600')}>{formatDate(flag.updatedAt, locale)}</td>
                  <td className={td}>
                    {canManage ? (
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => void toggleFlag(flag)}>
                          {dict.admin.flagsEnabledLabel}
                        </Button>
                        {pendingDelete === flag.key ? (
                          <>
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => void deleteFlag(flag.key)}
                            >
                              {dict.admin.actions.confirmDelete}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setPendingDelete(null)}
                            >
                              {dict.common.cancel}
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setPendingDelete(flag.key)}
                          >
                            {dict.admin.actions.delete}
                          </Button>
                        )}
                      </div>
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

      {rows && Object.keys(rows.effective ?? {}).length > 0 ? (
        <Card>
          <CardTitle>{dict.admin.flagsEffectiveLabel}</CardTitle>
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.entries(rows.effective).map(([key, enabled]) => (
              <Badge key={key} tone={enabled ? 'success' : 'neutral'}>
                {key}: {enabled ? dict.common.yes : dict.common.no}
              </Badge>
            ))}
          </div>
        </Card>
      ) : null}
    </section>
  );
}
