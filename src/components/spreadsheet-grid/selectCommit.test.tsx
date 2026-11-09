/* A select cell saves the moment you pick (Nov 2026 — Payroll's Employment
   dropdown did nothing with the mouse: the grid's mousedown blocked it from
   opening, and a pick only changed the draft until Enter). */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SpreadsheetGrid } from './SpreadsheetGrid';
import type { GridColumn } from './types';

// jsdom has no ResizeObserver; the grid only uses it to measure.
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;

type R = { id: string; kind: string };
const cols: GridColumn<R>[] = [
  { id: 'kind', header: 'Employment', accessor: 'kind', type: { kind: 'select', options: [{ value: 'crew', label: 'Crew' }, { value: 'band', label: 'Band' }] }, width: 120 },
];

describe('select cells', () => {
  it('picking an option commits it, and a click inside the open select is not swallowed', async () => {
    const onCommitCell = vi.fn(async () => {});
    render(<SpreadsheetGrid<R> columns={cols} rows={[{ id: 'r1', data: { id: 'r1', kind: 'crew' } }]} onCommitCell={onCommitCell} ariaLabel="t" />);
    const cell = screen.getAllByRole('gridcell').find((c) => c.textContent?.includes('Crew'))!;
    fireEvent.mouseDown(cell, { button: 0 });
    fireEvent.keyDown(screen.getByRole('grid'), { key: 'Enter' });
    const select = (await screen.findByLabelText('Select cell editor')) as HTMLSelectElement;
    // fireEvent returns false when a handler called preventDefault.
    expect(fireEvent.mouseDown(select, { button: 0 })).toBe(true);
    fireEvent.change(select, { target: { value: 'band' } });
    await vi.waitFor(() => expect(onCommitCell).toHaveBeenCalledWith('r1', 'kind', 'band'));
    expect(screen.queryByLabelText('Select cell editor')).toBeNull();
  });
});
