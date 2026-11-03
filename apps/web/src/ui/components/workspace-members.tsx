'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ORG_MEMBER_ROLES, type LocaleCode, type OrgMemberRole } from '@bladna/types';
import { Alert, Button, Card, useConfirm } from '@bladna/ui';
import { api, errorMessageFor, fieldErrors } from '@/ui/api/client';
import { useFocusFirstError } from '@/ui/use-focus-first-error';
import { getDictionary } from '@/ui/i18n';

/** Invite form — POST /orgs/:orgId/members/invite (role must not be OWNER). */
export function InviteForm({ locale, orgId }: { locale: LocaleCode; orgId: string }) {
  const { dict } = getDictionary(locale);
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'MANAGER' | 'STAFF' | 'VIEWER'>('ADMIN');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrorsState, setFieldErrors] = useState<Record<string, string>>({});
  useFocusFirstError(fieldErrorsState);

  const inviteRoles = (ORG_MEMBER_ROLES as readonly OrgMemberRole[]).filter(
    (value) => value !== 'OWNER',
  ) as Array<'ADMIN' | 'MANAGER' | 'STAFF' | 'VIEWER'>;

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setFieldErrors({});
    setBusy(true);
    try {
      await api.post(`/orgs/${orgId}/members/invite`, { email: email.trim(), role });
      setMessage(dict.workspace.members.inviteSent);
      setEmail('');
      router.refresh();
    } catch (cause) {
      const fields = fieldErrors(cause);
      if (Object.keys(fields).length > 0) setFieldErrors(fields);
      setError(
        errorMessageFor(cause, { errors: dict.errors, genericFallback: dict.errors.generic }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-6">
      <h2 className="text-base font-semibold text-sand-900">
        {dict.workspace.members.inviteTitle}
      </h2>
      <form onSubmit={submit} className="mt-4 flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1">
          <label htmlFor="invite-email" className="block text-sm font-medium text-sand-700">
            {dict.workspace.members.emailLabel}
          </label>
          <input
            id="invite-email"
            type="email"
            required
            aria-invalid={!!fieldErrorsState.email || undefined}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="h-10 mt-1 w-full rounded-lg border border-sand-200 bg-white px-3 py-2 text-sm text-sand-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          {fieldErrorsState.email ? (
            <p role="alert" className="mt-1 text-sm text-red-700">
              {fieldErrorsState.email}
            </p>
          ) : null}
        </div>
        <div>
          <label htmlFor="invite-role" className="block text-sm font-medium text-sand-700">
            {dict.workspace.members.roleLabel}
          </label>
          <select
            id="invite-role"
            aria-invalid={!!fieldErrorsState.role || undefined}
            value={role}
            onChange={(event) => setRole(event.target.value as typeof role)}
            className="h-10 mt-1 rounded-lg border border-sand-200 bg-white px-3 py-2 text-sm text-sand-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            {inviteRoles.map((value) => (
              <option key={value} value={value}>
                {dict.workspace.members.roles[value]}
              </option>
            ))}
          </select>
          {fieldErrorsState.role ? (
            <p role="alert" className="mt-1 text-sm text-red-700">
              {fieldErrorsState.role}
            </p>
          ) : null}
        </div>
        <Button type="submit" disabled={busy}>
          {dict.workspace.members.invite}
        </Button>
      </form>
      {error ? (
        <Alert tone="danger" className="mt-3">
          {error}
        </Alert>
      ) : null}
      {message ? (
        <Alert tone="success" className="mt-3">
          {message}
        </Alert>
      ) : null}
    </Card>
  );
}

/**
 * Role editor for one member — PATCH-equivalent POST through
 * POST /orgs/:orgId/members/:memberId/role with `updateMemberSchema`
 * `{ role, status? }`. No success toast: the dictionary has no key for it,
 * so a successful save just refreshes the server-rendered list.
 */
export function MemberRowActions({
  locale,
  orgId,
  memberId,
  role,
}: {
  locale: LocaleCode;
  orgId: string;
  memberId: string;
  role: OrgMemberRole;
}) {
  const { dict } = getDictionary(locale);
  const router = useRouter();
  const [nextRole, setNextRole] = useState<OrgMemberRole>(role);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(): Promise<void> {
    if (nextRole === role) return;
    setError(null);
    setBusy(true);
    try {
      await api.post(`/orgs/${orgId}/members/${memberId}/role`, { role: nextRole });
      router.refresh();
    } catch (cause) {
      setError(
        errorMessageFor(cause, { errors: dict.errors, genericFallback: dict.errors.generic }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={`role-${memberId}`}>
        {dict.workspace.members.roleLabel}
      </label>
      <select
        id={`role-${memberId}`}
        value={nextRole}
        onChange={(event) => setNextRole(event.target.value as OrgMemberRole)}
        disabled={busy}
        className="h-10 rounded-lg border border-sand-200 bg-white px-3 py-1.5 text-xs text-sand-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:opacity-50"
      >
        {ORG_MEMBER_ROLES.map((value) => (
          <option key={value} value={value}>
            {dict.workspace.members.roles[value]}
          </option>
        ))}
      </select>
      <Button type="button" size="sm" disabled={busy || nextRole === role} onClick={save}>
        {dict.common.save}
      </Button>
      {error ? (
        <p role="alert" className="w-full text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Remove a member — DELETE /orgs/:orgId/members/:memberId (server blocks last owner). */
export function MemberRemoveButton({
  locale,
  orgId,
  memberId,
  memberName,
}: {
  locale: LocaleCode;
  orgId: string;
  memberId: string;
  memberName: string;
}) {
  const { dict } = getDictionary(locale);
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function remove(): Promise<void> {
    if (!(await confirm(dict.workspace.members.confirmRemove))) return;
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      await api.delete(`/orgs/${orgId}/members/${memberId}`);
      setMessage(dict.workspace.members.removed);
      router.refresh();
    } catch (cause) {
      setError(
        `${memberName}: ${errorMessageFor(cause, {
          errors: dict.errors,
          genericFallback: dict.errors.generic,
        })}`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="text-red-700 hover:border-red-300 hover:bg-red-50 focus-visible:outline-red-700"
        disabled={busy}
        onClick={remove}
      >
        {dict.workspace.members.remove}
      </Button>
      {error ? (
        <span role="alert" className="max-w-64 text-end text-xs text-red-700">
          {error}
        </span>
      ) : null}
      {message ? (
        <span role="status" className="text-xs text-brand-800">
          {message}
        </span>
      ) : null}
    </span>
  );
}

/** Revoke a pending invitation — POST /orgs/:orgId/members/invitations/:invitationId/revoke. */
export function InvitationRevokeButton({
  locale,
  orgId,
  invitationId,
}: {
  locale: LocaleCode;
  orgId: string;
  invitationId: string;
}) {
  const { dict } = getDictionary(locale);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function revoke(): Promise<void> {
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      await api.post(`/orgs/${orgId}/members/invitations/${invitationId}/revoke`, {});
      setMessage(dict.workspace.members.inviteRevoked);
      router.refresh();
    } catch (cause) {
      setError(
        errorMessageFor(cause, { errors: dict.errors, genericFallback: dict.errors.generic }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={revoke}>
        {dict.workspace.members.revokeInvite}
      </Button>
      {error ? (
        <span role="alert" className="max-w-64 text-end text-xs text-red-700">
          {error}
        </span>
      ) : null}
      {message ? (
        <span role="status" className="text-xs text-brand-800">
          {message}
        </span>
      ) : null}
    </span>
  );
}
