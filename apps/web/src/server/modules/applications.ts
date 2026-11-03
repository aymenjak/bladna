// Applications module (spec §39, §107).
//
// Volunteer side: apply to a published opportunity (validated answers, deadline,
// capacity, age), list/inspect/withdraw own applications.
// Organization side: review lists, status transitions through
// APPLICATION_TRANSITIONS only, bulk decisions with per-item results.
// Every decision notifies the applicant in their locale and writes an audit row.

import { getPrisma, type Prisma } from '@bladna/database';
import { APPLICATION_TRANSITIONS, assertTransition } from '@bladna/domain';
import { AppError, type LocaleCode, type NotificationType } from '@bladna/types';
import {
  buildPageMeta,
  maskEmail,
  normalizePageParams,
  pickLocalized,
  resolveLocale,
} from '@bladna/utils';
import {
  bulkApplicationActionSchema,
  createApplicationSchema,
  idParamsSchema,
  myApplicationsQuerySchema,
  opportunityApplicationsQuerySchema,
  opportunityParamsSchema,
  updateApplicationStatusSchema,
} from '@bladna/validation';
import { z } from 'zod';
import { body, pathParams, query, type RequestContext } from '../http';
import { requireAuth, requireOrgMembership, requireVerifiedEmail } from '../guards';
import { isUniqueViolation } from '../lib/prisma-errors';
import { audit } from '../services/audit';
import { notify } from '../services/notifications';
import type { AppRoute } from '../router';

const appParamsSchema = z.object({ applicationId: z.string().uuid() });

type NoticeKey =
  | 'submitted'
  | 'under_review'
  | 'accepted'
  | 'rejected'
  | 'waitlisted'
  | 'completed'
  | 'no_show'
  | 'withdrawn';

/** Trilingual notification copy — placeholder `{opportunity}` is replaced. */
const NOTICE: Record<NoticeKey, Record<LocaleCode, { title: string; body: string }>> = {
  submitted: {
    ar: {
      title: 'تم استلام طلبك',
      body: 'تم استلام طلبك للفرصة "{opportunity}" وسيقوم الفريق بمراجعته.',
    },
    fr: {
      title: 'Candidature reçue',
      body: 'Votre candidature pour « {opportunity} » a bien été reçue. L’équipe va l’examiner.',
    },
    en: {
      title: 'Application received',
      body: 'Your application for "{opportunity}" was received. The team will review it.',
    },
  },
  under_review: {
    ar: { title: 'قيد المراجعة', body: 'تمت إعادة طلبك للفرصة "{opportunity}" إلى قيد المراجعة.' },
    fr: {
      title: 'Candidature en cours d’examen',
      body: 'Votre candidature pour « {opportunity} » est en cours d’examen.',
    },
    en: {
      title: 'Application under review',
      body: 'Your application for "{opportunity}" is now under review.',
    },
  },
  accepted: {
    ar: { title: 'تم قبول طلبك', body: 'مبروك! تم قبول طلبك للفرصة "{opportunity}".' },
    fr: {
      title: 'Candidature acceptée',
      body: 'Félicitations ! Votre candidature pour « {opportunity} » a été acceptée.',
    },
    en: {
      title: 'Application accepted',
      body: 'Congratulations! Your application for "{opportunity}" was accepted.',
    },
  },
  rejected: {
    ar: {
      title: 'لم يتم قبول طلبك',
      body: 'لم يتم قبول طلبك للفرصة "{opportunity}". يمكنك ترشيح فرص أخرى.',
    },
    fr: {
      title: 'Candidature non retenue',
      body: 'Votre candidature pour « {opportunity} » n’a pas été retenue. Vous pouvez viser d’autres opportunités.',
    },
    en: {
      title: 'Application not selected',
      body: 'Your application for "{opportunity}" was not selected. Feel free to apply to other opportunities.',
    },
  },
  waitlisted: {
    ar: { title: 'قائمة الانتظار', body: 'أُدرج طلبك للفرصة "{opportunity}" في قائمة الانتظار.' },
    fr: {
      title: 'Liste d’attente',
      body: 'Votre candidature pour « {opportunity} » figure sur la liste d’attente.',
    },
    en: { title: 'Waitlisted', body: 'Your application for "{opportunity}" has been waitlisted.' },
  },
  completed: {
    ar: { title: 'اكتملت المشاركة', body: 'تم تحديد مشاركتك في "{opportunity}" كمكتملة.' },
    fr: {
      title: 'Participation terminée',
      body: 'Votre participation à « {opportunity} » est marquée comme terminée.',
    },
    en: {
      title: 'Participation completed',
      body: 'Your participation in "{opportunity}" is marked as completed.',
    },
  },
  no_show: {
    ar: { title: 'لم تُسجَّل المشاركة', body: 'لم تُسجَّل حضورك للفرصة "{opportunity}".' },
    fr: {
      title: 'Absence enregistrée',
      body: 'Votre présence à « {opportunity} » n’a pas été enregistrée.',
    },
    en: {
      title: 'No attendance recorded',
      body: 'Your attendance for "{opportunity}" was not recorded.',
    },
  },
  withdrawn: {
    ar: { title: 'تم سحب الطلب', body: 'تم سحب طلب الفرصة "{opportunity}".' },
    fr: {
      title: 'Candidature retirée',
      body: 'La candidature pour « {opportunity} » a été retirée.',
    },
    en: {
      title: 'Application withdrawn',
      body: 'The application for "{opportunity}" has been withdrawn.',
    },
  },
};

