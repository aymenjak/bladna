import Link from 'next/link';
import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { buttonClasses } from '@bladna/ui';
import { getDictionary } from '@/ui/i18n';

export default async function NotFound() {
  const headerStore = await headers();
  const { locale } = getDictionary(headerStore.get('x-locale'));
  const t = await getTranslations({ locale, namespace: 'common' });

  return (
    <div className="mx-auto max-w-6xl px-4 py-24 text-center">
      <p className="text-sm font-semibold text-brand-700">404</p>
      <h1 className="mt-2 text-3xl font-bold text-sand-900">{t('missingPageTitle')}</h1>
      <p className="mt-3 text-sand-500">{t('missingPageBody')}</p>
      <Link href={`/${locale}`} className={buttonClasses({ className: 'mt-8' })}>
        {t('backHome')}
      </Link>
    </div>
  );
}
