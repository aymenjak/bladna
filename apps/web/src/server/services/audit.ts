import type { Prisma } from '@bladna/database';

/**
 * Audit logging (§40 — append-only, actor → action → resource → IP → UA → requestId).
 *
 * Audit writes are best-effort with loud failure: a broken audit table must not
 * take down a user action, but failures are always surfaced to logs.
 * AuditLog has no update/delete API anywhere in this codebase.
 */

export interface AuditInput {
  actorUserId?: string | null;
  organizationId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  /** before/after snapshots are stored inside metadata (schema has no dedicated columns). */
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function audit(input: AuditInput): Promise<void> {
  try {
    const { getPrisma } = await import('@bladna/database');
    const prisma = getPrisma();
    const metadata: Record<string, unknown> = { ...(input.metadata ?? {}) };
    if (input.before !== undefined) metadata.before = input.before;
    if (input.after !== undefined) metadata.after = input.after;

    await prisma.auditLog.create({
      data: {
        actorUserId: input.actorUserId ?? null,
        organizationId: input.organizationId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? '-',
        metadata:
          Object.keys(metadata).length > 0 ? (metadata as Prisma.InputJsonValue) : undefined,
        ipAddress: input.ip ?? null,
        userAgent: input.userAgent ?? null,
        requestId: input.requestId ?? null,
      },
    });
  } catch (error) {
    console.error('[audit] failed to persist audit log', {
      action: input.action,
      entityType: input.entityType,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
