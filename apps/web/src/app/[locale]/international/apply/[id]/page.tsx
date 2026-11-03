import { notFound } from 'next/navigation';
import { isAppError } from '@bladna/types';
import { Alert } from '@bladna/ui';
import { getDictionary, isLocale } from '@/ui/i18n';
import { titleFor } from '@/ui/opportunity';
import { internationalRoutes } from '@/server/modules/international';
import type { Handler } from '@/server/http';
import { invoke } from '@/server/ssr';
import { pageSession } from '@/server/page-session';
import { ApplyFormIntl } from '@/ui/international/apply-form-intl';
import { EligibilityBox } from '@/ui/international/eligibility-box';
import {
  isDeadlinePassed,
  isUuid,
  type EligibilityResult,
  type InternationalOpportunityRow,
} from '@/ui/international/types';

export const dynamic = 'force-dynamic';

/** Look up a handler from the international route table so SSR can call it in-process. */
function handlerOf(method: string, path: string): Handler | null {
  const route = internationalRoutes.find((r) => r.method === method && r.path === path);
  return route?.handler ?? null;
}

const DETAIL_HANDLER: Handler = (() => {
  const handler = handlerOf('GET', '/international/opportunities/:id');
  if (!handler) throw new Error('Missing route handler for GET /international/opportunities/:id');
  return handler;
})();

async function fetchOffer(id: string, locale: string): Promise<InternationalOpportunityRow> {
  const data = await invoke<{ opportunity: InternationalOpportunityRow }>(DETAIL_HANDLER, {
    path: `/international/opportunities/${id}`,
    params: { id },
    locale,
    withCookies: false,
  });
  return data.opportunity;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale } = await params;
  const { dict } = getDictionary(isLocale(locale) ? locale : undefined);
  return {
    title: dict.international.applyTitle,
    description: dict.international.subtitle,
    robots: { index: false, follow: false },
  };
}

export default async function InternationalApplyPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  if (!isUuid(id)) notFound();
  const { dict } = getDictionary(locale);

  // Authenticated-only: anonymous visitors bounce to sign-in with `?next=`
  // (the platform's standard protected-page gate; MFA sessions to /mfa).
  const pagePath = `/${locale}/international/apply/${id}`;
  await pageSession(locale, pagePath);

  let offer: InternationalOpportunityRow;
  try {
    offer = await fetchOffer(id, locale);
  } catch (error) {
    if (isAppError(error) && (error.code === 'NOT_FOUND' || error.code === 'VALIDATION_ERROR')) {
      notFound();
    }
    throw error;
  }

  // Pre-filled eligibility (§11) — ancillary: a missing route or transient
  // failure just omits the box; the form still works.
  let eligibility: EligibilityResult | null = null;
  const eligibilityHandler = handlerOf('GET', '/international/opportunities/:id/eligibility');
  if (eligibilityHandler) {
    try {
      const data = await invoke<{ eligibility: EligibilityResult }>(eligibilityHandler, {
        path: `/international/opportunities/${id}/eligibility`,
        params: { id },
        locale,
      });
      eligibility = data.eligibility;
    } catch {
      eligibility = null;
    }
  }

  const closed = isDeadlinePassed(offer.deadline);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold text-sand-900">{dict.international.applyTitle}</h1>
        <p className="text-sm text-sand-600">
          {titleFor(offer, locale) || offer.program} · {dict.international.provider}:{' '}
          {offer.provider}
        </p>
      </header>

      {eligibility ? <EligibilityBox locale={locale} checks={eligibility.checks} /> : null}

      {closed ? (
        <Alert tone="warning" role="status">
          {dict.international.applyClosed}
        </Alert>
      ) : (
        <ApplyFormIntl locale={locale} opportunityId={id} />
      )}
    </div>
  );
}
