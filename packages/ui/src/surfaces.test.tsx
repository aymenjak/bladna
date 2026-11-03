/**
 * @vitest-environment jsdom
 *
 * Kit component tests (M8): surfaces — the alert tone → role mapping (only
 * `danger` interrupts), caller-driven card semantics, and the identity /
 * empty-state tiles that replaced hand-rolled markup (RESEARCH H6).
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Alert, Avatar, Badge, Card, CardTitle, EmptyState } from './surfaces';

describe('Alert', () => {
  it('announces the default (danger) tone as role="alert"', () => {
    render(<Alert>Payment failed</Alert>);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('Payment failed');
    expect(alert.getAttribute('class')).toContain('bg-red-50');
  });

  it('renders non-danger tones as role="status" so they do not interrupt', () => {
    const { rerender } = render(<Alert tone="success">Saved</Alert>);
    expect(screen.getByRole('status').textContent).toBe('Saved');
    expect(screen.queryByRole('alert')).toBeNull();

    rerender(<Alert tone="info">Heads up</Alert>);
    expect(screen.getByRole('status').textContent).toBe('Heads up');
  });

  it('merges a caller className over the kit tone classes', () => {
    render(
      <Alert tone="info" className="mt-4">
        Note
      </Alert>,
    );
    const alert = screen.getByRole('status');
    expect(alert.getAttribute('class')).toContain('mt-4');
    expect(alert.getAttribute('class')).toContain('bg-sky-50');
  });
});

describe('Card', () => {
  it('keeps the caller semantics while sharing the one card surface', () => {
    const { container } = render(
      <Card as="section" className="p-2">
        <CardTitle>Overview</CardTitle>
      </Card>,
    );
    const card = container.firstElementChild as HTMLElement;
    expect(card.tagName).toBe('SECTION');
    // P9 retheme: the shared card surface is the 14px card tier + soft lift.
    expect(card.getAttribute('class')).toContain('rounded-card');
    expect(card.getAttribute('class')).toContain('shadow-card');
    expect(card.getAttribute('class')).toContain('bg-white');
    // twMerge: the caller's padding replaces the kit default p-5.
    expect(card.getAttribute('class')).toContain('p-2');
    expect(card.getAttribute('class')).not.toContain('p-5');
  });

  it('renders a CardTitle as the shared heading level', () => {
    render(
      <Card>
        <CardTitle>Audit</CardTitle>
      </Card>,
    );
    const title = screen.getByRole('heading', { name: 'Audit' });
    expect(title.tagName).toBe('H2');
  });
});

describe('Badge', () => {
  it('defaults to the neutral palette entry', () => {
    render(<Badge>Draft</Badge>);
    expect(screen.getByText('Draft').getAttribute('class')).toContain('bg-sand-100');
  });

  it('applies the requested tone class', () => {
    render(<Badge tone="danger">Urgent</Badge>);
    expect(screen.getByText('Urgent').getAttribute('class')).toContain('bg-red-100');
  });
});

describe('EmptyState', () => {
  it('is a dashed, role-less placeholder (kept out of the a11y tree)', () => {
    render(<EmptyState>No results match these filters</EmptyState>);
    const box = screen.getByText('No results match these filters');
    expect(box.tagName).toBe('DIV');
    expect(box.getAttribute('class')).toContain('border-dashed');
    expect(box.getAttribute('role')).toBeNull();
  });
});

describe('Avatar', () => {
  it('renders initials in an identity tile at the requested size', () => {
    render(<Avatar size="lg">SA</Avatar>);
    const tile = screen.getByText('SA');
    expect(tile.tagName).toBe('SPAN');
    expect(tile.getAttribute('class')).toContain('size-12');
    expect(tile.getAttribute('class')).toContain('bg-brand-700');
  });

  it('covers the tile with an image when src is set (initials stay the fallback)', () => {
    const { container } = render(
      <Avatar src="/photos/logo-atlas-verts.svg" size="sm">
        AV
      </Avatar>,
    );
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('/photos/logo-atlas-verts.svg');
    expect(img?.getAttribute('alt')).toBe('');
    expect(screen.queryByText('AV')).toBeNull();
  });
});
