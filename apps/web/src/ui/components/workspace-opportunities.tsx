'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { canTransition, OPPORTUNITY_TRANSITIONS } from '@bladna/domain';
import { Alert, Button, Input, Select, Textarea, useConfirm } from '@bladna/ui';
import {
  BENEFIT_TYPES,
  BENEFIT_VALUES,
  LOCATION_TYPES,
  OPPORTUNITY_TYPES,
  QUESTION_TYPES,
  REQUIREMENT_TYPES,
  type BenefitType,
  type BenefitValue,
  type OpportunityStatus,
  type OpportunityType,
  type QuestionType,
  type RequirementType,
} from '@bladna/types';
import { api, errorMessageFor, fieldErrors as extractFieldErrors } from '@/ui/api/client';
import { useFocusFirstError } from '@/ui/use-focus-first-error';
import { getDictionary, type LocaleCode } from '@/ui/i18n';
import { InitiativeConsole } from '@/ui/components/initiative-console';

/**
 * Client mutations for the workspace opportunities tab: create, edit, soft
 * delete and state-machine transitions. Status only ever changes through
 * `POST …/transition`, so every button renders only when
 * `OPPORTUNITY_TRANSITIONS` allows the move (mirrors the server's
 * `ACTION_TARGET` in server/modules/opportunities.ts); anything the server
 * still rejects (permissions, org verification, …) surfaces its own message.
 * PUBLISH/REJECT are platform moderation (review-before-publish) and live in
 * the admin console only: organizations submit for review, withdraw and steer
 * the lifecycle — they never publish.
 */

/** Row data handed over by the server page — details are fetched on demand. */
export interface OpportunityRowData {
  id: string;
  status: OpportunityStatus;
}

/** Mirrors `ACTION_TARGET` in server/modules/opportunities.ts (action → status). */
const ACTION_TARGET: Record<string, OpportunityStatus> = {
  SUBMIT_REVIEW: 'PENDING_REVIEW',
  PUBLISH: 'PUBLISHED',
  REJECT: 'REJECTED',
  SUSPEND: 'SUSPENDED',
  ARCHIVE: 'ARCHIVED',
  RESTORE_DRAFT: 'DRAFT',
  EXPIRE: 'EXPIRED',
};

/**
 * Actions an organization may run — same order as
 * `transitionOpportunitySchema.action`, minus the moderation pair
 * (PUBLISH/REJECT), which requires the platform grant.
 */
const TRANSITION_ACTIONS = [
  'SUBMIT_REVIEW',
  'SUSPEND',
  'ARCHIVE',
  'RESTORE_DRAFT',
  'EXPIRE',
] as const;
type TransitionAction = (typeof TRANSITION_ACTIONS)[number];

/** Soft delete is limited to these statuses (DELETE handler rule). */
const DELETABLE_STATUSES: readonly OpportunityStatus[] = ['DRAFT', 'REJECTED', 'ARCHIVED'];

type LocationTypeValue = (typeof LOCATION_TYPES)[number];

/** Editable sub-rows of the opportunity form (server shapes, minus ids). */
interface RequirementValue {
  type: RequirementType;
  labelAr: string;
  labelFr: string;
  labelEn: string;
  description: string;
  required: boolean;
}

interface BenefitValueRow {
  benefitType: BenefitType;
  value: BenefitValue;
  note: string;
}

interface QuestionValue {
  promptAr: string;
  promptFr: string;
  promptEn: string;
  type: QuestionType;
  required: boolean;
  /** CHOICE only — one option per line; the line is value = labelAr = labelFr = labelEn. */
  optionsText: string;
}

interface FormValues {
  titleAr: string;
  titleFr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionFr: string;
  descriptionEn: string;
  type: OpportunityType;
  locationType: LocationTypeValue;
  campaignId: string;
  address: string;
  startDate: string;
  endDate: string;
  applicationDeadline: string;
  capacity: string;
  minimumAge: string;
  maximumAge: string;
  estimatedHours: string;
  sourceUrl: string;
  requirements: RequirementValue[];
  benefits: BenefitValueRow[];
  questions: QuestionValue[];
}

