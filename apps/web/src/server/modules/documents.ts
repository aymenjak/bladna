// Documents module (spec §60).
//
// Uploads carry their bytes: `contentBase64` is decoded and put through the
// validation gate in `infra/upload.ts` (size -> MIME allow-list -> magic bytes
// -> extension agreement) BEFORE anything is written. Storage is written
// first, then the row; if the row fails, the bytes are removed. A `Document`
// row therefore only ever describes bytes that passed the gate, which is what
// `status = AVAILABLE` means.
//
// Honest capability note: this build ships no malware scanner.
// `PENDING_SCAN`/`QUARANTINED` stay reserved for a real scan stage and are
// never assigned (or "promoted") artificially.
//
// Tenancy: personal uploads set `ownerId` only; organization uploads set BOTH
// `ownerId` (the uploader) and `organizationId` (the tenant) -- the exact
// shape `POST /orgs/:orgId/verifications` demands as evidence (`organizationId`
// match + `AVAILABLE`). Ownership always comes from the session, never from
// the payload; every list paginates; every write audits.
//
// Serving bytes (`GET /files`) is row-level authorized: PUBLIC is open, owners
// always read their own, tenant members read non-PRIVATE tenant files,
// conversation members read attachments shared with them, and verification
// officers only reach bytes actually submitted as evidence (and only with an
// MFA-satisfied session, section 145). Unauthorized reads answer 404 so keys
// cannot be probed.

import { randomUUID } from 'node:crypto';
import { getPrisma, type Prisma } from '@bladna/database';
import { hasSystemPermission } from '@bladna/domain';
import { AppError } from '@bladna/types';
import { buildPageMeta, normalizePageParams } from '@bladna/utils';
import { paginationQuerySchema, uuidSchema } from '@bladna/validation';
import { z } from 'zod';
import { body, pathParams, query, type RequestContext } from '../http';
import { getSessionUser, requireAuth, requireOrgMembership } from '../guards';
import { getObject, putObject, removeObject } from '../infra/storage';
import { assertUploadAcceptable, decodeBase64Upload, sha256Hex } from '../infra/upload';
import { isUniqueViolation } from '../lib/prisma-errors';
import { audit } from '../services/audit';
import type { AppRoute } from '../router';

/** Mirrors the Prisma DocumentType / DocumentVisibility enums (schema.prisma). */
const DOCUMENT_TYPES = [
  'AVATAR',
  'LOGO',
  'COVER_IMAGE',
  'IDENTITY',
  'ORGANIZATION_REGISTRATION',
  'VERIFICATION_EVIDENCE',
  'CERTIFICATE',
  'ATTACHMENT',
  'OTHER',
] as const;

const DOCUMENT_VISIBILITIES = ['PRIVATE', 'ORGANIZATION', 'PUBLIC'] as const;

type DocumentType = (typeof DOCUMENT_TYPES)[number];
type DocumentVisibility = (typeof DOCUMENT_VISIBILITIES)[number];

/** Metadata only -- storageKey/checksum never leak (opaque keys). */
const DOCUMENT_SELECT = {
  id: true,
  type: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true,
  status: true,
  visibility: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.DocumentSelect;

type StoredDocument = Prisma.DocumentGetPayload<{ select: typeof DOCUMENT_SELECT }>;

const orgParamsSchema = z.object({ orgId: uuidSchema });
const orgDocumentParamsSchema = z.object({ orgId: uuidSchema, documentId: uuidSchema });

/** Storage keys are opaque but shape-checked (same rule as `infra/storage`). */
const storageKeySchema = z
  .string()
  .trim()
  .min(3)
  .max(500)
  .refine((value) => /^[a-zA-Z0-9!_.*'()/-]+$/.test(value) && !value.includes('..'), {
    message: 'INVALID_STORAGE_KEY',
  });

const fileQuerySchema = z.object({ key: storageKeySchema });

const documentsQuerySchema = paginationQuerySchema.extend({
  type: z.enum(DOCUMENT_TYPES).optional(),
});

/**
 * A display name is never used as a path (the storage key is a generated
 * uuid), but it does end up in logs, audit rows and `content-disposition` --
 * so no separators, no traversal, no control characters.
 */
function isSafeFileName(value: string): boolean {
  if (value.length === 0 || value.includes('/') || value.includes('\\')) return false;
  if (value.includes('..')) return false;
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 32 || code === 127) return false;
  }
  return true;
}

