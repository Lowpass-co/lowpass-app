/* ============================================
   The grid's right-click menus (Nov 2026, Adam: "add right click to the grid
   system, with options").

   Cell → Copy · Paste · Clear · Open · Add line to "<section>" · Delete row(s)
   Section header → Rename · Add line · Move up / down · Delete section
   Column header → Hide column · Columns… · Reset column widths

   Never the browser's menu. Clear commits through onEdit like typing (it used
   to change only the screen) and skips what typing can't write; Paste obeys
   the same read-only rules (it used to write straight through them).
   ============================================ */

import { describe, expect, it, vi, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Grid } from './Grid';
import type { Column, Section } from './types';

afterEach(cleanup);

const COLS: Column[] = [
  { id: 'idx', label: '#', type: 'idx', w: 46, min: 40, resize: false },
  { id: 'item', label: 'Item', type: 'text', w: 200, min: 100, resize: true },
  { id: 'rate', label: 'Rate', type: 'number', w: 90, min: 70, resize: true, ro: true },
  { id: 'est', label: 'Estimate', type: 'money', w: 120, min: 90, resize: true },
  { id: 'status', label: 'Status', type: 'status', w: 120, min: 90, resize: true, options: ['draft', 'paid'] },
];

const data = (): Section[] => [
  {
    name: 'Production',
    kind: 'normal',
    _uid: 's-prod',
    rows: [
      { item: 'PA hire', rate: 5, est: 1200, act: 0, status: 'draft', _uid: 'r1' },
      { item: 'Lights', rate: 7, est: 800, act: 0, status: 'draft', _uid: 'r2' },
    ],
  },
  {
    name: 'Catering',
    kind: 'normal',
    _uid: 's-cat',
    rows: [{ item: 'Rider', rate: 0, est: 300, act: 0, status: 'paid', _uid: 'r3' }],
  },
  {
    name: 'Uncategorised',
    kind: 'normal',
    _uid: 'ungrouped',
    rows: [{ item: 'Misc', rate: 0, est: 50, act: 0, status: 'draft', _uid: 'r4' }],
  },
];

type Props = Partial<React.ComponentProps<typeof Grid>>;
function setup(props: Props = {}) {
  const onEdit = vi.fn();
  const utils = render(
    <Grid
      initialData={data()}
      initialColumns={COLS.map((c) => ({ ...c }))}
      onEdit={onEdit}
      onAddLine={vi.fn()}
      {...props}
    />,
  );
  return { onEdit, ...utils };
}

const cell = (container: HTMLElement, uid: string, ci: number) => {
  const el = container.querySelector(`.row[data-uid="${uid}"] .cell[data-c="${ci}"]`) as HTMLElement | null;
  if (!el) throw new Error(`no cell ${uid}:${ci}`);
  return el;
};
const header = (container: HTMLElement, si: number) => container.querySelector(`.sec-head[data-si="${si}"]`) as HTMLElement;
/** Right-click the way a mouse does: pointerdown (button 2) then contextmenu. */
function rightClick(el: HTMLElement) {
  fireEvent.pointerDown(el, { button: 2, clientX: 100, clientY: 100 });
  const ev = fireEvent.contextMenu(el, { clientX: 100, clientY: 100 });
  return ev; // false = default prevented (no browser menu)
}
const items = () => screen.queryAllByRole('menuitem').map((m) => m.textContent ?? '');
const pick = (label: RegExp) => {
  const el = screen.getAllByRole('menuitem').find((m) => label.test(m.textContent ?? ''));
  if (!el) throw new Error(`no item ${label}`);
  act(() => {
    fireEvent.click(el);
  });
};
// navCols = visible non-idx columns: item 0, rate 1, est 2, status 3.
const ITEM = 0, RATE = 1, EST = 2, STATUS = 3;