const EMPTY_VALUES: FormValues = {
  titleAr: '',
  titleFr: '',
  titleEn: '',
  descriptionAr: '',
  descriptionFr: '',
  descriptionEn: '',
  type: 'LOCAL',
  locationType: 'PHYSICAL',
  campaignId: '',
  address: '',
  startDate: '',
  endDate: '',
  applicationDeadline: '',
  capacity: '',
  minimumAge: '',
  maximumAge: '',
  estimatedHours: '',
  sourceUrl: '',
  requirements: [],
  benefits: [],
  questions: [],
};

/** `GET /orgs/:orgId/opportunities/:id` — used to pre-fill the edit form. */
interface OpportunityDetailResult {
  opportunity: {
    titleAr: string;
    titleFr: string;
    titleEn: string;
    descriptionAr: string;
    descriptionFr: string;
    descriptionEn: string;
    type: OpportunityType;
    locationType: LocationTypeValue;
    campaignId: string | null;
    address: string | null;
    startDate: string | null;
    endDate: string | null;
    applicationDeadline: string | null;
    capacity: number | null;
    minimumAge: number | null;
    maximumAge: number | null;
    estimatedHours: number | string | null;
    sourceUrl: string | null;
    requirements: {
      type: RequirementType;
      labelAr: string;
      labelFr: string;
      labelEn: string;
      description: string | null;
      required: boolean;
    }[];
    benefits: { benefitType: BenefitType; value: BenefitValue; note: string | null }[];
    questions: {
      promptAr: string;
      promptFr: string;
      promptEn: string;
      type: QuestionType;
      required: boolean;
      options: { value: string; labelAr?: string; labelFr?: string; labelEn?: string }[] | null;
      sortOrder: number;
    }[];
  };
}

const LOCALIZED_KEYS = [
  'titleAr',
  'titleFr',
  'titleEn',
  'descriptionAr',
  'descriptionFr',
  'descriptionEn',
] as const;

function dateInput(value: string | null): string {
  return value ? value.slice(0, 10) : '';
}

function numberInput(value: number | string | null): string {
  return value === null ? '' : String(value);
}

function numberOrNull(value: string): number | null {
  return value.trim() === '' ? null : Number(value);
}

function detailToValues(detail: OpportunityDetailResult['opportunity']): FormValues {
  return {
    titleAr: detail.titleAr,
    titleFr: detail.titleFr,
    titleEn: detail.titleEn,
    descriptionAr: detail.descriptionAr,
    descriptionFr: detail.descriptionFr,
    descriptionEn: detail.descriptionEn,
    type: detail.type,
    locationType: detail.locationType,
    campaignId: detail.campaignId ?? '',
    address: detail.address ?? '',
    startDate: dateInput(detail.startDate),
    endDate: dateInput(detail.endDate),
    applicationDeadline: dateInput(detail.applicationDeadline),
    capacity: numberInput(detail.capacity),
    minimumAge: numberInput(detail.minimumAge),
    maximumAge: numberInput(detail.maximumAge),
    estimatedHours: numberInput(detail.estimatedHours),
    sourceUrl: detail.sourceUrl ?? '',
    requirements: (detail.requirements ?? []).map((requirement) => ({
      type: requirement.type,
      labelAr: requirement.labelAr,
      labelFr: requirement.labelFr,
      labelEn: requirement.labelEn,
      description: requirement.description ?? '',
      required: requirement.required,
    })),
    benefits: (detail.benefits ?? []).map((benefit) => ({
      benefitType: benefit.benefitType,
      value: benefit.value,
      note: benefit.note ?? '',
    })),
    questions: [...(detail.questions ?? [])]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((question) => ({
        promptAr: question.promptAr,
        promptFr: question.promptFr,
        promptEn: question.promptEn,
        type: question.type,
        required: question.required,
        optionsText: Array.isArray(question.options)
          ? question.options
              .map((option) => option.value)
              .filter((value): value is string => typeof value === 'string' && value !== '')
              .join('\n')
          : '',
      })),
  };
}