const NOTICE_TYPE: Record<NoticeKey, NotificationType> = {
  submitted: 'APPLICATION_SUBMITTED',
  under_review: 'APPLICATION_UNDER_REVIEW',
  accepted: 'APPLICATION_ACCEPTED',
  rejected: 'APPLICATION_REJECTED',
  waitlisted: 'SYSTEM',
  completed: 'SYSTEM',
  no_show: 'SYSTEM',
  withdrawn: 'SYSTEM',
};

function noticeText(key: NoticeKey, locale: LocaleCode, opportunityTitle: string) {
  const copy = NOTICE[key][locale];
  return { title: copy.title, body: copy.body.replace('{opportunity}', opportunityTitle) };
}

/** Organization reviewers (OWNER/ADMIN/MANAGER) receive application events. */
async function notifyOrgReviewers(
  organizationId: string,
  key: NoticeKey,
  opportunityTitle: string,
  data: Record<string, unknown>,
): Promise<void> {
  const members = await getPrisma().organizationMember.findMany({
    where: { organizationId, status: 'ACTIVE', role: { in: ['OWNER', 'ADMIN', 'MANAGER'] } },
    select: { user: { select: { id: true, preferredLanguage: true } } },
  });
  for (const member of members) {
    const locale = resolveLocale(member.user.preferredLanguage.toLowerCase());
    const { title, body } = noticeText(key, locale, opportunityTitle);
    await notify({ userId: member.user.id, type: NOTICE_TYPE[key], title, body, data });
  }
}

async function notifyApplicant(
  volunteerProfileId: string,
  key: NoticeKey,
  opportunityTitle: string,
  data: Record<string, unknown>,
): Promise<void> {
  const profile = await getPrisma().volunteerProfile.findUnique({
    where: { id: volunteerProfileId },
    select: { user: { select: { id: true, preferredLanguage: true } } },
  });
  if (!profile) return;
  const locale = resolveLocale(profile.user.preferredLanguage.toLowerCase());
  const { title, body } = noticeText(key, locale, opportunityTitle);
  await notify({ userId: profile.user.id, type: NOTICE_TYPE[key], title, body, data });
}

