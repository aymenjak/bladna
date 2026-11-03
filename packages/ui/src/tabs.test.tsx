/**
 * @vitest-environment jsdom
 *
 * Kit component tests (M8 / P6): the accessible tab set (RESEARCH §10 / P2
 * "Tabs a11y") — APG structure, roving tabindex, Arrow/Home/End keyboard
 * navigation with focus following, and panel wiring. Radix Tabs now provides
 * the behavior behind the kit API, so ids are Radix-generated: the assertions
 * resolve the wiring (`aria-controls`/`aria-labelledby`) instead of
 * hard-coding id strings.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TabPanel, Tabs, TabsRoot } from './tabs';

const ITEMS = [
  { id: 'overview', label: 'Overview' },
  { id: 'audit', label: 'Audit' },
  { id: 'exports', label: 'Exports' },
];

/** Controlled harness so selection actually moves (M7 admin tab pattern). */
function ControlledTabs() {
  const [active, setActive] = useState('overview');
  return (
    <TabsRoot active={active} onSelect={setActive}>
      <Tabs items={ITEMS} active={active} onSelect={setActive} ariaLabel="Admin sections" />
      <TabPanel id="overview" active={active}>
        Overview panel
      </TabPanel>
      <TabPanel id="audit" active={active}>
        Audit panel
      </TabPanel>
      <TabPanel id="exports" active={active}>
        Exports panel
      </TabPanel>
    </TabsRoot>
  );
}

/** Minimal standalone set (structure/click/ignored-key tests). */
function renderStandalone(onSelect: (id: string) => void, active = 'overview') {
  return render(
    <TabsRoot active={active} onSelect={onSelect}>
      <Tabs items={ITEMS} active={active} onSelect={onSelect} ariaLabel="Admin sections" />
    </TabsRoot>,
  );
}

describe('Tabs', () => {
  it('exposes the APG tablist structure with roving tabindex', () => {
    renderStandalone(() => {});
    const list = screen.getByRole('tablist', { name: 'Admin sections' });
    const tabs = list.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    expect(tabs).toHaveLength(3);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(tabs[1].getAttribute('aria-selected')).toBe('false');
    // Radix roving focus: the tablist is the initial tab stop; focusing an
    // item makes it the current stop (tabindex 0, siblings -1).
    expect(list.getAttribute('tabindex')).toBe('0');
    fireEvent.focus(tabs[0]);
    expect(tabs[0].getAttribute('tabindex')).toBe('0');
    expect(tabs[1].getAttribute('tabindex')).toBe('-1');
  });

  it('reports a click on another tab to the caller', () => {
    const onSelect = vi.fn();
    renderStandalone(onSelect);
    // Radix selects on primary mousedown (APG tabs behavior).
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Audit' }), { button: 0 });
    expect(onSelect).toHaveBeenCalledWith('audit');
  });

  it('moves selection and focus to the next tab on ArrowRight', async () => {
    render(<ControlledTabs />);
    const first = screen.getByRole('tab', { name: 'Overview' });
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    const audit = screen.getByRole('tab', { name: 'Audit' });
    // Radix queues the focus move on a timer; selection follows the focus
    // (automatic activation).
    await waitFor(() => {
      expect(document.activeElement).toBe(audit);
      expect(audit.getAttribute('aria-selected')).toBe('true');
    });
    // The panel swaps with the selection.
    await waitFor(() => expect(screen.getByRole('tabpanel').textContent).toBe('Audit panel'));
  });

  it('wraps from the first tab to the last on ArrowLeft', async () => {
    render(<ControlledTabs />);
    const first = screen.getByRole('tab', { name: 'Overview' });
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowLeft' });
    const last = screen.getByRole('tab', { name: 'Exports' });
    await waitFor(() => {
      expect(document.activeElement).toBe(last);
      expect(last.getAttribute('aria-selected')).toBe('true');
    });
  });

  it('jumps to the ends of the list with Home and End', async () => {
    render(<ControlledTabs />);
    const middle = screen.getByRole('tab', { name: 'Audit' });
    middle.focus();

    fireEvent.keyDown(middle, { key: 'End' });
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Exports' }).getAttribute('aria-selected')).toBe(
        'true',
      ),
    );

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Exports' }), { key: 'Home' });
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Overview' }).getAttribute('aria-selected')).toBe(
        'true',
      ),
    );
  });

  it('ignores keys outside the APG pattern', () => {
    const onSelect = vi.fn();
    renderStandalone(onSelect);
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Overview' }), { key: 'a' });
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('TabPanel', () => {
  it('links the active panel to its tab and drops inactive panels', () => {
    render(
      <TabsRoot active="audit" onSelect={() => {}}>
        <Tabs items={ITEMS} active="audit" onSelect={() => {}} ariaLabel="Admin sections" />
        <TabPanel id="audit" active="audit">
          Audit body
        </TabPanel>
        <TabPanel id="exports" active="audit">
          Exports body
        </TabPanel>
      </TabsRoot>,
    );
    const panel = screen.getByRole('tabpanel');
    const tab = screen.getByRole('tab', { name: 'Audit' });
    expect(panel.textContent).toBe('Audit body');
    expect(screen.queryByText('Exports body')).toBeNull();
    // Radix-managed wiring: both directions resolve to real elements.
    expect(panel.getAttribute('aria-labelledby')).toBe(tab.getAttribute('id'));
    expect(tab.getAttribute('aria-controls')).toBe(panel.getAttribute('id'));
    expect(panel.getAttribute('id')).toBeTruthy();
  });
});