/** CHOICE options → the exact `opportunityQuestionSchema` option shape. */
function optionsFromText(
  text: string,
): { value: string; labelAr: string; labelFr: string; labelEn: string }[] | undefined {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  if (lines.length === 0) return undefined;
  return lines.map((line) => ({ value: line, labelAr: line, labelFr: line, labelEn: line }));
}

/** Form values → exact `createOpportunitySchema` / `updateOpportunitySchema` payload. */
function toBody(values: FormValues) {
  return {
    titleAr: values.titleAr.trim(),
    titleFr: values.titleFr.trim(),
    titleEn: values.titleEn.trim(),
    descriptionAr: values.descriptionAr.trim(),
    descriptionFr: values.descriptionFr.trim(),
    descriptionEn: values.descriptionEn.trim(),
    type: values.type,
    locationType: values.locationType,
    campaignId: values.campaignId || null,
    address: values.address.trim() || null,
    startDate: values.startDate || null,
    endDate: values.endDate || null,
    applicationDeadline: values.applicationDeadline || null,
    capacity: numberOrNull(values.capacity),
    minimumAge: numberOrNull(values.minimumAge),
    maximumAge: numberOrNull(values.maximumAge),
    estimatedHours: numberOrNull(values.estimatedHours),
    sourceUrl: values.sourceUrl.trim() || null,
    requirements: values.requirements.map((requirement) => ({
      type: requirement.type,
      labelAr: requirement.labelAr.trim(),
      labelFr: requirement.labelFr.trim(),
      labelEn: requirement.labelEn.trim(),
      description: requirement.description.trim() || null,
      required: requirement.required,
    })),
    benefits: values.benefits.map((benefit) => ({
      benefitType: benefit.benefitType,
      value: benefit.value,
      note: benefit.note.trim() || null,
    })),
    questions: values.questions.map((question) => {
      const options = optionsFromText(question.optionsText);
      return {
        promptAr: question.promptAr.trim(),
        promptFr: question.promptFr.trim(),
        promptEn: question.promptEn.trim(),
        type: question.type,
        required: question.required,
        ...(question.type === 'CHOICE' && options ? { options } : {}),
      };
    }),
  };
}

/** Server row arrays → comparable JSON (dropped fields must not force a rewrite). */
function questionsSnapshot(questions: QuestionValue[]): string {
  return JSON.stringify(
    questions.map((question) => ({
      promptAr: question.promptAr.trim(),
      promptFr: question.promptFr.trim(),
      promptEn: question.promptEn.trim(),
      type: question.type,
      required: question.required,
      ...(question.type === 'CHOICE' && optionsFromText(question.optionsText)
        ? { options: optionsFromText(question.optionsText) }
        : {}),
    })),
  );
}

