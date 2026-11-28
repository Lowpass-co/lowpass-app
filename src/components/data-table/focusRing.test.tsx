import { describe, expect, it } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { DataTable } from './DataTable';

type R = { id: string; name: string };
const rows: R[] = [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Bravo' }];

/* Nov 2026, Adam ("what's the orange highlight here?"): every table drew its
   keyboard cursor on row 1 at rest; a page of several tables had one per
   table. It shows only while focus is inside that table now. */
describe('DataTable keyboard cursor', () => {
  it('no ring at rest; ring while the table has focus; gone when focus leaves', () => {
    const { container } = render(
      <div>
        <DataTable<R> rows={rows} columns={[{ id: 'name', header: 'Name', accessor: 'name' }]} rowKey={(r) => r.id} searchable={false} toolbar={false} pagination="none" />
        <button type="button">elsewhere</button>
      </div>,
    );
    expect(container.querySelector('[data-focused]')).toBeNull();
    const first = container.querySelector('tr[data-row-id="a"]') as HTMLElement;
    fireEvent.focus(first);
    expect(container.querySelector('[data-focused]')?.getAttribute('data-row-id')).toBe('a');
    fireEvent.blur(first, { relatedTarget: container.querySelector('button') });
    expect(container.querySelector('[data-focused]')).toBeNull();
  });
});