/**
 * Upload payload. `visibility` stays optional so each route can apply its own
 * default (PRIVATE for personal files, ORGANIZATION for tenant files).
 * File-name safety is enforced here; everything about the bytes themselves is
 * enforced by `assertUploadAcceptable`.
 */
const uploadDocumentSchema = z.object({
  type: z.enum(DOCUMENT_TYPES),
  fileName: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .refine(isSafeFileName, { message: 'INVALID_FILE_NAME' }),
  mimeType: z.string().trim().min(3).max(150),
  contentBase64: z.string().min(1),
  visibility: z.enum(DOCUMENT_VISIBILITIES).optional(),
});

interface StoreUploadInput {
  type: DocumentType;
  fileName: string;
  mimeType: string;
  contentBase64: string;
  visibility: DocumentVisibility;
  organizationId: string | null;
}

/**
 * Decode -> validate -> store bytes -> register row (in that order).
 *
 * Nothing persists unless every gate passed; if the row insert fails the bytes
 * are removed so storage never accumulates orphans.
 */
async function storeUpload(ownerUserId: string, input: StoreUploadInput): Promise<StoredDocument> {
  const mimeType = input.mimeType.toLowerCase();
  const bytes = decodeBase64Upload(input.contentBase64);
  // Returns the canonical extension; throws VALIDATION_ERROR on any mismatch.
  const extension = assertUploadAcceptable({
    fileName: input.fileName,
    mimeType,
    bytes,
  });

  const scope = input.organizationId ?? ownerUserId;
  const storageKey = `uploads/${scope}/${randomUUID()}${extension}`;
  await putObject({ key: storageKey, body: bytes, contentType: mimeType });

  const prisma = getPrisma();
  try {
    return await prisma.document.create({
      data: {
        ownerId: ownerUserId,
        organizationId: input.organizationId,
        type: input.type,
        fileName: input.fileName,
        storageKey,
        mimeType,
        sizeBytes: bytes.byteLength,
        checksum: sha256Hex(bytes),
        visibility: input.visibility,
        // Validated before persistence -- see the module header: AVAILABLE means
        // "passed the upload validation gate", never "scanned for malware".
        status: 'AVAILABLE',
      },
      select: DOCUMENT_SELECT,
    });
  } catch (error) {
    await removeObject(storageKey);
    // storageKey is unique -- two registrations of the same object collide.
    if (isUniqueViolation(error)) {
      throw AppError.conflict('A document with this storage key is already registered.');
    }
    throw error;
  }
}