function OpportunityForm({
  locale,
  orgId,
  mode,
  itemId,
  initial,
  onSaved,
  onCancel,
}: {
  locale: LocaleCode;
  orgId: string;
  mode: 'create' | 'edit';
  itemId: string | null;
  initial?: FormValues;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { dict } = getDictionary(locale);
  const [values, setValues] = useState<FormValues>(initial ?? EMPTY_VALUES);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  useFocusFirstError(fieldErrors);
  const form = dict.workspace.opportunities.form;

  // Campaign options for the "linked campaign" select — fetched once per form
  // mount; the select degrades to "no campaign" if the request fails.
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);
  const [campaignsError, setCampaignsError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await api.get<{ items: { id: string; name: string }[] }>(
          `/orgs/${orgId}/campaigns?limit=100`,
        );
        if (!cancelled) setCampaigns(result.data.items);
      } catch {
        if (!cancelled) setCampaignsError(form.campaignLoadError);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  function update<K extends keyof FormValues>(key: K, value: FormValues[K]): void {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function updateRequirement(index: number, patch: Partial<RequirementValue>): void {
    setValues((prev) => ({
      ...prev,
      requirements: prev.requirements.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    }));
  }

  function updateBenefit(index: number, patch: Partial<BenefitValueRow>): void {
    setValues((prev) => ({
      ...prev,
      benefits: prev.benefits.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    }));
  }

  function updateQuestion(index: number, patch: Partial<QuestionValue>): void {
    setValues((prev) => ({
      ...prev,
      questions: prev.questions.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    }));
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    const missing: Record<string, string> = {};
    for (const key of LOCALIZED_KEYS) {
      if (!values[key].trim()) missing[key] = dict.common.required;
    }
    if (Object.keys(missing).length > 0) {
      setFieldErrors(missing);
      return;
    }
    if (mode === 'edit' && !itemId) {
      setError(dict.errors.generic);
      return;
    }
    setBusy(true);
    try {
      const body = toBody(values) as Record<string, unknown>;
      if (mode === 'create') {
        await api.post(`/orgs/${orgId}/opportunities`, body);
      } else if (itemId) {
        // The server refuses question rewrites once applications exist — omit
        // the key entirely when questions are unchanged so a plain edit passes.
        if (questionsSnapshot(values.questions) === questionsSnapshot(initial?.questions ?? [])) {
          delete body.questions;
        }
        await api.patch(`/orgs/${orgId}/opportunities/${encodeURIComponent(itemId)}`, body);
      } else {
        setError(dict.errors.generic);
        return;
      }
      onSaved();
    } catch (cause) {
      setFieldErrors(extractFieldErrors(cause));
      setError(
        errorMessageFor(cause, { errors: dict.errors, genericFallback: dict.errors.generic }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="space-y-4 rounded-xl border border-sand-200 bg-white p-6"
    >
      <h3 className="text-base font-semibold text-sand-900">
        {mode === 'create'
          ? dict.workspace.opportunities.createTitle
          : dict.workspace.opportunities.editTitle}
      </h3>
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Input
          label={form.titleAr}
          required
          value={values.titleAr}
          onChange={(event) => update('titleAr', event.target.value)}
          error={fieldErrors.titleAr}
        />
        <Input
          label={form.titleFr}
          required
          value={values.titleFr}
          onChange={(event) => update('titleFr', event.target.value)}
          error={fieldErrors.titleFr}
        />
        <Input
          label={form.titleEn}
          required
          value={values.titleEn}
          onChange={(event) => update('titleEn', event.target.value)}
          error={fieldErrors.titleEn}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Textarea
          label={form.descAr}
          required
          value={values.descriptionAr}
          onChange={(event) => update('descriptionAr', event.target.value)}
          error={fieldErrors.descriptionAr}
        />
        <Textarea
          label={form.descFr}
          required
          value={values.descriptionFr}
          onChange={(event) => update('descriptionFr', event.target.value)}
          error={fieldErrors.descriptionFr}
        />
        <Textarea
          label={form.descEn}
          required
          value={values.descriptionEn}
          onChange={(event) => update('descriptionEn', event.target.value)}
          error={fieldErrors.descriptionEn}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label={form.type}
          value={values.type}
          onChange={(event) => update('type', event.target.value as OpportunityType)}
          error={fieldErrors.type}
        >
          {OPPORTUNITY_TYPES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </Select>
        <Select
          label={form.locationType}
          value={values.locationType}
          onChange={(event) => update('locationType', event.target.value as LocationTypeValue)}
          error={fieldErrors.locationType}
        >
          {LOCATION_TYPES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label={form.campaign}
          value={values.campaignId}
          onChange={(event) => update('campaignId', event.target.value)}
          error={fieldErrors.campaignId}
          hint={form.campaignNone}
        >
          <option value="">{form.campaignNone}</option>
          {campaigns.map((campaign) => (
            <option key={campaign.id} value={campaign.id}>
              {campaign.name}
            </option>
          ))}
        </Select>
        {campaignsError ? (
          <p className="self-end pb-3 text-xs text-red-700">{campaignsError}</p>
        ) : null}
      </div>

      <Input
        label={form.address}
        value={values.address}
        onChange={(event) => update('address', event.target.value)}
        error={fieldErrors.address}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Input
          label={form.startDate}
          type="date"
          value={values.startDate}
          onChange={(event) => update('startDate', event.target.value)}
          error={fieldErrors.startDate}
        />
        <Input
          label={form.endDate}
          type="date"
          value={values.endDate}
          onChange={(event) => update('endDate', event.target.value)}
          error={fieldErrors.endDate}
        />
        <Input
          label={form.deadline}
          type="date"
          value={values.applicationDeadline}
          onChange={(event) => update('applicationDeadline', event.target.value)}
          error={fieldErrors.applicationDeadline}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Input
          label={form.capacity}
          type="number"
          min={1}
          value={values.capacity}
          onChange={(event) => update('capacity', event.target.value)}
          error={fieldErrors.capacity}
        />
        <Input
          label={form.minimumAge}
          type="number"
          min={0}
          value={values.minimumAge}
          onChange={(event) => update('minimumAge', event.target.value)}
          error={fieldErrors.minimumAge}
        />
        <Input
          label={form.maximumAge}
          type="number"
          min={0}
          value={values.maximumAge}
          onChange={(event) => update('maximumAge', event.target.value)}
          error={fieldErrors.maximumAge}
        />
        <Input
          label={form.estimatedHours}
          type="number"
          min={0}
          step="0.5"
          value={values.estimatedHours}
          onChange={(event) => update('estimatedHours', event.target.value)}
          error={fieldErrors.estimatedHours}
        />
      </div>

      <Input
        label={form.sourceUrl}
        type="url"
        value={values.sourceUrl}
        onChange={(event) => update('sourceUrl', event.target.value)}
        error={fieldErrors.sourceUrl}
      />

      {/* Requirements (≤15) — what applicants must bring or be. */}
      <section className="space-y-3 rounded-xl border border-sand-200 bg-sand-50/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-semibold text-sand-800">{form.requirements}</h4>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              setValues((prev) =>
                prev.requirements.length >= 15
                  ? prev
                  : {
                      ...prev,
                      requirements: [
                        ...prev.requirements,
                        {
                          type: 'OTHER' as const,
                          labelAr: '',
                          labelFr: '',
                          labelEn: '',
                          description: '',
                          required: true,
                        },
                      ],
                    },
              )
            }
            disabled={values.requirements.length >= 15}
            className="border-brand-300 bg-brand-50 text-brand-800 hover:bg-brand-100 focus-visible:outline-brand-700"
          >
            {form.addRequirement}
          </Button>
        </div>
        {values.requirements.length === 0 ? (
          <p className="text-xs text-sand-500">{dict.common.empty}</p>
        ) : null}
        {values.requirements.map((requirement, index) => (
          <div key={index} className="space-y-3 rounded-lg border border-sand-200 bg-white p-3">
            <div className="grid gap-3 sm:grid-cols-4">
              <Select
                label={form.requirementType}
                value={requirement.type}
                onChange={(event) =>
                  updateRequirement(index, { type: event.target.value as RequirementType })
                }
              >
                {REQUIREMENT_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {dict.opportunity.requirementTypes[value]}
                  </option>
                ))}
              </Select>
              <Input
                label={form.labelAr}
                required
                value={requirement.labelAr}
                onChange={(event) => updateRequirement(index, { labelAr: event.target.value })}
                error={fieldErrors[`requirements.${index}.labelAr`]}
              />
              <Input
                label={form.labelFr}
                required
                value={requirement.labelFr}
                onChange={(event) => updateRequirement(index, { labelFr: event.target.value })}
                error={fieldErrors[`requirements.${index}.labelFr`]}
              />
              <Input
                label={form.labelEn}
                required
                value={requirement.labelEn}
                onChange={(event) => updateRequirement(index, { labelEn: event.target.value })}
                error={fieldErrors[`requirements.${index}.labelEn`]}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-56 flex-1">
                <Input
                  label={`${dict.common.description} (${dict.common.optional})`}
                  value={requirement.description}
                  onChange={(event) =>
                    updateRequirement(index, { description: event.target.value })
                  }
                  error={fieldErrors[`requirements.${index}.description`]}
                />
              </div>
              <label className="flex items-center gap-2 pb-2 text-sm text-sand-700">
                <input
                  type="checkbox"
                  checked={requirement.required}
                  onChange={(event) => updateRequirement(index, { required: event.target.checked })}
                />
                {form.requiredFlag}
              </label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setValues((prev) => ({
                    ...prev,
                    requirements: prev.requirements.filter((_, i) => i !== index),
                  }))
                }
                className="text-red-700 hover:border-red-300 hover:bg-red-50 focus-visible:outline-red-700"
              >
                {form.removeRow}
              </Button>
            </div>
          </div>
        ))}
      </section>

      {/* Benefits (≤10) — what the opportunity covers. */}
      <section className="space-y-3 rounded-xl border border-sand-200 bg-sand-50/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-semibold text-sand-800">{form.benefits}</h4>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              setValues((prev) =>
                prev.benefits.length >= 10
                  ? prev
                  : {
                      ...prev,
                      benefits: [
                        ...prev.benefits,
                        {
                          benefitType: 'TRANSPORTATION' as const,
                          value: 'UNKNOWN' as const,
                          note: '',
                        },
                      ],
                    },
              )
            }
            disabled={values.benefits.length >= 10}
            className="border-brand-300 bg-brand-50 text-brand-800 hover:bg-brand-100 focus-visible:outline-brand-700"
          >
            {form.addBenefit}
          </Button>
        </div>
        {values.benefits.length === 0 ? (
          <p className="text-xs text-sand-500">{dict.common.empty}</p>
        ) : null}
        {values.benefits.map((benefit, index) => (
          <div
            key={index}
            className="grid gap-3 rounded-lg border border-sand-200 bg-white p-3 sm:grid-cols-4"
          >
            <Select
              label={form.benefitType}
              value={benefit.benefitType}
              onChange={(event) =>
                updateBenefit(index, { benefitType: event.target.value as BenefitType })
              }
            >
              {BENEFIT_TYPES.map((value) => (
                <option key={value} value={value}>
                  {dict.opportunity.benefitTypes[value]}
                </option>
              ))}
            </Select>
            <Select
              label={form.benefitValue}
              value={benefit.value}
              onChange={(event) =>
                updateBenefit(index, { value: event.target.value as BenefitValue })
              }
            >
              {BENEFIT_VALUES.map((value) => (
                <option key={value} value={value}>
                  {dict.opportunity.benefitValues[value]}
                </option>
              ))}
            </Select>
            <Input
              label={`${form.benefitNote} (${dict.common.optional})`}
              value={benefit.note}
              onChange={(event) => updateBenefit(index, { note: event.target.value })}
              error={fieldErrors[`benefits.${index}.note`]}
            />
            <div className="flex items-end pb-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setValues((prev) => ({
                    ...prev,
                    benefits: prev.benefits.filter((_, i) => i !== index),
                  }))
                }
                className="text-red-700 hover:border-red-300 hover:bg-red-50 focus-visible:outline-red-700"
              >
                {form.removeRow}
              </Button>
            </div>
          </div>
        ))}
      </section>

      {/* Application questions (≤10) — asked when someone applies. */}
      <section className="space-y-3 rounded-xl border border-sand-200 bg-sand-50/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-semibold text-sand-800">{form.questions}</h4>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              setValues((prev) =>
                prev.questions.length >= 10
                  ? prev
                  : {
                      ...prev,
                      questions: [
                        ...prev.questions,
                        {
                          promptAr: '',
                          promptFr: '',
                          promptEn: '',
                          type: 'TEXT' as const,
                          required: false,
                          optionsText: '',
                        },
                      ],
                    },
              )
            }
            disabled={values.questions.length >= 10}
            className="border-brand-300 bg-brand-50 text-brand-800 hover:bg-brand-100 focus-visible:outline-brand-700"
          >
            {form.addQuestion}
          </Button>
        </div>
        {values.questions.length === 0 ? (
          <p className="text-xs text-sand-500">{dict.common.empty}</p>
        ) : null}
        {values.questions.map((question, index) => (
          <div key={index} className="space-y-3 rounded-lg border border-sand-200 bg-white p-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Input
                label={form.promptAr}
                required
                value={question.promptAr}
                onChange={(event) => updateQuestion(index, { promptAr: event.target.value })}
                error={fieldErrors[`questions.${index}.promptAr`]}
              />
              <Input
                label={form.promptFr}
                required
                value={question.promptFr}
                onChange={(event) => updateQuestion(index, { promptFr: event.target.value })}
                error={fieldErrors[`questions.${index}.promptFr`]}
              />
              <Input
                label={form.promptEn}
                required
                value={question.promptEn}
                onChange={(event) => updateQuestion(index, { promptEn: event.target.value })}
                error={fieldErrors[`questions.${index}.promptEn`]}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Select
                label={form.questionType}
                className="max-w-56"
                value={question.type}
                onChange={(event) =>
                  updateQuestion(index, { type: event.target.value as QuestionType })
                }
              >
                {QUESTION_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {dict.opportunity.questionTypes[value]}
                  </option>
                ))}
              </Select>
              <label className="flex items-center gap-2 pb-2 text-sm text-sand-700">
                <input
                  type="checkbox"
                  checked={question.required}
                  onChange={(event) => updateQuestion(index, { required: event.target.checked })}
                />
                {form.requiredFlag}
              </label>
              <div className="ml-auto">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setValues((prev) => ({
                      ...prev,
                      questions: prev.questions.filter((_, i) => i !== index),
                    }))
                  }
                  className="text-red-700 hover:border-red-300 hover:bg-red-50 focus-visible:outline-red-700"
                >
                  {form.removeRow}
                </Button>
              </div>
            </div>
            {question.type === 'CHOICE' ? (
              <div>
                <Textarea
                  label={form.options}
                  hint={form.optionsHint}
                  rows={3}
                  value={question.optionsText}
                  onChange={(event) => updateQuestion(index, { optionsText: event.target.value })}
                  error={fieldErrors[`questions.${index}.options`]}
                />
              </div>
            ) : null}
          </div>
        ))}
      </section>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={busy}>
          {mode === 'create' ? dict.workspace.opportunities.create : dict.common.save}
        </Button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-sand-200 bg-white inline-flex min-h-11 items-center px-4 text-sm font-semibold text-sand-700 hover:bg-sand-100"
        >
          {dict.common.cancel}
        </button>
      </div>
    </form>
  );
}

