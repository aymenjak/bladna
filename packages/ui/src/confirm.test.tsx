/**
 * @vitest-environment jsdom
 *
 * Kit component tests (P6): the destructive-action gate — Radix
 * AlertDialog/Dialog behind the promise-based `useConfirm`/`usePrompt` API
 * that replaced every `window.confirm`/`window.prompt` in the app. The
 * contract callers rely on: same copy shown, `true`/`false` and
 * `string`/`null` resolution, Esc/overlay dismissal = cancel.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { ConfirmProvider, useConfirm, usePrompt } from './confirm';

function Harness({ onResult }: { onResult: (value: unknown) => void }) {
  const confirm = useConfirm();
  const prompt = usePrompt();
  return (
    <div>
      <button type="button" onClick={() => void confirm('Delete this item?').then(onResult)}>
        ask-confirm
      </button>
      <button
        type="button"
        onClick={() => void prompt('Reason', { defaultValue: 'seed' }).then(onResult)}
      >
        ask-prompt
      </button>
    </div>
  );
}

function renderGate() {
  const results: unknown[] = [];
  const onResult = (value: unknown): void => {
    results.push(value);
  };
  render(
    <ConfirmProvider labels={{ confirm: 'Confirm', cancel: 'Cancel' }}>
      <Harness onResult={onResult} />
    </ConfirmProvider>,
  );
  return { results };
}

describe('useConfirm', () => {
  it('shows the exact message and resolves true on confirm', async () => {
    const { results } = renderGate();
    fireEvent.click(screen.getByRole('button', { name: 'ask-confirm' }));

    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toContain('Delete this item?');
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(results).toEqual([true]));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('resolves false when cancelled', async () => {
    const { results } = renderGate();
    fireEvent.click(screen.getByRole('button', { name: 'ask-confirm' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(results).toEqual([false]));
  });

  it('resolves false on Escape', async () => {
    const { results } = renderGate();
    fireEvent.click(screen.getByRole('button', { name: 'ask-confirm' }));
    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(results).toEqual([false]));
  });
});

describe('usePrompt', () => {
  it('pre-fills the default value and resolves the entered text', async () => {
    const { results } = renderGate();
    fireEvent.click(screen.getByRole('button', { name: 'ask-prompt' }));

    const input = screen.getByRole('textbox', { name: 'Reason' });
    expect((input as HTMLInputElement).value).toBe('seed');
    fireEvent.change(input, { target: { value: 'wrong label' } });
    const form = input.closest('form');
    expect(form).not.toBeNull();
    if (form) fireEvent.submit(form);

    await waitFor(() => expect(results).toEqual(['wrong label']));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('resolves null when dismissed with Escape', async () => {
    const { results } = renderGate();
    fireEvent.click(screen.getByRole('button', { name: 'ask-prompt' }));
    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(results).toEqual([null]));
  });

  it('resolves null when cancelled', async () => {
    const { results } = renderGate();
    fireEvent.click(screen.getByRole('button', { name: 'ask-prompt' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(results).toEqual([null]));
  });
});

// The provider is mounted once in the root layout — it must survive consumer
// re-renders (state changes under it) without losing the pending dialog.
describe('provider stability', () => {
  it('keeps dialogs working after a consumer re-render', async () => {
    function Counter() {
      const [count, setCount] = useState(0);
      const confirm = useConfirm();
      return (
        <button
          type="button"
          onClick={() => {
            setCount((c) => c + 1);
            void confirm(`Run ${count + 1}?`).then(() => undefined);
          }}
        >
          re-render
        </button>
      );
    }
    render(
      <ConfirmProvider labels={{ confirm: 'OK', cancel: 'No' }}>
        <Counter />
      </ConfirmProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 're-render' }));
    expect(screen.getByRole('alertdialog').textContent).toContain('Run 1?');
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });
});
