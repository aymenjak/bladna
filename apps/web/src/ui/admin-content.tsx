'use client';

import { useEffect, useState, type FormEvent } from 'react';
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
import { getDictionary, type Dictionary, type LocaleCode } from '@/ui/i18n';
import { formatDate, formatDateTime } from '@/ui/format';
import { titleFor } from '@/ui/opportunity';
import { ListPager } from '@/ui/components/list-pager';
import { StatusBadge } from '@/ui/status';
import { FilterBar, NoticeBar, td, th, useFail, usePagedList } from './admin-shared';

/**
 * Content (CMS) console section: content pages (incl. FAQ/guides/legal),
 * announcements, featured placements and the home-page singleton — the admin
 * surface for the 14 CMS endpoints in server/modules/cms.ts. Every write goes
 * through `content.manage` server-side; `canManage` is display-only gating.
 */

type ContentView = 'pages' | 'announcements' | 'featured' | 'home';

const pagerLabels = (dict: Dictionary) => ({
  page: dict.common.page,
  of: dict.common.of,
  previous: dict.common.previous,
  next: dict.common.next,
});

const PAGE_TYPES = ['PAGE', 'FAQ', 'GUIDE', 'SAFETY', 'LEGAL'] as const;
const CONTENT_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
const PLACEMENT_SECTIONS = [
  'HOME_HERO',
  'HOME_FEATURED_OPPORTUNITIES',
  'HOME_FEATURED_ORGANIZATIONS',
  'HOME_CAMPAIGNS',
  'DISCOVER_FEATURED',
] as const;
const TARGET_TYPES = ['OPPORTUNITY', 'ORGANIZATION', 'CAMPAIGN'] as const;

type PageType = (typeof PAGE_TYPES)[number];
type ContentStatus = (typeof CONTENT_STATUSES)[number];
type PlacementSection = (typeof PLACEMENT_SECTIONS)[number];
type TargetType = (typeof TARGET_TYPES)[number];

// ── Row shapes (mirror the module SELECTs) ─────────────────────

interface ContentPageRow {
  id: string;
  slug: string;
  type: PageType;
  status: ContentStatus;
  titleAr: string;
  titleFr: string;
  titleEn: string;
  bodyAr: string;
  bodyFr: string;
  bodyEn: string;
  seoDescription: string | null;
  updatedAt: string | Date;
}

interface AnnouncementRow {
  id: string;
  titleAr: string;
  titleFr: string;
  titleEn: string;
  bodyAr: string;
  bodyFr: string;
  bodyEn: string;
  active: boolean;
  startsAt: string | Date | null;
  endsAt: string | Date | null;
  updatedAt: string | Date;
}

interface PlacementRow {
  id: string;
  section: PlacementSection;
  targetType: TargetType;
  targetId: string;
  position: number;
  sponsored: boolean;
  label: string | null;
  active: boolean;
}

interface HomeRow {
  heroTitleAr: string;
  heroTitleFr: string;
  heroTitleEn: string;
  heroSubtitleAr: string | null;
  heroSubtitleFr: string | null;
  heroSubtitleEn: string | null;
  primaryCtaAr: string;
  primaryCtaFr: string;
  primaryCtaEn: string;
  secondaryCtaAr: string;
  secondaryCtaFr: string;
  secondaryCtaEn: string;
  announcementId: string | null;
}

// ── Form state ─────────────────────────────────────────────────

interface PageForm {
  slug: string;
  type: PageType;
  status: ContentStatus;
  titleAr: string;
  titleFr: string;
  titleEn: string;
  bodyAr: string;
  bodyFr: string;
  bodyEn: string;
  seoDescription: string;
}

const EMPTY_PAGE_FORM: PageForm = {
  slug: '',
  type: 'PAGE',
  status: 'DRAFT',
  titleAr: '',
  titleFr: '',
  titleEn: '',
  bodyAr: '',
  bodyFr: '',
  bodyEn: '',
  seoDescription: '',
};