/** “New opportunity” toggle + create form, rendered above the list. */
export function OpportunityCreateControl({ locale, orgId }: { locale: LocaleCode; orgId: string }) {
  const { dict } = getDictionary(locale);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {notice ? <p className="text-sm font-medium text-brand-700">{notice}</p> : null}
      {open ? (
        <OpportunityForm
          locale={locale}
          orgId={orgId}
          mode="create"
          itemId={null}
          onSaved={() => {
            setOpen(false);
            setNotice(dict.workspace.opportunities.created);
            router.refresh();
          }}
          onCancel={() => setOpen(false)}
        />
      ) : (
        <Button
          type="button"
          onClick={() => {
            setNotice(null);
            setOpen(true);
          }}
        >
          {dict.workspace.opportunities.create}
        </Button>
      )}
    </div>
  );
}

/** Per-row controls: edit (fetched detail), soft delete, legal transitions. */
export function OpportunityRowActions({
  locale,
  orgId,
  item,
}: {
  locale: LocaleCode;
  orgId: string;
  item: OpportunityRowData;
}) {
  const { dict } = getDictionary(locale);
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [detail, setDetail] = useState<OpportunityDetailResult['opportunity'] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const legalActions = TRANSITION_ACTIONS.filter((action) =>
    canTransition(OPPORTUNITY_TRANSITIONS, item.status, ACTION_TARGET[action]),
  );
  const canDelete = DELETABLE_STATUSES.includes(item.status);

  function fail(cause: unknown): void {
    setError(errorMessageFor(cause, { errors: dict.errors, genericFallback: dict.errors.generic }));
  }

  async function openEdit(): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      const result = await api.get<OpportunityDetailResult>(
        `/orgs/${orgId}/opportunities/${encodeURIComponent(item.id)}`,
      );
      setDetail(result.data.opportunity);
      setEditing(true);
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  }

  async function remove(): Promise<void> {
    if (!(await confirm(dict.workspace.opportunities.confirmDelete))) return;
    setError(null);
    setBusy(true);
    try {
      await api.delete(`/orgs/${orgId}/opportunities/${encodeURIComponent(item.id)}`);
      setNotice(dict.workspace.opportunities.deleted);
      router.refresh();
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  }

  async function runTransition(action: TransitionAction): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      await api.post(`/orgs/${orgId}/opportunities/${encodeURIComponent(item.id)}/transition`, {
        action,
      });
      setNotice(dict.workspace.opportunities.updated);
      router.refresh();
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  }

  if (editing && detail) {
    return (
      <div className="mt-3">
        <OpportunityForm
          locale={locale}
          orgId={orgId}
          mode="edit"
          itemId={item.id}
          initial={detailToValues(detail)}
          onSaved={() => {
            setEditing(false);
            setDetail(null);
            setNotice(dict.workspace.opportunities.updated);
            router.refresh();
          }}
          onCancel={() => {
            setEditing(false);
            setDetail(null);
          }}
        />
      </div>
    );
  }

  if (consoleOpen) {
    return (
      <div className="mt-3">
        <InitiativeConsole
          locale={locale}
          orgId={orgId}
          opportunityId={item.id}
          onClose={() => setConsoleOpen(false)}
        />
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      {notice ? <p className="text-sm font-medium text-brand-700">{notice}</p> : null}
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void openEdit()}
          disabled={busy}
          className="hover:border-brand-300 hover:text-brand-700"
        >
          {dict.admin.actions.edit}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setConsoleOpen(true)}
          disabled={busy}
          className="hover:border-brand-300 hover:text-brand-700"
        >
          {dict.initiativeConsole.open}
        </Button>
        {canDelete ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void remove()}
            disabled={busy}
            className="text-red-700 hover:border-red-300 hover:bg-red-50 focus-visible:outline-red-700"
          >
            {dict.admin.actions.delete}
          </Button>
        ) : null}
        {legalActions.map((action) => (
          <Button
            key={action}
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void runTransition(action)}
            disabled={busy}
            className="hover:border-brand-300 hover:text-brand-700"
          >
            {dict.workspace.opportunities.actions[action]}
          </Button>
        ))}
      </div>
      {legalActions.length > 0 ? (
        <p className="text-xs text-sand-500">{dict.workspace.opportunities.transitionHint}</p>
      ) : null}
    </div>
  );
}