async function createDocumentRecord(
  ctx: RequestContext,
  actorUserId: string,
  input: StoreUploadInput,
): Promise<{ document: StoredDocument }> {
  const document = await storeUpload(actorUserId, input);
  await audit({
    actorUserId,
    organizationId: input.organizationId ?? undefined,
    action: 'document.create',
    entityType: 'document',
    entityId: document.id,
    after: {
      type: document.type,
      fileName: document.fileName,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
      visibility: document.visibility,
      status: document.status,
      organizationId: input.organizationId,
    },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { document };
}

// -- Personal documents -------------------------------------------------

async function listMyDocuments(ctx: RequestContext): Promise<unknown> {
  const user = await requireAuth(ctx);
  const f = query(ctx, documentsQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where: Prisma.DocumentWhereInput = {
    // Own rows only -- derived from the session, never from the query string.
    ownerId: user.userId,
    deletedAt: null,
    ...(f.type ? { type: f.type } : {}),
  };

  const [total, items] = await Promise.all([
    prisma.document.count({ where }),
    prisma.document.findMany({
      where,
      select: DOCUMENT_SELECT,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
  ]);
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

async function uploadMyDocument(ctx: RequestContext): Promise<unknown> {
  const user = await requireAuth(ctx);
  const input = await body(ctx, uploadDocumentSchema);
  return createDocumentRecord(ctx, user.userId, {
    type: input.type,
    fileName: input.fileName,
    mimeType: input.mimeType,
    contentBase64: input.contentBase64,
    visibility: input.visibility ?? 'PRIVATE',
    organizationId: null,
  });
}

// -- Organization documents --------------------------------------------

async function listOrgDocuments(ctx: RequestContext): Promise<unknown> {
  // Membership + document.read are checked here; orgId itself comes from the
  // path (uuid-validated by pathParams below).
  await requireOrgMembership(ctx, 'document.read');
  const { orgId } = pathParams(ctx, orgParamsSchema);
  const f = query(ctx, documentsQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where: Prisma.DocumentWhereInput = {
    // Tenant scope from the path (membership-checked above), never the payload.
    organizationId: orgId,
    deletedAt: null,
    ...(f.type ? { type: f.type } : {}),
  };

  const [total, items] = await Promise.all([
    prisma.document.count({ where }),
    prisma.document.findMany({
      where,
      select: DOCUMENT_SELECT,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
  ]);
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

async function uploadOrgDocument(ctx: RequestContext): Promise<unknown> {
  const org = await requireOrgMembership(ctx, 'document.upload');
  const { orgId } = pathParams(ctx, orgParamsSchema);
  const input = await body(ctx, uploadDocumentSchema);
  return createDocumentRecord(ctx, org.user.userId, {
    type: input.type,
    fileName: input.fileName,
    mimeType: input.mimeType,
    contentBase64: input.contentBase64,
    // Tenant files are visible inside the tenant by default; callers may opt
    // into PUBLIC (logos) or PRIVATE (personal paperwork inside the org).
    visibility: input.visibility ?? 'ORGANIZATION',
    organizationId: orgId,
  });
}

async function deleteOrgDocument(ctx: RequestContext): Promise<unknown> {
  const org = await requireOrgMembership(ctx, 'document.upload');
  const { orgId, documentId } = pathParams(ctx, orgDocumentParamsSchema);
  const prisma = getPrisma();

  const row = await prisma.document.findFirst({
    where: { id: documentId, organizationId: orgId, deletedAt: null },
    select: { id: true, ownerId: true, fileName: true, status: true },
  });
  if (!row) throw AppError.notFound('Document not found.');

  // The uploader may withdraw their own file; removing someone else's needs a
  // manager (organization.update) -- checked through the same guard.
  if (row.ownerId !== org.user.userId) {
    await requireOrgMembership(ctx, 'organization.update', { orgId });
  }

  // Evidence attached to an open request must survive until the decision
  // (append-only spirit: the review record cannot be yanked mid-flight).
  const openEvidence = await prisma.verificationDocument.findFirst({
    where: {
      documentId: row.id,
      verification: { is: { status: { in: ['PENDING', 'UNDER_REVIEW'] } } },
    },
    select: { id: true },
  });
  if (openEvidence) {
    throw AppError.conflict('This document is attached to a verification request under review.');
  }

  const updated = await prisma.document.update({
    where: { id: row.id },
    data: { deletedAt: new Date(), status: 'DELETED' },
    select: DOCUMENT_SELECT,
  });

  await audit({
    actorUserId: org.user.userId,
    organizationId: orgId,
    action: 'document.delete',
    entityType: 'document',
    entityId: row.id,
    before: { status: row.status, fileName: row.fileName },
    after: { status: 'DELETED' },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });

  return { document: updated };
}

// -- Byte stream --------------------------------------------------------

/** `content-disposition` needs a printable ASCII filename (RFC 6266-ish). */
function safeDownloadName(fileName: string): string {
  const cleaned = fileName
    .replace(/[^\w.\- ()]/g, '_')
    .trim()
    .slice(0, 200);
  return cleaned.length > 0 ? cleaned : 'download';
}

async function serveFile(ctx: RequestContext): Promise<Response> {
  const f = query(ctx, fileQuerySchema);
  const prisma = getPrisma();

  // The key alone is never authorization: resolve the row first, then decide.
  const row = await prisma.document.findFirst({
    where: { storageKey: f.key, deletedAt: null },
    select: {
      id: true,
      ownerId: true,
      organizationId: true,
      fileName: true,
      mimeType: true,
      visibility: true,
      storageKey: true,
    },
  });
  if (!row) throw AppError.notFound('File not found.');

  const user = await getSessionUser(ctx);
  const isOwner = !!user && row.ownerId === user.userId;
  const isOfficer =
    !!user && user.mfaSatisfied && hasSystemPermission(user.roles, 'organization.verify');

  let allowed = row.visibility === 'PUBLIC' || isOwner;

  if (!allowed && user && row.organizationId && row.visibility !== 'PRIVATE') {
    const membership = await prisma.organizationMember.findFirst({
      where: { organizationId: row.organizationId, userId: user.userId, status: 'ACTIVE' },
      select: { id: true },
    });
    allowed = membership !== null;
  }

  if (!allowed && user) {
    // Sharing a file in a message grants its conversation read access without
    // changing the row's visibility: the recipient must be able to open what
    // was sent to them. A tombstoned (deleted) message grants nothing new.
    const shared = await prisma.message.findFirst({
      where: {
        attachmentId: row.id,
        deletedAt: null,
        conversation: { members: { some: { userId: user.userId } } },
      },
      select: { id: true },
    });
    allowed = shared !== null;
  }

  if (!allowed && isOfficer) {
    // Officers reach bytes only when the tenant actually submitted them as
    // evidence -- not a licence to browse any tenant's private files.
    const evidence = await prisma.verificationDocument.findFirst({
      where: { documentId: row.id },
      select: { id: true },
    });
    allowed = evidence !== null;
  }

  // 404 (not 403) for both unknown keys and denied reads: existence of a key
  // must never be observable from the outside.
  if (!allowed) throw AppError.notFound('File not found.');

  const { body: bytes } = await getObject(row.storageKey);
  return new Response(new Uint8Array(bytes), {
    headers: {
      'content-type': row.mimeType,
      'content-length': String(bytes.byteLength),
      'content-disposition': `inline; filename="${safeDownloadName(row.fileName)}"`,
      'cache-control': row.visibility === 'PUBLIC' ? 'public, max-age=300' : 'private, no-store',
      'x-content-type-options': 'nosniff',
      // Uploaded files must never execute or embed in a foreign origin.
      'content-security-policy': "default-src 'none'; sandbox; base-uri 'none'",
    },
  });
}

// -- Route table --------------------------------------------------------

export const documentRoutes: AppRoute[] = [
  {
    method: 'GET',
    path: '/me/documents',
    handler: listMyDocuments,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'List own document metadata (paginated, storage keys never exposed)',
  },
  {
    method: 'POST',
    path: '/me/documents',
    handler: uploadMyDocument,
    options: { rateLimit: 'upload' },
    auth: 'authenticated',
    summary: 'Upload a file (base64) - validated, stored, registered as PRIVATE',
  },
  {
    method: 'GET',
    path: '/orgs/:orgId/documents',
    handler: listOrgDocuments,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: 'List tenant documents (document.read, paginated)',
  },
  {
    method: 'POST',
    path: '/orgs/:orgId/documents',
    handler: uploadOrgDocument,
    options: { rateLimit: 'upload' },
    auth: 'org',
    summary: 'Upload a tenant file (document.upload) - evidence and attachments',
  },
  {
    method: 'DELETE',
    path: '/orgs/:orgId/documents/:documentId',
    handler: deleteOrgDocument,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: 'Soft-delete a tenant document (uploader or manager; never mid-review)',
  },
  {
    method: 'GET',
    path: '/files',
    handler: serveFile,
    options: { rateLimit: 'public' },
    auth: 'public',
    summary: 'Stream stored bytes with row-level authorization (404 when not allowed)',
  },
];
