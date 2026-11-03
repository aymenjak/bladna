import { describe, expect, it } from 'vitest';
import {
  compareMessagesDesc,
  contactQuery,
  conversationTitle,
  mergeMessagesDesc,
  parseContactParams,
  type ConversationLike,
} from './messages-utils';

const message = (id: string, iso: string) => ({ id, createdAt: new Date(iso) });

describe('compareMessagesDesc', () => {
  it('orders newest first by createdAt', () => {
    const older = message('a', '2026-01-01T00:00:00Z');
    const newer = message('b', '2026-01-02T00:00:00Z');
    expect([older, newer].sort(compareMessagesDesc).map((m) => m.id)).toEqual(['b', 'a']);
  });

  it('breaks createdAt ties by id descending (server keyset order)', () => {
    const at = '2026-01-01T00:00:00Z';
    expect(compareMessagesDesc(message('a', at), message('b', at))).toBeGreaterThan(0);
    expect(compareMessagesDesc(message('b', at), message('a', at))).toBeLessThan(0);
    expect(compareMessagesDesc(message('a', at), message('a', at))).toBe(0);
  });

  it('accepts string dates (client round-trip)', () => {
    const asString = { id: 'a', createdAt: '2026-01-01T00:00:00Z' };
    const newer = { id: 'b', createdAt: '2026-01-02T00:00:00Z' };
    expect(compareMessagesDesc(newer, asString)).toBeLessThan(0);
  });
});

describe('mergeMessagesDesc', () => {
  it('deduplicates by id and keeps server order', () => {
    const a = message('a', '2026-01-03T00:00:00Z');
    const b = message('b', '2026-01-02T00:00:00Z');
    const c = message('c', '2026-01-01T00:00:00Z');
    const merged = mergeMessagesDesc([a, b], [b, c]);
    expect(merged.map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('keeps both sides when pages only partially overlap (no dropped messages)', () => {
    const fresh = [message('d', '2026-01-04T00:00:00Z'), message('c', '2026-01-03T00:00:00Z')];
    const loadedOlder = [
      message('c', '2026-01-03T00:00:00Z'),
      message('b', '2026-01-02T00:00:00Z'),
      message('a', '2026-01-01T00:00:00Z'),
    ];
    const merged = mergeMessagesDesc(loadedOlder, fresh);
    expect(merged.map((m) => m.id)).toEqual(['d', 'c', 'b', 'a']);
  });

  it('appends a newly sent message at the front (newest)', () => {
    const sent = message('z', '2026-01-05T00:00:00Z');
    const merged = mergeMessagesDesc([message('a', '2026-01-01T00:00:00Z')], [sent]);
    expect(merged[0]?.id).toBe('z');
  });

  it('handles empty inputs', () => {
    expect(mergeMessagesDesc([], [])).toEqual([]);
    expect(mergeMessagesDesc([], [message('a', '2026-01-01T00:00:00Z')])).toHaveLength(1);
  });
});

describe('conversationTitle', () => {
  const member = (userId: string, firstName: string, lastName: string, isMe: boolean) => ({
    userId,
    firstName,
    lastName,
    isMe,
  });

  const base: ConversationLike = { subject: null, type: 'DIRECT', members: [] };

  it('prefers an explicit subject', () => {
    const conversation: ConversationLike = {
      ...base,
      subject: '  Application follow-up  ',
      members: [member('me', 'Sam', 'Ben', true), member('them', 'Aya', 'Khel', false)],
    };
    expect(conversationTitle(conversation, { direct: 'Direct', organization: 'Org' })).toBe(
      'Application follow-up',
    );
  });

  it('falls back to the other members names (own name excluded)', () => {
    const conversation: ConversationLike = {
      ...base,
      members: [
        member('me', 'Sam', 'Ben', true),
        member('t1', 'Aya', 'Khel', false),
        member('t2', 'Nadir', 'Am', false),
      ],
    };
    expect(conversationTitle(conversation, { direct: 'Direct', organization: 'Org' })).toBe(
      'Aya Khel, Nadir Am',
    );
  });

  it('uses the type fallback when there is no subject and no counterpart', () => {
    const direct: ConversationLike = { ...base, members: [member('me', 'Sam', 'Ben', true)] };
    expect(conversationTitle(direct, { direct: 'Direct', organization: 'Org' })).toBe('Direct');
    const org: ConversationLike = { ...base, type: 'GROUP', members: [] };
    expect(conversationTitle(org, { direct: 'Direct', organization: 'Org' })).toBe('Org');
  });
});

// P23 — the compose form fills itself from these params and the same values
// ride the login bounce through `?next=`, so both readers must agree: exact
// UUID ids only, the org display name capped and never emitted alone.
describe('parseContactParams / contactQuery', () => {
  const user = '669e91a9-bf1f-479d-9c49-2ee6c77094eb';
  const org = '11111111-1111-4111-8111-111111111111';

  it('keeps a UUID recipient (directory card / Settings link)', () => {
    expect(parseContactParams(`?to=${user}&junk=x`)).toEqual({ to: user, org: null, name: '' });
  });

  it('drops non-UUID ids and unknown params', () => {
    expect(parseContactParams('?to=not-a-uuid&org=also-nope&evil=1')).toEqual({
      to: null,
      org: null,
      name: '',
    });
  });

  it('reads an organization target with its display name (capped at 120)', () => {
    expect(parseContactParams(`?org=${org}&name=${encodeURIComponent('Atlas Verts')}`)).toEqual({
      to: null,
      org,
      name: 'Atlas Verts',
    });
    const long = parseContactParams(`?org=${org}&name=${'A'.repeat(400)}`);
    expect(long.name).toHaveLength(120);
  });

  it('ignores a name without a valid org target and array-valued params', () => {
    expect(parseContactParams('?name=Orphan')).toEqual({ to: null, org: null, name: '' });
    expect(parseContactParams({ org: [org, org] })).toEqual({ to: null, org: null, name: '' });
  });

  it('contactQuery rebuilds only the validated fragment', () => {
    expect(contactQuery({ to: user, evil: '1' })).toBe(`to=${user}`);
    const rebuilt = new URLSearchParams(contactQuery({ org, name: 'Atlas Verts' }));
    expect(rebuilt.get('org')).toBe(org);
    expect(rebuilt.get('name')).toBe('Atlas Verts');
    expect(contactQuery({ name: 'No org' })).toBe('');
    expect(contactQuery('?to=nope')).toBe('');
  });
});