describe('cell menu', () => {
  it('opens our menu, not the browser’s, with the cell options', () => {
    const { container } = setup({ onDeleteRows: vi.fn() });
    const notPrevented = rightClick(cell(container, 'r1', ITEM));
    expect(notPrevented).toBe(false);
    const labels = items();
    expect(labels[0]).toMatch(/^Copy/);
    expect(labels[1]).toMatch(/^Paste.*Nothing copied/);
    expect(labels[2]).toMatch(/^Clear/);
    expect(labels.some((l) => l.startsWith('Open'))).toBe(true);
    expect(labels.some((l) => l.startsWith('Add line to “Production”'))).toBe(true);
    expect(labels[labels.length - 1]).toMatch(/^Delete row/);
    // Paste is disabled until something is copied.
    const paste = screen.getAllByRole('menuitem')[1];
    expect(paste.getAttribute('aria-disabled')).toBe('true');
  });

  it('no Open where the grid has nothing to open (Rooming: no Item column)', () => {
    const cols = COLS.filter((c) => c.id !== 'item').map((c) => ({ ...c }));
    const { container } = render(<Grid initialData={data()} initialColumns={cols} />);
    rightClick(container.querySelector('.row[data-uid="r1"] .cell[data-c="0"]') as HTMLElement);
    expect(items().some((l) => l.startsWith('Open'))).toBe(false);
  });

  it('no Delete row without an onDeleteRows host', () => {
    const { container } = setup();
    rightClick(cell(container, 'r1', ITEM));
    expect(items().some((l) => l.startsWith('Delete'))).toBe(false);
  });

  it('Clear persists through onEdit, like typing', () => {
    const { container, onEdit } = setup();
    rightClick(cell(container, 'r1', EST));
    pick(/^Clear/);
    expect(onEdit).toHaveBeenCalledWith('r1', 'est', 0);
    expect(cell(container, 'r1', EST).textContent).not.toMatch(/1,200/);
  });

  it('Clear skips read-only and pick-list cells — disabled when nothing is clearable', () => {
    const { container, onEdit } = setup();
    rightClick(cell(container, 'r1', RATE));
    const clear = screen.getAllByRole('menuitem').find((m) => /^Clear/.test(m.textContent ?? ''))!;
    expect(clear.getAttribute('aria-disabled')).toBe('true');
    expect(clear.textContent).toMatch(/Nothing to clear/);
    act(() => {
      fireEvent.click(clear);
    });
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('Copy then Paste writes only writable cells — never the read-only one', () => {
    const { container, onEdit } = setup();
    // Copy r2's Item…Rate (two cells), paste onto r1.
    fireEvent.pointerDown(cell(container, 'r2', ITEM), { button: 0 });
    fireEvent.pointerDown(cell(container, 'r2', RATE), { button: 0, shiftKey: true });
    rightClick(cell(container, 'r2', ITEM));
    pick(/^Copy/);
    fireEvent.pointerDown(cell(container, 'r1', ITEM), { button: 0 });
    rightClick(cell(container, 'r1', ITEM));
    pick(/^Paste/);
    expect(onEdit).toHaveBeenCalledWith('r1', 'item', 'Lights');
    expect(onEdit).not.toHaveBeenCalledWith('r1', 'rate', expect.anything());
  });

  it('Delete row hands the highlighted row to the host', () => {
    const onDeleteRows = vi.fn();
    const { container } = setup({ onDeleteRows });
    rightClick(cell(container, 'r3', ITEM));
    pick(/^Delete row/);
    expect(onDeleteRows).toHaveBeenCalledWith(['r3']);
  });

  it('several highlighted rows stay highlighted when you right-click another column of them', () => {
    const onDeleteRows = vi.fn();
    const { container } = setup({ onDeleteRows });
    fireEvent.pointerDown(cell(container, 'r1', ITEM), { button: 0 });
    fireEvent.pointerDown(cell(container, 'r2', ITEM), { button: 0, shiftKey: true });
    rightClick(cell(container, 'r2', EST));
    pick(/^Delete 2 rows/);
    expect(onDeleteRows).toHaveBeenCalledWith(['r1', 'r2']);
  });

  it('right-clicking outside the highlight moves it to the clicked cell', () => {
    const onDeleteRows = vi.fn();
    const { container } = setup({ onDeleteRows });
    fireEvent.pointerDown(cell(container, 'r1', ITEM), { button: 0 });
    fireEvent.pointerDown(cell(container, 'r2', ITEM), { button: 0, shiftKey: true });
    rightClick(cell(container, 'r3', EST));
    pick(/^Delete row/);
    expect(onDeleteRows).toHaveBeenCalledWith(['r3']);
  });

  it('Add line goes to the clicked row’s section', () => {
    const onAddLine = vi.fn();
    const { container } = setup({ onAddLine });
    rightClick(cell(container, 'r3', ITEM));
    pick(/^Add line to “Catering”/);
    expect(onAddLine).toHaveBeenCalledWith('s-cat');
  });

  it('a status cell still gets the menu, but Clear leaves pick-lists alone', () => {
    const { container, onEdit } = setup();
    rightClick(cell(container, 'r1', STATUS));
    pick(/^Clear/);
    expect(onEdit).not.toHaveBeenCalled();
  });
});

describe('automatic (derived) sections', () => {
  const derived = (): Section[] => [
    { name: 'Salaries', kind: 'derived', source: 'Payroll', _uid: 's-sal', rows: [{ item: 'Ben', rate: 0, est: 4000, act: 3900, status: 'draft', _uid: 'p1' }] },
  ];
  const cols = (): Column[] => [...COLS.slice(0, 4).map((c) => ({ ...c })), { id: 'act', label: 'Actual', type: 'money', w: 120, min: 90, resize: true }];
  it('Clear leaves the Estimate alone — Payroll owns it', () => {
    const onEdit = vi.fn();
    const { container } = render(<Grid initialData={derived()} initialColumns={cols()} onEdit={onEdit} />);
    rightClick(cell(container, 'p1', EST));
    const clear = screen.getAllByRole('menuitem').find((m) => /^Clear/.test(m.textContent ?? ''))!;
    expect(clear.getAttribute('aria-disabled')).toBe('true');
  });
  it('…but clears the Actual, as typing can', () => {
    const onEdit = vi.fn();
    const { container } = render(<Grid initialData={derived()} initialColumns={cols()} onEdit={onEdit} />);
    rightClick(cell(container, 'p1', 3));
    pick(/^Clear/);
    expect(onEdit).toHaveBeenCalledWith('p1', 'act', 0);
    expect(onEdit).not.toHaveBeenCalledWith('p1', 'est', expect.anything());
  });
});

describe('anywhere in a row', () => {
  it('the # handle gets the row menu (no cell ops) and Delete means THAT row', () => {
    const onDeleteRows = vi.fn();
    const { container } = setup({ onDeleteRows });
    // r1 is highlighted (the default); right-click r3's # handle.
    const idx = container.querySelector('.row[data-uid="r3"] .c.idx') as HTMLElement;
    expect(fireEvent.contextMenu(idx, { clientX: 5, clientY: 5 })).toBe(false);
    expect(items().some((l) => l.startsWith('Copy'))).toBe(false);
    pick(/^Delete row/);
    expect(onDeleteRows).toHaveBeenCalledWith(['r3']);
  });

  it('typing in a cell keeps the browser’s menu', () => {
    const { container } = setup();
    fireEvent.pointerDown(cell(container, 'r1', ITEM), { button: 0 });
    fireEvent.keyDown(document, { key: 'x' });
    const input = container.querySelector('.cell .editing') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(fireEvent.contextMenu(input)).toBe(true); // not prevented
    expect(screen.queryAllByRole('menuitem')).toHaveLength(0);
  });
});

describe('section menu', () => {
  const fixed = (uid: string) => uid === 'ungrouped';

  it('Rename · Add line · Move up / down · Delete section', () => {
    const { container } = setup({ onDeleteSection: vi.fn(), isFixedSection: fixed });
    expect(rightClick(header(container, 0))).toBe(false);
    const labels = items();
    expect(labels).toEqual(['Rename', 'Add line', 'Move up', 'Move down', 'Delete section']);
    // first section can't move up
    const up = screen.getAllByRole('menuitem')[2];
    expect(up.getAttribute('aria-disabled')).toBe('true');
  });

  it('Delete section asks the host, with the section id', () => {
    const onDeleteSection = vi.fn();
    const { container } = setup({ onDeleteSection, isFixedSection: fixed });
    rightClick(header(container, 1));
    pick(/^Delete section/);
    expect(onDeleteSection).toHaveBeenCalledWith('s-cat');
  });

  it('Move down commits the new order like a drag', () => {
    const onReorderSection = vi.fn();
    const { container } = setup({ onReorderSection, isFixedSection: fixed });
    rightClick(header(container, 0));
    pick(/^Move down/);
    expect(onReorderSection).toHaveBeenCalledWith(['s-cat', 's-prod', 'ungrouped']);
  });

  it('can’t move past a fixed section (Uncategorised)', () => {
    const { container } = setup({ isFixedSection: fixed });
    rightClick(header(container, 1));
    const down = screen.getAllByRole('menuitem').find((m) => m.textContent === 'Move down')!;
    expect(down.getAttribute('aria-disabled')).toBe('true');
  });

  it('a fixed section can’t be renamed, moved or deleted — only lines added', () => {
    const { container } = setup({ onDeleteSection: vi.fn(), isFixedSection: fixed });
    rightClick(header(container, 2));
    expect(items()).toEqual(['Add line']);
  });

  it('no Delete section without a host', () => {
    const { container } = setup({ isFixedSection: fixed });
    rightClick(header(container, 0));
    expect(items()).not.toContain('Delete section');
  });

  it('Rename opens the rename prompt and persists', () => {
    const onRenameSection = vi.fn();
    const { container } = setup({ onRenameSection });
    rightClick(header(container, 0));
    pick(/^Rename/);
    const input = document.querySelector('.lp-grid-modal-ovl input, [role="dialog"] input') as HTMLInputElement;
    expect(input).toBeTruthy();
    fireEvent.change(input, { target: { value: 'Sound' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRenameSection).toHaveBeenCalledWith('s-prod', 'Sound');
  });
});

describe('column menu', () => {
  it('Hide column hides it; # can’t be hidden', () => {
    const { container } = setup();
    const est = container.querySelector('.gridhead .hc[data-colid="est"]') as HTMLElement;
    expect(rightClick(est)).toBe(false);
    expect(items()).toEqual(['Hide column', 'Columns…', 'Reset column widths']);
    pick(/^Hide column/);
    expect(container.querySelector('.gridhead .hc[data-colid="est"]')).toBeNull();

    const idx = container.querySelector('.gridhead .hc[data-colid="idx"]') as HTMLElement;
    rightClick(idx);
    const hide = screen.getAllByRole('menuitem')[0];
    expect(hide.getAttribute('aria-disabled')).toBe('true');
  });
});

describe('grouped by status, the menu acts on the row on screen', () => {
  // Display order by status (draft, paid): a2, b1, a1 — not section order.
  const grouped = (): Section[] => [
    { name: 'A', kind: 'normal', _uid: 'sA', rows: [
      { item: 'A one', rate: 0, est: 10, act: 0, status: 'paid', _uid: 'a1' },
      { item: 'A two', rate: 0, est: 20, act: 0, status: 'draft', _uid: 'a2' },
    ] },
    { name: 'B', kind: 'normal', _uid: 'sB', rows: [{ item: 'B one', rate: 0, est: 30, act: 0, status: 'draft', _uid: 'b1' }] },
  ];
  const groupByStatus = (container: HTMLElement) => {
    const more = [...container.querySelectorAll('.chip')].find((c) => /More/.test(c.textContent ?? '')) as HTMLElement;
    fireEvent.click(more);
    const g = screen.getAllByRole('menuitem').find((m) => /Group by/.test(m.textContent ?? ''))!;
    fireEvent.click(g);
  };
  const displayCell = (container: HTMLElement, r: number, c: number) =>
    container.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`) as HTMLElement;

  it('Clear clears the highlighted row, not the one at that index in section order', () => {
    const onEdit = vi.fn();
    const { container } = render(<Grid initialData={grouped()} initialColumns={COLS.map((c) => ({ ...c }))} onEdit={onEdit} />);
    groupByStatus(container);
    expect(displayCell(container, 0, ITEM).textContent).toMatch(/A two/);
    rightClick(displayCell(container, 0, EST));
    pick(/^Clear/);
    expect(onEdit).toHaveBeenCalledWith('a2', 'est', 0);
    expect(onEdit).not.toHaveBeenCalledWith('a1', expect.anything(), expect.anything());
  });

  it('Open (menu and ⤢) opens the row on screen', () => {
    const onOpenRow = vi.fn();
    const { container } = render(<Grid initialData={grouped()} initialColumns={COLS.map((c) => ({ ...c }))} onOpenRow={onOpenRow} />);
    groupByStatus(container);
    // display row 1 is B one = section 1, row 0
    fireEvent.click(displayCell(container, 1, ITEM).querySelector('.openbtn')!);
    expect(onOpenRow).toHaveBeenLastCalledWith(1, 0);
    rightClick(displayCell(container, 2, ITEM)); // A one = section 0, row 0
    pick(/^Open/);
    expect(onOpenRow).toHaveBeenLastCalledWith(0, 0);
  });

  it('typing edits the highlighted row', () => {
    const onEdit = vi.fn();
    const { container } = render(<Grid initialData={grouped()} initialColumns={COLS.map((c) => ({ ...c }))} onEdit={onEdit} />);
    groupByStatus(container);
    fireEvent.pointerDown(displayCell(container, 1, ITEM), { button: 0 });
    fireEvent.keyDown(document, { key: 'x' });
    const input = container.querySelector('.cell .editing') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Renamed' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onEdit).toHaveBeenCalledWith('b1', 'item', 'Renamed');
  });
});
