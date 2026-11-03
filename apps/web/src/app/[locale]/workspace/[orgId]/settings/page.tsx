import { notFound, redirect } from 'next/navigation';
import { isAppError } from '@bladna/types';
import { Card } from '@bladna/ui';
import { getDictionary, isLocale } from '@/ui/i18n';
import { organizationRoutes } from '@/server/modules/organizations';
import { locationRoutes } from '@/server/modules/locations';
import type { AppRoute } from '@/server/router';
import type { Handler } from '@/server/http';
import { invoke } from '@/server/ssr';
import { WorkspaceNoAccess } from '@/ui/components/workspace-no-access';
import { SettingsForm } from '@/ui/components/workspace-settings';
import { StatusBadge } from '@/ui/status';

export const dynamic = 'force-dynamic';

const ROUTE_TABLES: AppRoute[][] = [organizationRoutes, locationRoutes];

/** Look up a handler from the module route table so SSR can call it in-process. */
function requireHandler(method: string, path: string): Handler {
  const handler = ROUTE_TABLES.flatMap((table) => table).find(
    (route) => route.method === method && route.path === path,
  )?.handler;
  if (!handler) throw new Error(`Missing route handler for ${method} ${path}`);
  return handler;
}

interface Place {
  id: string;
  nameAr: string;
  nameFr: string;
  nameEn: string;
}

interface WilayaRow extends Place {
  code: string;
}

interface CityRow extends Place {
  wilayaId: string;
}

interface OrgResult {
  organization: {
    id: string;
    name: string;
    legalName: string | null;
    description: string | null;
    organizationType: string;
    website: string | null;
    officialEmail: string | null;
    phone: string | null;
    address: string | null;
    logo: string | null;
    coverImage: string | null;
    verificationStatus: string;
    wilayaId: string | null;
    cityId: string | null;
    wilaya: WilayaRow | null;
    city: CityRow | null;
  };
}

interface PlacesResult<T> {
  items: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { dict } = getDictionary(isLocale(locale) ? locale : undefined);
  return { title: dict.workspace.tabs.settings, robots: { index: false, follow: false } };
}

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string; orgId: string }>;
}) {
  const { locale, orgId } = await params;
  if (!isLocale(locale)) notFound();
  const { dict } = getDictionary(locale);
  const next = encodeURIComponent(`/${locale}/workspace/${orgId}/settings`);

  let org: OrgResult['organization'];
  try {
    const data = await invoke<OrgResult>(requireHandler('GET', '/orgs/:orgId'), {
      path: `/orgs/${orgId}`,
      locale,
      params: { orgId },
    });
    org = data.organization;
  } catch (error) {
    // P31: the shell proved membership — FORBIDDEN is this page's permission,
    // shown as the access panel instead of a "page not found" the tabs link to.
    if (isAppError(error) && error.code === 'FORBIDDEN') {
      return <WorkspaceNoAccess locale={locale} orgId={orgId} />;
    }
    if (isAppError(error) && error.code === 'NOT_FOUND') notFound();
    if (isAppError(error) && error.code === 'UNAUTHORIZED') {
      redirect(`/${locale}/login?next=${next}`);
    }
    if (isAppError(error) && error.code === 'MFA_REQUIRED') redirect(`/${locale}/mfa?next=${next}`);
    throw error;
  }

  // Optional enrichment: location pickers. Any AppError → omit the fields.
  let wilayas: WilayaRow[] | null = null;
  let cities: CityRow[] | null = null;
  try {
    const data = await invoke<PlacesResult<WilayaRow>>(
      requireHandler('GET', '/locations/wilayas'),
      {
        path: '/locations/wilayas',
        locale,
        query: { page: 1, limit: 100 },
      },
    );
    wilayas = data.items;
  } catch (error) {
    if (!isAppError(error)) throw error;
    wilayas = null;
  }
  try {
    const data = await invoke<PlacesResult<CityRow>>(requireHandler('GET', '/locations/cities'), {
      path: '/locations/cities',
      locale,
      query: { page: 1, limit: 500, wilayaId: org.wilayaId ?? undefined },
    });
    cities = data.items;
  } catch (error) {
    if (!isAppError(error)) throw error;
    cities = null;
  }

  const typeLabel =
    (dict.organizations.types as Record<string, string>)[org.organizationType] ??
    org.organizationType;

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-base font-semibold text-sand-900">{dict.workspace.tabs.settings}</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-sand-700">
            {dict.workspace.settings.typeLabel}
          </span>
          <span className="rounded-full bg-sand-100 px-2.5 py-0.5 text-xs font-semibold text-sand-700">
            {typeLabel}
          </span>
          <StatusBadge
            status={org.verificationStatus}
            label={
              (dict.admin.verificationStatuses as Record<string, string>)[org.verificationStatus] ??
              org.verificationStatus
            }
          />
        </div>

        <SettingsForm
          locale={locale}
          orgId={orgId}
          initial={{
            name: org.name,
            legalName: org.legalName ?? '',
            description: org.description ?? '',
            website: org.website ?? '',
            officialEmail: org.officialEmail ?? '',
            phone: org.phone ?? '',
            address: org.address ?? '',
            logo: org.logo ?? '',
            coverImage: org.coverImage ?? '',
            wilayaId: org.wilayaId ?? '',
            cityId: org.cityId ?? '',
          }}
          wilayas={wilayas}
          cities={cities}
        />
      </Card>
    </div>
  );
}
