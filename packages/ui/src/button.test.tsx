/**
 * @vitest-environment jsdom
 *
 * Kit component tests (M8): `Button` contract — never submits a form by
 * default, exposes its busy state to assistive tech, and keeps every kit
 * size at the ≥44px touch target from RESEARCH H3.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './button';

describe('Button', () => {
  it('defaults to type="button" so a stray click never submits a form', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' }).getAttribute('type')).toBe('button');
  });

  it('keeps an explicit type when the caller asks for submit', () => {
    render(<Button type="submit">Send</Button>);
    expect(screen.getByRole('button', { name: 'Send' }).getAttribute('type')).toBe('submit');
  });

  it('disables itself and announces aria-busy while loading', () => {
    const { rerender } = render(<Button loading>Save</Button>);
    const busy = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    expect(busy.getAttribute('aria-busy')).toBe('true');

    rerender(<Button>Save</Button>);
    const idle = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;
    expect(idle.disabled).toBe(false);
    expect(idle.hasAttribute('aria-busy')).toBe(false);
  });

  it('honours a plain disabled prop without claiming to be busy', () => {
    render(<Button disabled>Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.hasAttribute('aria-busy')).toBe(false);
  });

  it('defaults to the primary variant at md size (h-11 = the 44px target)', () => {
    render(<Button>Go</Button>);
    const className = screen.getByRole('button', { name: 'Go' }).getAttribute('class') ?? '';
    expect(className).toContain('bg-brand-700');
    expect(className).toContain('h-11');
  });

  it('maps variant/size onto the kit palette and touch heights', () => {
    render(
      <Button variant="danger" size="lg">
        Delete
      </Button>,
    );
    const className = screen.getByRole('button', { name: 'Delete' }).getAttribute('class') ?? '';
    expect(className).toContain('bg-red-700');
    expect(className).toContain('h-12'); // lg = 48px
  });

  it('lets a caller className override the kit sizing (twMerge)', () => {
    render(<Button className="h-14">Tall</Button>);
    const className = screen.getByRole('button', { name: 'Tall' }).getAttribute('class') ?? '';
    expect(className).toContain('h-14');
    expect(className).not.toContain('h-11');
  });

  it('forwards native props and click handlers to the real button', () => {
    const onClick = vi.fn();
    render(
      <Button name="confirm" data-testid="confirm" onClick={onClick}>
        Confirm
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Confirm' });
    expect(button.getAttribute('name')).toBe('confirm');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
