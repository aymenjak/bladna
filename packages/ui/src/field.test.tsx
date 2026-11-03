/**
 * @vitest-environment jsdom
 *
 * Kit component tests (M8): form fields — automatic label association,
 * the required marker, and the `aria-describedby` wiring that carries the
 * hint/error into the control (DESIGN §9 / WCAG 3.3.2, 4.1.3).
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Input, Select, Textarea } from './field';

describe('Input', () => {
  it('associates its label with the control when no id is given', () => {
    render(<Input label="Email" name="email" />);
    const input = screen.getByLabelText('Email');
    expect(input.getAttribute('id')).toBeTruthy();
    const label = document.querySelector('label');
    expect(label?.getAttribute('for')).toBe(input.getAttribute('id'));
  });

  it('prefers an explicit htmlFor over the generated id', () => {
    render(<Input label="Email" htmlFor="email-field" />);
    expect(screen.getByLabelText('Email').getAttribute('id')).toBe('email-field');
  });

  it('marks required fields natively and with the red asterisk', () => {
    render(<Input label="Password" required />);
    const input = screen.getByLabelText(/Password/) as HTMLInputElement;
    expect(input.required).toBe(true);
    expect(document.querySelector('label')?.textContent).toContain(' *');
  });

  it('describes an error with role="alert" and aria-invalid on the control', () => {
    render(<Input label="Email" error="Enter a valid email" />);
    const input = screen.getByLabelText('Email');
    expect(input.getAttribute('aria-invalid')).toBe('true');

    const errorNode = screen.getByRole('alert');
    expect(errorNode.textContent).toBe('Enter a valid email');
    expect(input.getAttribute('aria-describedby')).toBe(errorNode.getAttribute('id'));
    expect(errorNode.getAttribute('id')).toBe(`${input.getAttribute('id')}-error`);
  });

  it('describes a hint when there is no error, and stays aria-invalid-free', () => {
    render(<Input label="Email" hint="We never share it" />);
    const input = screen.getByLabelText('Email');
    expect(input.getAttribute('aria-invalid')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();

    const hintId = input.getAttribute('aria-describedby');
    expect(hintId).toBe(`${input.getAttribute('id')}-hint`);
    expect(document.getElementById(hintId ?? '')?.textContent).toBe('We never share it');
  });

  it('lets the error win over the hint (only one description is announced)', () => {
    render(<Input label="Email" hint="We never share it" error="Enter a valid email" />);
    const input = screen.getByLabelText('Email');
    expect(input.getAttribute('aria-describedby')).toBe(`${input.getAttribute('id')}-error`);
    expect(document.getElementById(`${input.getAttribute('id')}-hint`)).toBeNull();
    expect(screen.getByRole('alert').textContent).toBe('Enter a valid email');
  });

  it('renders without a label/hint/error without leaving stray describedby ids', () => {
    render(<Input name="code" placeholder="123456" />);
    const input = screen.getByPlaceholderText('123456');
    expect(input.getAttribute('aria-describedby')).toBeNull();
    expect(input.getAttribute('aria-invalid')).toBeNull();
  });
});

describe('Textarea', () => {
  it('shares the field shell (required marker + native required)', () => {
    render(<Textarea label="Message" required />);
    const area = screen.getByLabelText(/Message/) as HTMLTextAreaElement;
    expect(area.tagName).toBe('TEXTAREA');
    expect(area.required).toBe(true);
    expect(area.getAttribute('aria-describedby')).toBeNull();
  });

  it('announces its error through the same describedby wiring', () => {
    render(<Textarea label="Message" error="Too short" />);
    const area = screen.getByLabelText('Message');
    expect(area.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert').textContent).toBe('Too short');
    expect(area.getAttribute('aria-describedby')).toBe(`${area.getAttribute('id')}-error`);
  });
});

describe('Select', () => {
  it('renders as a combobox with the error description attached', () => {
    render(
      <Select label="Country" error="Pick a country">
        <option value="dz">Algeria</option>
      </Select>,
    );
    const select = screen.getByRole('combobox', { name: 'Country' });
    expect(select.tagName).toBe('SELECT');
    expect(select.getAttribute('aria-invalid')).toBe('true');
    expect(select.getAttribute('aria-describedby')).toBe(`${select.getAttribute('id')}-error`);
    expect(screen.getByRole('alert').textContent).toBe('Pick a country');
  });

  it('keeps the hint visible when nothing is wrong', () => {
    render(
      <Select label="Country" hint="Used for shipping">
        <option value="dz">Algeria</option>
      </Select>,
    );
    const select = screen.getByRole('combobox', { name: 'Country' });
    expect(select.getAttribute('aria-invalid')).toBeNull();
    expect(
      document.getElementById(select.getAttribute('aria-describedby') ?? '')?.textContent,
    ).toBe('Used for shipping');
  });
});