interface AnnouncementForm {
  titleAr: string;
  titleFr: string;
  titleEn: string;
  bodyAr: string;
  bodyFr: string;
  bodyEn: string;
  active: boolean;
  startsAt: string;
  endsAt: string;
}

const EMPTY_ANNOUNCEMENT_FORM: AnnouncementForm = {
  titleAr: '',
  titleFr: '',
  titleEn: '',
  bodyAr: '',
  bodyFr: '',
  bodyEn: '',
  active: true,
  startsAt: '',
  endsAt: '',
};

interface PlacementForm {
  section: PlacementSection;
  targetType: TargetType;
  targetId: string;
  position: string;
  sponsored: boolean;
  label: string;
}

const EMPTY_PLACEMENT_FORM: PlacementForm = {
  section: 'HOME_HERO',
  targetType: 'OPPORTUNITY',
  targetId: '',
  position: '0',
  sponsored: false,
  label: '',
};

interface HomeForm {
  heroTitleAr: string;
  heroTitleFr: string;
  heroTitleEn: string;
  heroSubtitleAr: string;
  heroSubtitleFr: string;
  heroSubtitleEn: string;
  primaryCtaAr: string;
  primaryCtaFr: string;
  primaryCtaEn: string;
  secondaryCtaAr: string;
  secondaryCtaFr: string;
  secondaryCtaEn: string;
  announcementId: string;
}

const EMPTY_HOME_FORM: HomeForm = {
  heroTitleAr: '',
  heroTitleFr: '',
  heroTitleEn: '',
  heroSubtitleAr: '',
  heroSubtitleFr: '',
  heroSubtitleEn: '',
  primaryCtaAr: '',
  primaryCtaFr: '',
  primaryCtaEn: '',
  secondaryCtaAr: '',
  secondaryCtaFr: '',
  secondaryCtaEn: '',
  announcementId: '',
};

function isoDate(value: string | Date): string {
  return new Date(value).toISOString().slice(0, 10);
}

// ── Shell ──────────────────────────────────────────────────────

export function ContentSection({ locale, canManage }: { locale: LocaleCode; canManage: boolean }) {
  const { dict } = getDictionary(locale);
  const [view, setView] = useState<ContentView>('pages');
  const views: { id: ContentView; label: string }[] = [
    { id: 'pages', label: dict.admin.cms.viewPages },
    { id: 'announcements', label: dict.admin.cms.viewAnnouncements },
    { id: 'featured', label: dict.admin.cms.viewFeatured },
    { id: 'home', label: dict.admin.cms.viewHome },
  ];

  return (
    <section className="space-y-4">
      <TabsRoot active={view} onSelect={setView} className="space-y-4">
        <Tabs
          items={views.map((entry) => ({ id: entry.id, label: entry.label }))}
          active={view}
          onSelect={setView}
          ariaLabel={dict.admin.cms.pageType}
        />

        <TabPanel id={view} active={view}>
          {view === 'pages' ? <PagesView locale={locale} canManage={canManage} /> : null}
          {view === 'announcements' ? (
            <AnnouncementsView locale={locale} canManage={canManage} />
          ) : null}
          {view === 'featured' ? <FeaturedView locale={locale} canManage={canManage} /> : null}
          {view === 'home' ? <HomeView locale={locale} canManage={canManage} /> : null}
        </TabPanel>
      </TabsRoot>
    </section>
  );
}

// ── Content pages ──────────────────────────────────────────────

