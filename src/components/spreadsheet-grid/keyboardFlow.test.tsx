/* Keyboard flow in <SpreadsheetGrid> (Payroll) — Nov 2026, Adam:
   "after entering a number I hit Tab and it changes the paintbrush, not the
   cell. After Tab, arrows control scroll, not cell."  And: "hitting
   backspace on a cell should return it to blank / zero."

   Closing an editor unmounted its <input> and focus fell to <body>, so the
   next Tab / arrow left the grid. Backspace did nothing in navigate mode. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SpreadsheetGrid } from './SpreadsheetGrid';
import type { GridColumn } from './types';

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
afterEach(cleanup);

type R = { id: string; name: string; show: number; travel: number; kind: string };
const cols: GridColumn<R>[] = [
  { id: 'name', header: 'Name', accessor: 'name', type: { kind: 'text' }, width: 120 },
  { id: 'show', header: 'Show', accessor: 'show', type: { kind: 'currency', currency: 'USD' }, width: 100 },
  { id: 'travel', header: 'Travel', accessor: 'travel', type: { kind: 'currency', currency: 'USD' }, width: 100 },
  { id: 'kind', header: 'Kind', accessor: 'kind', type: { kind: 'select', options: [{ value: 'crew', label: 'Crew' }] }, width: 100 },
];
const rows = () => [
  { id: 'a', data: { id: 'a', name: 'Adam', show: 600, travel: 100, kind: 'crew' } },
  { id: 'b', data: { id: 'b', name: 'Ben', show: 400, travel: 0, kind: 'crew' } },
];

function setup() {
  const onCommitCell = vi.fn(async () => {});
  render(
    <>
      <SpreadsheetGrid<R> columns={cols} rows={rows()} onCommitCell={onCommitCell} ariaLabel="t" />
      <button type="button">Paint: Show</button>
    </>,
  );
  const grid = screen.getByRole('grid');
  const cell = (text: string) => screen.getAllByRole('gridcell').find((c) => c.textContent?.includes(text))!;
  return { onCommitCell, grid, cell };
}

describe('keyboard stays in the grid', () => {
  it('type → Tab commits, and the grid (not the paint chips) still has the keyboard', async () => {
    const { onCommitCell, grid, cell } = setup();
    fireEvent.mouseDown(cell('600'), { button: 0 });
    grid.focus();
    fireEvent.keyDown(grid, { key: 'Enter' });
    const input = (await screen.findByLabelText('Number cell editor')) as HTMLInputElement;
    input.focus();
    fireEvent.change(input, { target: { value: '650' } });
    act(() => {
      fireEvent.keyDown(input, { key: 'Tab' });
    });
    await vi.waitFor(() => expect(onCommitCell).toHaveBeenCalledWith('a', 'show', 650));
    await vi.waitFor(() => expect(document.activeElement).toBe(grid));
  });

  it('Enter commits, then arrows move the cell — focus is back on the grid', async () => {
    const { grid, cell } = setup();
    fireEvent.mouseDown(cell('Adam'), { button: 0 });
    grid.focus();
    fireEvent.keyDown(grid, { key: 'Enter' });
    const input = (await screen.findByLabelText(/cell editor/i)) as HTMLInputElement;
    input.focus();
    act(() => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    await vi.waitFor(() => expect(document.activeElement).toBe(grid));
    // focus moved down to Ben on Enter; ArrowRight → Ben's Show
    fireEvent.keyDown(grid, { key: 'ArrowRight' });
    const active = screen.getAllByRole('gridcell').find((c) => c.getAttribute('aria-current') === 'true');
    expect(active?.textContent).toMatch(/400/);
  });
});

describe('Backspace clears', () => {
  it('a number cell goes to 0', async () => {
    const { onCommitCell, grid, cell } = setup();
    fireEvent.mouseDown(cell('600'), { button: 0 });
    fireEvent.keyDown(grid, { key: 'Backspace' });
    await vi.waitFor(() => expect(onCommitCell).toHaveBeenCalledWith('a', 'show', 0));
  });

  it('a range clears every editable value cell — never the pick-list', async () => {
    const { onCommitCell, grid, cell } = setup();
    fireEvent.mouseDown(cell('Adam'), { button: 0 });
    fireEvent.mouseDown(cell('Ben'), { button: 0, shiftKey: true }); // rows a..b, column name
    // extend to the Kind column on row b
    fireEvent.keyDown(grid, { key: 'ArrowRight', shiftKey: true });
    fireEvent.keyDown(grid, { key: 'ArrowRight', shiftKey: true });
    fireEvent.keyDown(grid, { key: 'ArrowRight', shiftKey: true });
    fireEvent.keyDown(grid, { key: 'Delete' });
    await vi.waitFor(() => expect(onCommitCell).toHaveBeenCalledWith('a', 'name', ''));
    expect(onCommitCell).toHaveBeenCalledWith('b', 'name', '');
    expect(onCommitCell).toHaveBeenCalledWith('a', 'show', 0);
    expect(onCommitCell).toHaveBeenCalledWith('a', 'travel', 0);
    expect(onCommitCell).toHaveBeenCalledWith('b', 'show', 0);
    // already 0 → no write; the select is never touched
    expect(onCommitCell).not.toHaveBeenCalledWith('b', 'travel', expect.anything());
    expect(onCommitCell).not.toHaveBeenCalledWith(expect.anything(), 'kind', expect.anything());
  });
});

/* Nov 2026, Adam (rental lines): "if I type a number it doesn't save and
   wherever I click, that number then populates till I click away." Only
   Enter / Tab committed; a click left the editor open, following the
   highlight with the typed draft. */
describe('clicking away saves', () => {
  async function typeInto(cell: (t: string) => HTMLElement, grid: HTMLElement, text: string, value: string) {
    fireEvent.mouseDown(cell(text), { button: 0 });
    grid.focus();
    fireEvent.keyDown(grid, { key: 'Enter' });
    const input = (await screen.findByLabelText('Number cell editor')) as HTMLInputElement;
    fireEvent.change(input, { target: { value } });
    return input;
  }

  it('a click on another cell commits the typed value to the FIRST cell and closes the editor', async () => {
    const { onCommitCell, grid, cell } = setup();
    await typeInto(cell, grid, '600', '34');
    act(() => {
      fireEvent.mouseDown(cell('400'), { button: 0 });
    });
    await vi.waitFor(() => expect(onCommitCell).toHaveBeenCalledWith('a', 'show', 34));
    expect(onCommitCell).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText('Number cell editor')).toBeNull();
  });

  it('a click outside the grid commits too', async () => {
    const { onCommitCell, grid, cell } = setup();
    await typeInto(cell, grid, '600', '72');
    act(() => {
      fireEvent.mouseDown(screen.getByText('Paint: Show'), { button: 0 });
    });
    await vi.waitFor(() => expect(onCommitCell).toHaveBeenCalledWith('a', 'show', 72));
    expect(screen.queryByLabelText('Number cell editor')).toBeNull();
  });
});