function ageFromDate(dob: Date): number {
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const month = now.getMonth() - dob.getMonth();
  if (month < 0 || (month === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age;
}

// ── Volunteer side ──────────────────────────────────────────────

async function apply(ctx: RequestContext): Promise<unknown> {
  const sessionUser = await requireAuth(ctx);
  requireVerifiedEmail(sessionUser);
  const { slug } = pathParams(ctx, opportunityParamsSchema);
  const input = await body(ctx, createApplicationSchema);
  const prisma = getPrisma();

  const opportunity = await prisma.opportunity.findFirst({
    where: { slug, status: 'PUBLISHED', deletedAt: null },
    select: {
      id: true,
      titleAr: true,
      titleFr: true,
      titleEn: true,
      organizationId: true,
      applicationDeadline: true,
      startDate: true,
      endDate: true,
      capacity: true,
      minimumAge: true,
      maximumAge: true,
      questions: {
        select: {
          id: true,
          type: true,
          required: true,
          options: true,
          promptAr: true,
          promptFr: true,
          promptEn: true,
        },
      },
    },
  });
  if (!opportunity) throw AppError.notFound('Opportunity not found.');

  const profile = await prisma.volunteerProfile.findUnique({
    where: { userId: sessionUser.userId },
    select: { id: true, dateOfBirth: true },
  });
  if (!profile) {
    throw AppError.businessRule('Complete your volunteer profile before applying.');
  }

  if (opportunity.applicationDeadline && opportunity.applicationDeadline.getTime() < Date.now()) {
    throw AppError.businessRule('The application deadline for this opportunity has passed.');
  }

  if (opportunity.capacity !== null) {
    const accepted = await prisma.opportunityApplication.count({
      where: { opportunityId: opportunity.id, status: 'ACCEPTED' },
    });
    if (accepted >= opportunity.capacity) {
      throw AppError.businessRule('This opportunity has reached its capacity.');
    }
  }

  if (profile.dateOfBirth && (opportunity.minimumAge !== null || opportunity.maximumAge !== null)) {
    const age = ageFromDate(profile.dateOfBirth);
    if (opportunity.minimumAge !== null && age < opportunity.minimumAge) {
      throw AppError.businessRule(
        `You must be at least ${opportunity.minimumAge} years old for this opportunity.`,
      );
    }
    if (opportunity.maximumAge !== null && age > opportunity.maximumAge) {
      throw AppError.businessRule(
        `This opportunity accepts participants up to ${opportunity.maximumAge} years old.`,
      );
    }
  }

  // Answers must reference this opportunity's questions, cover the required
  // ones, and respect CHOICE/BOOLEAN value sets.
  const questionById = new Map(opportunity.questions.map((question) => [question.id, question]));
  const answered = new Set<string>();
  for (const answer of input.answers) {
    const question = questionById.get(answer.questionId);
    if (!question) {
      throw AppError.validation('One or more questions do not belong to this opportunity.');
    }
    if (answered.has(answer.questionId)) {
      throw AppError.validation('A question can only be answered once.');
    }
    answered.add(answer.questionId);

    if (question.type === 'CHOICE' && Array.isArray(question.options)) {
      const options = question.options as Array<{ value?: unknown }>;
      const allowed = options.map((option) => String(option.value ?? ''));
      if (!allowed.includes(answer.answer)) {
        throw AppError.validation('One or more answers are not an allowed choice.', [
          {
            path: `answers.${question.id}`,
            code: 'invalid_choice',
            message: 'Choose one of the provided options.',
          },
        ]);
      }
    }
    if (question.type === 'BOOLEAN' && !['true', 'false'].includes(answer.answer)) {
      throw AppError.validation('One or more answers must be true or false.', [
        {
          path: `answers.${question.id}`,
          code: 'invalid_boolean',
          message: 'Answer true or false.',
        },
      ]);
    }
  }
  const missing = opportunity.questions.filter(
    (question) => question.required && !answered.has(question.id),
  );
  if (missing.length > 0) {
    throw AppError.validation(
      'Please answer all required questions.',
      missing.map((question) => ({
        path: `answers.${question.id}`,
        code: 'required',
        message: pickLocalized(question, resolveLocale('en'), ['prompt']),
      })),
    );
  }

  let applicationId: string;
  try {
    applicationId = await prisma.$transaction(async (tx) => {
      const application = await tx.opportunityApplication.create({
        data: {
          opportunityId: opportunity.id,
          volunteerProfileId: profile.id,
          motivation: input.motivation,
          availability: input.availability ?? null,
          status: 'SUBMITTED',
          submittedAt: new Date(),
        },
      });
      if (input.answers.length > 0) {
        await tx.applicationAnswer.createMany({
          data: input.answers.map((answer) => ({
            applicationId: application.id,
            questionId: answer.questionId,
            answer: answer.answer,
          })),
        });
      }
      await tx.opportunity.update({
        where: { id: opportunity.id },
        data: { applicationCount: { increment: 1 } },
      });
      return application.id;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw AppError.conflict('You have already applied to this opportunity.');
    }
    throw error;
  }

  const opportunityTitle = pickLocalized(opportunity, resolveLocale('en'), ['title']);
  await notifyOrgReviewers(opportunity.organizationId, 'submitted', opportunityTitle, {
    opportunityId: opportunity.id,
    applicationId,
  });
  await audit({
    actorUserId: sessionUser.userId,
    organizationId: opportunity.organizationId,
    action: 'application.create',
    entityType: 'opportunityApplication',
    entityId: applicationId,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });

  const application = await prisma.opportunityApplication.findUnique({
    where: { id: applicationId },
    select: { id: true, status: true, submittedAt: true, motivation: true, availability: true },
  });
  return { application };
}

export async function myApplications(ctx: RequestContext): Promise<unknown> {
  const sessionUser = await requireAuth(ctx);
  const f = query(ctx, myApplicationsQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const profile = await prisma.volunteerProfile.findUnique({
    where: { userId: sessionUser.userId },
    select: { id: true },
  });
  if (!profile) return { items: [], meta: buildPageMeta(0, { page, limit }) };

  const where = {
    volunteerProfileId: profile.id,
    ...(f.status ? { status: f.status } : {}),
  } as const;

  const [total, items] = await Promise.all([
    prisma.opportunityApplication.count({ where }),
    prisma.opportunityApplication.findMany({
      where,
      select: {
        id: true,
        status: true,
        submittedAt: true,
        reviewedAt: true,
        decisionNote: true,
        opportunity: {
          select: {
            id: true,
            slug: true,
            titleAr: true,
            titleFr: true,
            titleEn: true,
            status: true,
            startDate: true,
            endDate: true,
            applicationDeadline: true,
            organization: {
              select: { id: true, name: true, slug: true, logo: true, verificationStatus: true },
            },
          },
        },
      },
      orderBy: { submittedAt: 'desc' },
      skip,
      take,
    }),
  ]);
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

async function myApplicationDetail(ctx: RequestContext): Promise<unknown> {
  const sessionUser = await requireAuth(ctx);
  const { id } = pathParams(ctx, idParamsSchema);
  const prisma = getPrisma();

  const profile = await prisma.volunteerProfile.findUnique({
    where: { userId: sessionUser.userId },
    select: { id: true },
  });
  if (!profile) throw AppError.notFound('Application not found.');

  const application = await prisma.opportunityApplication.findFirst({
    where: { id, volunteerProfileId: profile.id },
    select: {
      id: true,
      status: true,
      motivation: true,
      availability: true,
      submittedAt: true,
      reviewedAt: true,
      decisionNote: true,
      answers: { select: { questionId: true, answer: true } },
      opportunity: {
        select: {
          id: true,
          slug: true,
          titleAr: true,
          titleFr: true,
          titleEn: true,
          descriptionAr: true,
          descriptionFr: true,
          descriptionEn: true,
          status: true,
          startDate: true,
          endDate: true,
          applicationDeadline: true,
          organization: {
            select: { id: true, name: true, slug: true, logo: true, verificationStatus: true },
          },
          questions: {
            select: {
              id: true,
              promptAr: true,
              promptFr: true,
              promptEn: true,
              type: true,
              required: true,
              options: true,
              sortOrder: true,
            },
          },
        },
      },
    },
  });
  if (!application) throw AppError.notFound('Application not found.');
  return { application };
}

async function withdraw(ctx: RequestContext): Promise<unknown> {
  const sessionUser = await requireAuth(ctx);
  const { id } = pathParams(ctx, idParamsSchema);
  const prisma = getPrisma();

  const profile = await prisma.volunteerProfile.findUnique({
    where: { userId: sessionUser.userId },
    select: { id: true },
  });
  if (!profile) throw AppError.notFound('Application not found.');

  const application = await prisma.opportunityApplication.findFirst({
    where: { id, volunteerProfileId: profile.id },
    select: {
      id: true,
      status: true,
      opportunity: {
        select: { id: true, organizationId: true, titleAr: true, titleFr: true, titleEn: true },
      },
    },
  });
  if (!application) throw AppError.notFound('Application not found.');

  assertTransition(APPLICATION_TRANSITIONS, application.status, 'WITHDRAWN', 'application');

  await prisma.opportunityApplication.update({
    where: { id: application.id },
    data: { status: 'WITHDRAWN' },
  });

  const title = pickLocalized(application.opportunity, resolveLocale('en'), ['title']);
  await notifyOrgReviewers(application.opportunity.organizationId, 'withdrawn', title, {
    opportunityId: application.opportunity.id,
    applicationId: application.id,
  });
  await audit({
    actorUserId: sessionUser.userId,
    organizationId: application.opportunity.organizationId,
    action: 'application.withdraw',
    entityType: 'opportunityApplication',
    entityId: application.id,
    before: { status: application.status },
    after: { status: 'WITHDRAWN' },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });

  return { application: { id: application.id, status: 'WITHDRAWN' } };
}

// ── Organization side ───────────────────────────────────────────

async function orgApplicationList(ctx: RequestContext): Promise<unknown> {
  const org = await requireOrgMembership(ctx, 'application.read');
  const { id: opportunityId } = pathParams(ctx, idParamsSchema);
  const f = query(ctx, opportunityApplicationsQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  // Tenant isolation: only opportunities of this organization.
  const opportunity = await prisma.opportunity.findFirst({
    where: { id: opportunityId, organizationId: org.orgId, deletedAt: null },
    select: { id: true },
  });
  if (!opportunity) throw AppError.notFound('Opportunity not found.');

  const where: Prisma.OpportunityApplicationWhereInput = {
    opportunityId,
    ...(f.status ? { status: f.status } : {}),
    ...(f.q
      ? {
          OR: [
            { motivation: { contains: f.q, mode: 'insensitive' } },
            { volunteerProfile: { user: { firstName: { contains: f.q, mode: 'insensitive' } } } },
            { volunteerProfile: { user: { lastName: { contains: f.q, mode: 'insensitive' } } } },
            { volunteerProfile: { volunteerId: { contains: f.q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.opportunityApplication.count({ where }),
    prisma.opportunityApplication.findMany({
      where,
      select: {
        id: true,
        status: true,
        submittedAt: true,
        reviewedAt: true,
        decisionNote: true,
        motivation: true,
        volunteerProfile: {
          select: {
            id: true,
            volunteerId: true,
            verificationStatus: true,
            publicEmail: true,
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                profileImage: true,
              },
            },
          },
        },
      },
      orderBy: f.sort === 'oldest' ? { submittedAt: 'asc' } : { submittedAt: 'desc' },
      skip,
      take,
    }),
  ]);

  // Applicant emails are private unless the applicant opted into publicity.
  const items = rows.map((row) => ({
    ...row,
    volunteerProfile: {
      ...row.volunteerProfile,
      user: {
        id: row.volunteerProfile.user.id,
        firstName: row.volunteerProfile.user.firstName,
        lastName: row.volunteerProfile.user.lastName,
        profileImage: row.volunteerProfile.user.profileImage,
        email: row.volunteerProfile.publicEmail
          ? row.volunteerProfile.user.email
          : maskEmail(row.volunteerProfile.user.email),
      },
    },
  }));

  return { items, meta: buildPageMeta(total, { page, limit }) };
}

async function orgApplicationDetail(ctx: RequestContext): Promise<unknown> {
  const org = await requireOrgMembership(ctx, 'application.read');
  const { applicationId } = pathParams(ctx, appParamsSchema);
  const prisma = getPrisma();

  const application = await prisma.opportunityApplication.findFirst({
    where: { id: applicationId, opportunity: { organizationId: org.orgId } },
    select: {
      id: true,
      status: true,
      motivation: true,
      availability: true,
      submittedAt: true,
      reviewedAt: true,
      decisionNote: true,
      answers: { select: { questionId: true, answer: true } },
      volunteerProfile: {
        select: {
          id: true,
          volunteerId: true,
          verificationStatus: true,
          publicProfile: true,
          publicEmail: true,
          bio: true,
          availability: true,
          dateOfBirth: true,
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              profileImage: true,
              preferredLanguage: true,
            },
          },
          wilaya: { select: { id: true, code: true, nameAr: true, nameFr: true, nameEn: true } },
          city: { select: { id: true, nameAr: true, nameFr: true, nameEn: true } },
          skills: {
            select: {
              skillId: true,
              verificationLevel: true,
              yearsExperience: true,
              skill: {
                select: { id: true, nameAr: true, nameFr: true, nameEn: true, category: true },
              },
            },
          },
          _count: { select: { hours: true, certificates: true, applications: true } },
        },
      },
      opportunity: {
        select: {
          id: true,
          slug: true,
          titleAr: true,
          titleFr: true,
          titleEn: true,
          organizationId: true,
          questions: {
            select: {
              id: true,
              promptAr: true,
              promptFr: true,
              promptEn: true,
              type: true,
              required: true,
              options: true,
              sortOrder: true,
            },
          },
        },
      },
    },
  });
  if (!application) throw AppError.notFound('Application not found.');

  return {
    application: {
      ...application,
      volunteerProfile: {
        ...application.volunteerProfile,
        user: {
          id: application.volunteerProfile.user.id,
          firstName: application.volunteerProfile.user.firstName,
          lastName: application.volunteerProfile.user.lastName,
          profileImage: application.volunteerProfile.user.profileImage,
          email: application.volunteerProfile.publicEmail
            ? application.volunteerProfile.user.email
            : maskEmail(application.volunteerProfile.user.email),
        },
      },
    },
  };
}

async function orgSetStatus(ctx: RequestContext): Promise<unknown> {
  const org = await requireOrgMembership(ctx, 'application.update');
  const { applicationId } = pathParams(ctx, appParamsSchema);
  const input = await body(ctx, updateApplicationStatusSchema);
  const prisma = getPrisma();

  const application = await prisma.opportunityApplication.findFirst({
    where: { id: applicationId, opportunity: { organizationId: org.orgId } },
    select: {
      id: true,
      status: true,
      volunteerProfileId: true,
      opportunity: {
        select: {
          id: true,
          organizationId: true,
          titleAr: true,
          titleFr: true,
          titleEn: true,
          capacity: true,
          acceptedCount: true,
        },
      },
    },
  });
  if (!application) throw AppError.notFound('Application not found.');

  assertTransition(APPLICATION_TRANSITIONS, application.status, input.status, 'application');

  const updated = await prisma.opportunityApplication.update({
    where: { id: application.id },
    data: {
      status: input.status,
      decisionNote: input.decisionNote ?? undefined,
      reviewedAt: new Date(),
      reviewedById: org.user.userId,
    },
    select: { id: true, status: true, reviewedAt: true, decisionNote: true },
  });

  // Honest joined-count (spec §9/§11): only decision paths move ACCEPTED in/out.
  const acceptedDelta =
    application.status === input.status
      ? 0
      : application.status === 'ACCEPTED'
        ? -1
        : input.status === 'ACCEPTED'
          ? 1
          : 0;
  if (acceptedDelta !== 0) {
    const newAccepted = application.opportunity.acceptedCount + acceptedDelta;
    await prisma.opportunity.update({
      where: { id: application.opportunity.id },
      data: {
        acceptedCount: { increment: acceptedDelta },
        hasOpenSpots:
          application.opportunity.capacity === null ||
          newAccepted < application.opportunity.capacity,
      },
    });
  }

  const key = input.status.toLowerCase().replace(/([a-z])([A-Z])/g, '$1_$2') as NoticeKey;
  const noticeKey: NoticeKey =
    key in NOTICE ? key : input.status === 'WAITLISTED' ? 'waitlisted' : 'under_review';
  const title = pickLocalized(application.opportunity, resolveLocale('en'), ['title']);
  await notifyApplicant(application.volunteerProfileId, noticeKey, title, {
    opportunityId: application.opportunity.id,
    applicationId: application.id,
    status: input.status,
  });
  await audit({
    actorUserId: org.user.userId,
    organizationId: org.orgId,
    action: 'application.status',
    entityType: 'opportunityApplication',
    entityId: application.id,
    before: { status: application.status },
    after: { status: input.status, decisionNote: input.decisionNote ?? null },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });

  return { application: updated };
}

async function orgBulkAction(ctx: RequestContext): Promise<unknown> {
  const org = await requireOrgMembership(ctx, 'application.update');
  const input = await body(ctx, bulkApplicationActionSchema);
  const prisma = getPrisma();

  const results: Array<{ id: string; ok: boolean; from?: string; to?: string; error?: string }> =
    [];

  for (const applicationId of input.applicationIds) {
    try {
      const application = await prisma.opportunityApplication.findFirst({
        where: { id: applicationId, opportunity: { organizationId: org.orgId } },
        select: {
          id: true,
          status: true,
          volunteerProfileId: true,
          opportunity: {
            select: {
              id: true,
              organizationId: true,
              titleAr: true,
              titleFr: true,
              titleEn: true,
              capacity: true,
              acceptedCount: true,
            },
          },
        },
      });
      if (!application) {
        results.push({ id: applicationId, ok: false, error: 'NOT_FOUND' });
        continue;
      }
      assertTransition(APPLICATION_TRANSITIONS, application.status, input.action, 'application');

      await prisma.opportunityApplication.update({
        where: { id: application.id },
        data: {
          status: input.action,
          decisionNote: input.decisionNote ?? undefined,
          reviewedAt: new Date(),
          reviewedById: org.user.userId,
        },
      });

      // Honest joined-count (spec §9/§11): only decision paths move ACCEPTED in/out.
      const acceptedDelta =
        application.status === input.action
          ? 0
          : application.status === 'ACCEPTED'
            ? -1
            : input.action === 'ACCEPTED'
              ? 1
              : 0;
      if (acceptedDelta !== 0) {
        const newAccepted = application.opportunity.acceptedCount + acceptedDelta;
        await prisma.opportunity.update({
          where: { id: application.opportunity.id },
          data: {
            acceptedCount: { increment: acceptedDelta },
            hasOpenSpots:
              application.opportunity.capacity === null ||
              newAccepted < application.opportunity.capacity,
          },
        });
      }

      const title = pickLocalized(application.opportunity, resolveLocale('en'), ['title']);
      const key: NoticeKey =
        input.action === 'WAITLISTED' ? 'waitlisted' : (input.action.toLowerCase() as NoticeKey);
      await notifyApplicant(
        application.volunteerProfileId,
        key in NOTICE ? key : 'under_review',
        title,
        {
          opportunityId: application.opportunity.id,
          applicationId: application.id,
          status: input.action,
        },
      );
      await audit({
        actorUserId: org.user.userId,
        organizationId: org.orgId,
        action: 'application.status',
        entityType: 'opportunityApplication',
        entityId: application.id,
        before: { status: application.status },
        after: { status: input.action, bulk: true },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
      });
      results.push({ id: application.id, ok: true, from: application.status, to: input.action });
    } catch (error) {
      results.push({
        id: applicationId,
        ok: false,
        error: error instanceof AppError ? error.message : 'INTERNAL_ERROR',
      });
    }
  }

  const succeeded = results.filter((row) => row.ok).length;
  return { results, succeeded, failed: results.length - succeeded };
}

// ── Route table ─────────────────────────────────────────────────

export const applicationRoutes: AppRoute[] = [
  // volunteer side
  {
    method: 'POST',
    path: '/opportunities/:slug/applications',
    handler: apply,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Apply to a published opportunity',
  },
  {
    method: 'GET',
    path: '/me/applications',
    handler: myApplications,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'List own applications',
  },
  {
    method: 'GET',
    path: '/me/applications/:id',
    handler: myApplicationDetail,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Own application detail',
  },
  {
    method: 'POST',
    path: '/me/applications/:id/withdraw',
    handler: withdraw,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Withdraw own application',
  },
  // organization side
  {
    method: 'GET',
    path: '/orgs/:orgId/opportunities/:id/applications',
    handler: orgApplicationList,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: 'Review applications for an opportunity',
  },
  {
    method: 'GET',
    path: '/orgs/:orgId/applications/:applicationId',
    handler: orgApplicationDetail,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: 'Application detail (org view)',
  },
  {
    method: 'POST',
    path: '/orgs/:orgId/applications/:applicationId/status',
    handler: orgSetStatus,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: 'Application status transition',
  },
  {
    method: 'POST',
    path: '/orgs/:orgId/applications/bulk',
    handler: orgBulkAction,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: 'Bulk application decisions',
  },
];