function PagesView({ locale, canManage }: { locale: LocaleCode; canManage: boolean }) {
  const { dict } = getDictionary(locale);
  const fail = useFail(locale);
  const [draft, setDraft] = useState({ status: '', type: '' });
  const [filters, setFilters] = useState({ status: '', type: '' });
  const [page, setPage] = useState(1);
  const list = usePagedList<ContentPageRow>(locale, '/admin/content/pages', {
    page,
    limit: 10,
    ...filters,
  });
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState<PageForm>(EMPTY_PAGE_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  function apply(): void {
    setFilters(draft);
    setPage(1);
  }
  function clear(): void {
    setDraft({ status: '', type: '' });
    setFilters({ status: '', type: '' });
    setPage(1);
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setFormBusy(true);
    setFormError(null);
    setNotice(null);
    try {
      const payload = {
        slug: form.slug.trim(),
        type: form.type,
        status: form.status,
        titleAr: form.titleAr.trim(),
        titleFr: form.titleFr.trim(),
        titleEn: form.titleEn.trim(),
        bodyAr: form.bodyAr.trim(),
        bodyFr: form.bodyFr.trim(),
        bodyEn: form.bodyEn.trim(),
        ...(form.seoDescription.trim() ? { seoDescription: form.seoDescription.trim() } : {}),
      };
      if (editingId) await api.patch(`/admin/content/pages/${editingId}`, payload);
      else await api.post('/admin/content/pages', payload);
      setNotice(dict.admin.actionDone);
      setEditingId(null);
      setForm(EMPTY_PAGE_FORM);
      list.reload();
    } catch (cause) {
      const message = fail(cause);
      if (message) setFormError(message);
    } finally {
      setFormBusy(false);
    }
  }

  function startEdit(row: ContentPageRow): void {
    setEditingId(row.id);
    setForm({
      slug: row.slug,
      type: row.type,
      status: row.status,
      titleAr: row.titleAr,
      titleFr: row.titleFr,
      titleEn: row.titleEn,
      bodyAr: row.bodyAr,
      bodyFr: row.bodyFr,
      bodyEn: row.bodyEn,
      seoDescription: row.seoDescription ?? '',
    });
    setFormError(null);
  }

  function cancelEdit(): void {
    setEditingId(null);
    setForm(EMPTY_PAGE_FORM);
    setFormError(null);
  }

  async function remove(id: string): Promise<void> {
    setPendingDelete(null);
    setNotice(null);
    list.setError(null);
    try {
      await api.delete(`/admin/content/pages/${id}`);
      setNotice(dict.admin.actionDone);
      list.reload();
    } catch (cause) {
      const message = fail(cause);
      if (message) list.setError(message);
    }
  }

  const rows = list.rows;
  const submitLabel = editingId ? dict.admin.cms.updatePage : dict.admin.cms.createPage;

  return (
    <div className="space-y-4">
      <FilterBar
        onApply={apply}
        onClear={clear}
        busy={list.busy}
        labels={{ apply: dict.admin.filters.apply, clear: dict.admin.filters.clear }}
      >
        <div className="w-44">
          <Select
            label={dict.common.status}
            value={draft.status}
            onChange={(event) => setDraft({ ...draft, status: event.target.value })}
          >
            <option value="">{dict.common.all}</option>
            {CONTENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {dict.admin.cms.contentStatuses[status]}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-44">
          <Select
            label={dict.admin.cms.pageType}
            value={draft.type}
            onChange={(event) => setDraft({ ...draft, type: event.target.value })}
          >
            <option value="">{dict.common.all}</option>
            {PAGE_TYPES.map((type) => (
              <option key={type} value={type}>
                {dict.admin.cms.pageTypes[type]}
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
                label={dict.admin.cms.slug}
                required
                value={form.slug}
                onChange={(event) => setForm({ ...form, slug: event.target.value })}
              />
              <Select
                label={dict.admin.cms.pageType}
                value={form.type}
                onChange={(event) => setForm({ ...form, type: event.target.value as PageType })}
              >
                {PAGE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {dict.admin.cms.pageTypes[type]}
                  </option>
                ))}
              </Select>
              <Select
                label={dict.common.status}
                value={form.status}
                onChange={(event) =>
                  setForm({ ...form, status: event.target.value as ContentStatus })
                }
              >
                {CONTENT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {dict.admin.cms.contentStatuses[status]}
                  </option>
                ))}
              </Select>
            </div>
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
              <Textarea
                label={dict.admin.cms.bodyAr}
                required
                rows={5}
                value={form.bodyAr}
                onChange={(event) => setForm({ ...form, bodyAr: event.target.value })}
              />
              <Textarea
                label={dict.admin.cms.bodyFr}
                required
                rows={5}
                value={form.bodyFr}
                onChange={(event) => setForm({ ...form, bodyFr: event.target.value })}
              />
              <Textarea
                label={dict.admin.cms.bodyEn}
                required
                rows={5}
                value={form.bodyEn}
                onChange={(event) => setForm({ ...form, bodyEn: event.target.value })}
              />
            </div>
            <Input
              label={dict.admin.cms.seoDescription}
              value={form.seoDescription}
              onChange={(event) => setForm({ ...form, seoDescription: event.target.value })}
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
                <th className={th}>{dict.admin.cms.slug}</th>
                <th className={th}>{dict.admin.cms.pageType}</th>
                <th className={th}>{dict.common.status}</th>
                <th className={th}>{dict.admin.columns.updatedAt}</th>
                <th className={th}>{dict.admin.columns.action}</th>
              </tr>
            </thead>
            <tbody>
              {rows.items.map((row) => (
                <tr key={row.id} className="border-t border-sand-100">
                  <td className={cn(td, 'font-mono text-xs')}>{row.slug}</td>
                  <td className={td}>{dict.admin.cms.pageTypes[row.type]}</td>
                  <td className={td}>
                    <StatusBadge
                      status={row.status}
                      label={dict.admin.cms.contentStatuses[row.status]}
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
                        {pendingDelete === row.id ? (
                          <>
                            <Button size="sm" variant="danger" onClick={() => void remove(row.id)}>
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
                            onClick={() => setPendingDelete(row.id)}
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
    </div>
  );
}

// ── Announcements ──────────────────────────────────────────────

function AnnouncementsView({ locale, canManage }: { locale: LocaleCode; canManage: boolean }) {
  const { dict } = getDictionary(locale);
  const fail = useFail(locale);
  const [page, setPage] = useState(1);
  const list = usePagedList<AnnouncementRow>(locale, '/admin/announcements', { page, limit: 10 });
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState<AnnouncementForm>(EMPTY_ANNOUNCEMENT_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setFormBusy(true);
    setFormError(null);
    setNotice(null);
    try {
      const payload = {
        titleAr: form.titleAr.trim(),
        titleFr: form.titleFr.trim(),
        titleEn: form.titleEn.trim(),
        bodyAr: form.bodyAr.trim(),
        bodyFr: form.bodyFr.trim(),
        bodyEn: form.bodyEn.trim(),
        active: form.active,
        startsAt: form.startsAt ? new Date(`${form.startsAt}T00:00:00Z`).toISOString() : null,
        endsAt: form.endsAt ? new Date(`${form.endsAt}T00:00:00Z`).toISOString() : null,
      };
      if (editingId) await api.patch(`/admin/announcements/${editingId}`, payload);
      else await api.post('/admin/announcements', payload);
      setNotice(dict.admin.actionDone);
      setEditingId(null);
      setForm(EMPTY_ANNOUNCEMENT_FORM);
      list.reload();
    } catch (cause) {
      const message = fail(cause);
      if (message) setFormError(message);
    } finally {
      setFormBusy(false);
    }
  }

  function startEdit(row: AnnouncementRow): void {
    setEditingId(row.id);
    setForm({
      titleAr: row.titleAr,
      titleFr: row.titleFr,
      titleEn: row.titleEn,
      bodyAr: row.bodyAr,
      bodyFr: row.bodyFr,
      bodyEn: row.bodyEn,
      active: row.active,
      startsAt: row.startsAt ? isoDate(row.startsAt) : '',
      endsAt: row.endsAt ? isoDate(row.endsAt) : '',
    });
    setFormError(null);
  }

  function cancelEdit(): void {
    setEditingId(null);
    setForm(EMPTY_ANNOUNCEMENT_FORM);
    setFormError(null);
  }

  async function remove(id: string): Promise<void> {
    setPendingDelete(null);
    setNotice(null);
    list.setError(null);
    try {
      await api.delete(`/admin/announcements/${id}`);
      setNotice(dict.admin.actionDone);
      list.reload();
    } catch (cause) {
      const message = fail(cause);
      if (message) list.setError(message);
    }
  }

  const rows = list.rows;
  const submitLabel = editingId
    ? dict.admin.cms.updateAnnouncement
    : dict.admin.cms.createAnnouncement;

  return (
    <div className="space-y-4">
      {!canManage ? (
        <Alert>{dict.errors.forbidden}</Alert>
      ) : (
        <Card>
          <CardTitle>{submitLabel}</CardTitle>
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
              <Textarea
                label={dict.admin.cms.bodyAr}
                required
                rows={3}
                value={form.bodyAr}
                onChange={(event) => setForm({ ...form, bodyAr: event.target.value })}
              />
              <Textarea
                label={dict.admin.cms.bodyFr}
                required
                rows={3}
                value={form.bodyFr}
                onChange={(event) => setForm({ ...form, bodyFr: event.target.value })}
              />
              <Textarea
                label={dict.admin.cms.bodyEn}
                required
                rows={3}
                value={form.bodyEn}
                onChange={(event) => setForm({ ...form, bodyEn: event.target.value })}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Input
                label={dict.admin.cms.startsAt}
                type="date"
                value={form.startsAt}
                onChange={(event) => setForm({ ...form, startsAt: event.target.value })}
              />
              <Input
                label={dict.admin.cms.endsAt}
                type="date"
                value={form.endsAt}
                onChange={(event) => setForm({ ...form, endsAt: event.target.value })}
              />
              <label className="flex items-center gap-2 self-end pb-2 text-sm text-sand-700">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(event) => setForm({ ...form, active: event.target.checked })}
                />
                {dict.admin.cms.active}
              </label>
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
          <EmptyState className="m-4">{dict.common.empty}</EmptyState>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-sand-50">
                <th className={th}>{dict.admin.columns.title}</th>
                <th className={th}>{dict.admin.cms.active}</th>
                <th className={th}>{dict.admin.cms.startsAt}</th>
                <th className={th}>{dict.admin.cms.endsAt}</th>
                <th className={th}>{dict.admin.columns.action}</th>
              </tr>
            </thead>
            <tbody>
              {rows.items.map((row) => (
                <tr key={row.id} className="border-t border-sand-100">
                  <td className={td}>{titleFor(row, locale)}</td>
                  <td className={td}>
                    <Badge tone={row.active ? 'success' : 'neutral'}>
                      {row.active ? dict.common.yes : dict.common.no}
                    </Badge>
                  </td>
                  <td className={cn(td, 'text-sand-600')}>
                    {row.startsAt ? formatDate(row.startsAt, locale) : '—'}
                  </td>
                  <td className={cn(td, 'text-sand-600')}>
                    {row.endsAt ? formatDate(row.endsAt, locale) : '—'}
                  </td>
                  <td className={td}>
                    {canManage ? (
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => startEdit(row)}>
                          {dict.admin.actions.edit}
                        </Button>
                        {pendingDelete === row.id ? (
                          <>
                            <Button size="sm" variant="danger" onClick={() => void remove(row.id)}>
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
                            onClick={() => setPendingDelete(row.id)}
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
    </div>
  );
}

// ── Featured placements ────────────────────────────────────────

function FeaturedView({ locale, canManage }: { locale: LocaleCode; canManage: boolean }) {
  const { dict } = getDictionary(locale);
  const fail = useFail(locale);
  const [draft, setDraft] = useState({ section: '', active: '' });
  const [filters, setFilters] = useState({ section: '', active: '' });
  const [page, setPage] = useState(1);
  const list = usePagedList<PlacementRow>(locale, '/admin/featured', {
    page,
    limit: 10,
    ...filters,
  });
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState<PlacementForm>(EMPTY_PLACEMENT_FORM);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  function apply(): void {
    setFilters(draft);
    setPage(1);
  }
  function clear(): void {
    setDraft({ section: '', active: '' });
    setFilters({ section: '', active: '' });
    setPage(1);
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setFormBusy(true);
    setFormError(null);
    setNotice(null);
    try {
      await api.post('/admin/featured', {
        section: form.section,
        targetType: form.targetType,
        targetId: form.targetId.trim(),
        position: Number(form.position) || 0,
        sponsored: form.sponsored,
        ...(form.label.trim() ? { label: form.label.trim() } : {}),
      });
      setNotice(dict.admin.actionDone);
      setForm(EMPTY_PLACEMENT_FORM);
      list.reload();
    } catch (cause) {
      const message = fail(cause);
      if (message) setFormError(message);
    } finally {
      setFormBusy(false);
    }
  }

  async function remove(id: string): Promise<void> {
    setPendingDelete(null);
    setNotice(null);
    list.setError(null);
    try {
      await api.delete(`/admin/featured/${id}`);
      setNotice(dict.admin.actionDone);
      list.reload();
    } catch (cause) {
      const message = fail(cause);
      if (message) list.setError(message);
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
        <div className="w-56">
          <Select
            label={dict.admin.cms.section}
            value={draft.section}
            onChange={(event) => setDraft({ ...draft, section: event.target.value })}
          >
            <option value="">{dict.common.all}</option>
            {PLACEMENT_SECTIONS.map((section) => (
              <option key={section} value={section}>
                {dict.admin.cms.placementSections[section]}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-36">
          <Select
            label={dict.admin.cms.active}
            value={draft.active}
            onChange={(event) => setDraft({ ...draft, active: event.target.value })}
          >
            <option value="">{dict.common.all}</option>
            <option value="true">{dict.common.yes}</option>
            <option value="false">{dict.common.no}</option>
          </Select>
        </div>
      </FilterBar>

      {!canManage ? (
        <Alert>{dict.errors.forbidden}</Alert>
      ) : (
        <Card>
          <CardTitle>{dict.admin.cms.createPlacement}</CardTitle>
          <form onSubmit={(event) => void submit(event)} className="mt-3 space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Select
                label={dict.admin.cms.section}
                value={form.section}
                onChange={(event) =>
                  setForm({ ...form, section: event.target.value as PlacementSection })
                }
              >
                {PLACEMENT_SECTIONS.map((section) => (
                  <option key={section} value={section}>
                    {dict.admin.cms.placementSections[section]}
                  </option>
                ))}
              </Select>
              <Select
                label={dict.admin.cms.targetType}
                value={form.targetType}
                onChange={(event) =>
                  setForm({ ...form, targetType: event.target.value as TargetType })
                }
              >
                {TARGET_TYPES.map((targetType) => (
                  <option key={targetType} value={targetType}>
                    {dict.admin.riskTargetTypes[targetType]}
                  </option>
                ))}
              </Select>
              <Input
                label={dict.admin.cms.targetId}
                required
                value={form.targetId}
                onChange={(event) => setForm({ ...form, targetId: event.target.value })}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Input
                label={dict.admin.cms.position}
                type="number"
                min={0}
                max={1000}
                value={form.position}
                onChange={(event) => setForm({ ...form, position: event.target.value })}
              />
              <Input
                label={dict.admin.cms.label}
                value={form.label}
                onChange={(event) => setForm({ ...form, label: event.target.value })}
              />
              <label className="flex items-center gap-2 self-end pb-2 text-sm text-sand-700">
                <input
                  type="checkbox"
                  checked={form.sponsored}
                  onChange={(event) => setForm({ ...form, sponsored: event.target.checked })}
                />
                {dict.admin.cms.sponsored}
              </label>
            </div>
            {formError ? <Alert>{formError}</Alert> : null}
            <Button type="submit" size="sm" loading={formBusy}>
              {dict.admin.cms.createPlacement}
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
          <EmptyState className="m-4">{dict.common.empty}</EmptyState>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-sand-50">
                <th className={th}>{dict.admin.cms.section}</th>
                <th className={th}>{dict.admin.cms.targetType}</th>
                <th className={th}>{dict.admin.cms.targetId}</th>
                <th className={th}>{dict.admin.cms.position}</th>
                <th className={th}>{dict.admin.cms.label}</th>
                <th className={th}>{dict.admin.cms.active}</th>
                <th className={th}>{dict.admin.columns.action}</th>
              </tr>
            </thead>
            <tbody>
              {rows.items.map((row) => (
                <tr key={row.id} className="border-t border-sand-100">
                  <td className={td}>{dict.admin.cms.placementSections[row.section]}</td>
                  <td className={td}>{dict.admin.riskTargetTypes[row.targetType]}</td>
                  <td className={cn(td, 'font-mono text-xs')}>{row.targetId}</td>
                  <td className={td}>{row.position}</td>
                  <td className={cn(td, 'text-sand-600')}>{row.label ?? '—'}</td>
                  <td className={td}>
                    <Badge tone={row.active ? 'success' : 'neutral'}>
                      {row.active ? dict.common.yes : dict.common.no}
                    </Badge>
                  </td>
                  <td className={td}>
                    {canManage ? (
                      pendingDelete === row.id ? (
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="danger" onClick={() => void remove(row.id)}>
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
                          onClick={() => setPendingDelete(row.id)}
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
    </div>
  );
}

// ── Home singleton ─────────────────────────────────────────────

function HomeView({ locale, canManage }: { locale: LocaleCode; canManage: boolean }) {
  const { dict } = getDictionary(locale);
  const fail = useFail(locale);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [existing, setExisting] = useState<HomeRow | null>(null);
  const [form, setForm] = useState<HomeForm>(EMPTY_HOME_FORM);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<{ home: HomeRow | null }>('/home')
      .then(({ data }) => {
        if (cancelled) return;
        setExisting(data.home);
        if (data.home) {
          setForm({
            heroTitleAr: data.home.heroTitleAr,
            heroTitleFr: data.home.heroTitleFr,
            heroTitleEn: data.home.heroTitleEn,
            heroSubtitleAr: data.home.heroSubtitleAr ?? '',
            heroSubtitleFr: data.home.heroSubtitleFr ?? '',
            heroSubtitleEn: data.home.heroSubtitleEn ?? '',
            primaryCtaAr: data.home.primaryCtaAr,
            primaryCtaFr: data.home.primaryCtaFr,
            primaryCtaEn: data.home.primaryCtaEn,
            secondaryCtaAr: data.home.secondaryCtaAr,
            secondaryCtaFr: data.home.secondaryCtaFr,
            secondaryCtaEn: data.home.secondaryCtaEn,
            announcementId: data.home.announcementId ?? '',
          });
        }
        setLoading(false);
      })
      .catch((cause) => {
        if (cancelled) return;
        const message = fail(cause);
        if (message) setLoadError(message);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fail]);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setFormBusy(true);
    setFormError(null);
    setNotice(null);
    try {
      // Subtitles/announcementId are optional: omitted when empty, which the
      // upsert handler persists as null (clearing a previously saved value).
      const payload = {
        heroTitleAr: form.heroTitleAr.trim(),
        heroTitleFr: form.heroTitleFr.trim(),
        heroTitleEn: form.heroTitleEn.trim(),
        ...(form.heroSubtitleAr.trim() ? { heroSubtitleAr: form.heroSubtitleAr.trim() } : {}),
        ...(form.heroSubtitleFr.trim() ? { heroSubtitleFr: form.heroSubtitleFr.trim() } : {}),
        ...(form.heroSubtitleEn.trim() ? { heroSubtitleEn: form.heroSubtitleEn.trim() } : {}),
        primaryCtaAr: form.primaryCtaAr.trim(),
        primaryCtaFr: form.primaryCtaFr.trim(),
        primaryCtaEn: form.primaryCtaEn.trim(),
        secondaryCtaAr: form.secondaryCtaAr.trim(),
        secondaryCtaFr: form.secondaryCtaFr.trim(),
        secondaryCtaEn: form.secondaryCtaEn.trim(),
        ...(form.announcementId.trim() ? { announcementId: form.announcementId.trim() } : {}),
      };
      await api.post('/home', payload);
      setNotice(dict.admin.actionDone);
      const { data } = await api.get<{ home: HomeRow | null }>('/home');
      setExisting(data.home);
    } catch (cause) {
      const message = fail(cause);
      if (message) setFormError(message);
    } finally {
      setFormBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <NoticeBar message={notice} />
      {loadError ? <Alert>{loadError}</Alert> : null}

      {!canManage ? (
        <Alert>{dict.errors.forbidden}</Alert>
      ) : (
        <Card>
          <CardTitle>{dict.admin.cms.saveHome}</CardTitle>
          {!existing && !loading ? (
            <p className="mt-2 text-xs text-sand-500">{dict.admin.cms.homeEmpty}</p>
          ) : null}
          {loading ? (
            <p className="mt-3 text-sm text-sand-500">{dict.common.loading}</p>
          ) : (
            <form onSubmit={(event) => void submit(event)} className="mt-3 space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Input
                  label={dict.admin.cms.heroTitleAr}
                  required
                  value={form.heroTitleAr}
                  onChange={(event) => setForm({ ...form, heroTitleAr: event.target.value })}
                />
                <Input
                  label={dict.admin.cms.heroTitleFr}
                  required
                  value={form.heroTitleFr}
                  onChange={(event) => setForm({ ...form, heroTitleFr: event.target.value })}
                />
                <Input
                  label={dict.admin.cms.heroTitleEn}
                  required
                  value={form.heroTitleEn}
                  onChange={(event) => setForm({ ...form, heroTitleEn: event.target.value })}
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Input
                  label={dict.admin.cms.heroSubtitleAr}
                  value={form.heroSubtitleAr}
                  onChange={(event) => setForm({ ...form, heroSubtitleAr: event.target.value })}
                />
                <Input
                  label={dict.admin.cms.heroSubtitleFr}
                  value={form.heroSubtitleFr}
                  onChange={(event) => setForm({ ...form, heroSubtitleFr: event.target.value })}
                />
                <Input
                  label={dict.admin.cms.heroSubtitleEn}
                  value={form.heroSubtitleEn}
                  onChange={(event) => setForm({ ...form, heroSubtitleEn: event.target.value })}
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Input
                  label={dict.admin.cms.primaryCtaAr}
                  required
                  value={form.primaryCtaAr}
                  onChange={(event) => setForm({ ...form, primaryCtaAr: event.target.value })}
                />
                <Input
                  label={dict.admin.cms.primaryCtaFr}
                  required
                  value={form.primaryCtaFr}
                  onChange={(event) => setForm({ ...form, primaryCtaFr: event.target.value })}
                />
                <Input
                  label={dict.admin.cms.primaryCtaEn}
                  required
                  value={form.primaryCtaEn}
                  onChange={(event) => setForm({ ...form, primaryCtaEn: event.target.value })}
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Input
                  label={dict.admin.cms.secondaryCtaAr}
                  required
                  value={form.secondaryCtaAr}
                  onChange={(event) => setForm({ ...form, secondaryCtaAr: event.target.value })}
                />
                <Input
                  label={dict.admin.cms.secondaryCtaFr}
                  required
                  value={form.secondaryCtaFr}
                  onChange={(event) => setForm({ ...form, secondaryCtaFr: event.target.value })}
                />
                <Input
                  label={dict.admin.cms.secondaryCtaEn}
                  required
                  value={form.secondaryCtaEn}
                  onChange={(event) => setForm({ ...form, secondaryCtaEn: event.target.value })}
                />
              </div>
              <Input
                label={dict.admin.cms.announcementId}
                value={form.announcementId}
                onChange={(event) => setForm({ ...form, announcementId: event.target.value })}
              />
              {formError ? <Alert>{formError}</Alert> : null}
              <Button type="submit" size="sm" loading={formBusy}>
                {dict.admin.cms.saveHome}
              </Button>
            </form>
          )}
        </Card>
      )}
    </div>
  );
}
