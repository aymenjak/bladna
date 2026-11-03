'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert, Button, Textarea, buttonClasses } from '@bladna/ui';
import { ApiClientError, api, errorMessageFor, fieldErrors } from '@/ui/api/client';
import { useFocusFirstError } from '@/ui/use-focus-first-error';
import { getDictionary, type LocaleCode } from '@/ui/i18n';
import { questionLabelFor, questionPromptFor, type OpportunityQuestion } from '@/ui/opportunity';

type AuthState =
  { kind: 'checking' } | { kind: 'anonymous' } | { kind: 'needs-email' } | { kind: 'ready' };

/**
 * Apply flow → POST /opportunities/:slug/applications.
 * Server enforces deadline, capacity, age, profile completeness and answers;
 * this form mirrors the validation only for immediate feedback.
 */
export function ApplyForm({
  locale,
  slug,
  questions,
  deadlinePassed,
  initialAuth,
}: {
  locale: LocaleCode;
  slug: string;
  questions: OpportunityQuestion[];
  deadlinePassed: boolean;
  initialAuth: AuthState;
}) {
  const { dict } = getDictionary(locale);
  const router = useRouter();
  const [auth, setAuth] = useState<AuthState>(initialAuth);
  const [motivation, setMotivation] = useState('');
  const [availability, setAvailability] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // DESIGN §8: failed submit focuses the first invalid control (RESEARCH M4).
  useFocusFirstError(errors);

  if (deadlinePassed) {
    return (
      <p className="rounded-lg border border-sand-200 bg-sand-100 px-4 py-3 text-sm text-sand-600">
        {dict.opportunity.deadlinePassed}
      </p>
    );
  }

  if (done) {
    return (
      <div className="space-y-3">
        <Alert tone="success">{dict.opportunity.applySuccess}</Alert>
        <Link href={`/${locale}/dashboard`} className={buttonClasses()}>
          {dict.nav.dashboard}
        </Link>
      </div>
    );
  }

  if (auth.kind === 'anonymous' || auth.kind === 'checking') {
    const next = encodeURIComponent(`/${locale}/opportunities/${slug}`);
    return (
      <div className="space-y-3">
        <p className="text-sm text-sand-600">{dict.opportunity.applyLogin}</p>
        <div className="flex flex-wrap gap-3">
          <Link href={`/${locale}/login?next=${next}`} className={buttonClasses()}>
            {dict.common.signIn}
          </Link>
          <Link
            href={`/${locale}/register?next=${next}`}
            className="rounded-lg border border-sand-200 bg-white inline-flex min-h-11 items-center px-4 text-sm font-semibold text-sand-700 hover:bg-sand-100"
          >
            {dict.auth.createAccount}
          </Link>
        </div>
      </div>
    );
  }

  if (auth.kind === 'needs-email') {
    return (
      <div className="space-y-3">
        <p className="text-sm text-sand-600">{dict.opportunity.applyVerifyEmail}</p>
        <button
          type="button"
          onClick={() => {
            void (async () => {
              try {
                await api.post('/auth/verify-email/resend');
                setError(null);
              } catch (cause) {
                setError(
                  errorMessageFor(cause, {
                    errors: dict.errors,
                    genericFallback: dict.errors.generic,
                  }),
                );
              }
            })();
          }}
          className="rounded-lg border border-sand-200 bg-white inline-flex min-h-11 items-center px-4 text-sm font-semibold text-sand-700 hover:bg-sand-100"
        >
          {dict.dashboard.verifyEmailCta}
        </button>
        {error ? (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setErrors({});

    if (motivation.trim().length < 50) {
      setErrors({ motivation: dict.opportunity.motivationHint });
      return;
    }

    setBusy(true);
    try {
      await api.post(`/opportunities/${slug}/applications`, {
        motivation: motivation.trim(),
        ...(availability.trim() ? { availability: availability.trim() } : {}),
        answers: questions
          .filter((question) => (answers[question.id] ?? '').trim().length > 0)
          .map((question) => ({
            questionId: question.id,
            answer: (answers[question.id] ?? '').trim(),
          })),
      });
      setDone(true);
    } catch (cause) {
      if (cause instanceof ApiClientError) {
        if (cause.code === 'UNAUTHORIZED') {
          setAuth({ kind: 'anonymous' });
          setBusy(false);
          return;
        }
        if (cause.code === 'FORBIDDEN') {
          setAuth({ kind: 'needs-email' });
          setBusy(false);
          return;
        }
        const fields = fieldErrors(cause);
        if (Object.keys(fields).length > 0) {
          setErrors(fields);
          setBusy(false);
          return;
        }
        if (cause.code === 'MFA_REQUIRED') {
          router.push(
            `/${locale}/mfa?next=${encodeURIComponent(`/${locale}/opportunities/${slug}`)}`,
          );
          return;
        }
      }
      setError(
        errorMessageFor(cause, { errors: dict.errors, genericFallback: dict.errors.generic }),
      );
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Textarea
        label={dict.opportunity.motivation}
        name="motivation"
        required
        hint={dict.opportunity.motivationHint}
        value={motivation}
        onChange={(event) => setMotivation(event.target.value)}
        error={errors.motivation}
      />

      <Textarea
        label={dict.opportunity.availabilityLabel}
        name="availability"
        value={availability}
        onChange={(event) => setAvailability(event.target.value)}
        error={errors.availability}
      />

      {questions.map((question) => {
        const prompt = questionPromptFor(question, locale);
        const value = answers[question.id] ?? '';
        const errorFor = errors[`answers.${question.id}`];
        return (
          <div key={question.id} className="space-y-1.5">
            <label htmlFor={`q-${question.id}`} className="block text-sm font-medium text-sand-700">
              {prompt}
              {question.required ? <span className="text-red-700"> *</span> : null}
            </label>
            {question.type === 'CHOICE' && question.options ? (
              <select
                id={`q-${question.id}`}
                required={question.required}
                value={value}
                onChange={(event) =>
                  setAnswers((prev) => ({ ...prev, [question.id]: event.target.value }))
                }
                className="h-10 w-full rounded-lg border border-sand-200 bg-white px-3 py-2 text-sm text-sand-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
              >
                <option value="">—</option>
                {question.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {questionLabelFor(option, locale)}
                  </option>
                ))}
              </select>
            ) : question.type === 'BOOLEAN' ? (
              <select
                id={`q-${question.id}`}
                required={question.required}
                value={value}
                onChange={(event) =>
                  setAnswers((prev) => ({ ...prev, [question.id]: event.target.value }))
                }
                className="h-10 w-full rounded-lg border border-sand-200 bg-white px-3 py-2 text-sm text-sand-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
              >
                <option value="">—</option>
                <option value="true">{dict.common.yes}</option>
                <option value="false">{dict.common.no}</option>
              </select>
            ) : question.type === 'MULTILINE' ? (
              <textarea
                id={`q-${question.id}`}
                required={question.required}
                maxLength={3000}
                value={value}
                onChange={(event) =>
                  setAnswers((prev) => ({ ...prev, [question.id]: event.target.value }))
                }
                className="min-h-24 w-full rounded-lg border border-sand-200 bg-white px-3 py-2 text-sm text-sand-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            ) : (
              <input
                id={`q-${question.id}`}
                required={question.required}
                maxLength={3000}
                value={value}
                onChange={(event) =>
                  setAnswers((prev) => ({ ...prev, [question.id]: event.target.value }))
                }
                className="h-10 w-full rounded-lg border border-sand-200 bg-white px-3 py-2 text-sm text-sand-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            )}
            {errorFor ? (
              <p role="alert" className="text-sm text-red-700">
                {errorFor}
              </p>
            ) : null}
          </div>
        );
      })}

      <Button type="submit" loading={busy} size="lg" className="w-full">
        {dict.common.applyNow}
      </Button>
    </form>
  );
}
