/* <ScheduleImportFlow> — paste → AI reads → review (edit, keep, untick) → the
   exact patch sent; and the new-tour hand-back. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ScheduleImportFlow } from './ScheduleImportFlow';
import { ScheduleImportModal } from './ScheduleImportModal';

vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('@/lib/supabase-client', () => ({ createClient: () => ({ storage: { from: () => ({ uploadToSignedUrl: async () => ({ error: null }) }) } }) }));

const fetchMock = vi.fn();
const extraction = {
  meta: { tourName: 'Fall run', artistName: 'Charlotte Sands', startDate: '2026-10-09', endDate: '2026-11-02' },
  warnings: ['The year for 2 Nov was inferred.'],
  days: [
    { date: '2026-10-09', day_type: 'show', venue_name: 'Roundhouse', city: 'London', country: 'UK', address: 'Chalk Farm Rd', notes: '', confidence: 'high', source: '' },
    { date: '2026-10-10', day_type: 'travel', venue_name: '', city: '', country: '', address: '', notes: '', confidence: 'high', source: '' },
    { date: '2026-11-02', day_type: 'show', venue_name: 'O2 Ritz', city: 'Manchester', country: 'UK', address: '', notes: '', confidence: 'low', source: 'Mon 2 Nov — Ritz' },
  ],
};
const existing = [
  { date: '2026-10-09', day_type: 'show', venue_name: 'KOKO', city: 'London', country: 'UK', address: '', notes: '' },
  { date: '2026-10-10', day_type: 'travel', venue_name: '', city: '', country: '', address: '', notes: '' },
];

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    if (url === '/api/import/schedule') return new Response(JSON.stringify(extraction), { status: 200 });
    if (url.endsWith('/routing/import')) return new Response(JSON.stringify({ inserted: 1, updated: 1, tourDates: null }), { status: 200 });
    return new Response('{}', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
});

async function readPasted() {
  fireEvent.change(screen.getByLabelText(/or paste a schedule/), { target: { value: 'Fri 9 Oct Roundhouse' } });
  fireEvent.click(screen.getByRole('button', { name: /Read with AI/ }));
  await screen.findByTestId('import-review');
}

describe('<ScheduleImportFlow>', () => {
  it('shows new / changes / matches, warnings, and the tour widening', async () => {
    render(<ScheduleImportFlow mode="existing" tourId="t1" tourStart="2026-10-01" tourEnd="2026-10-31" existing={existing} onCancel={() => {}} />);
    await readPasted();
    expect(screen.getByText('The year for 2 Nov was inferred.')).toBeTruthy();
    expect(screen.getByText(/extends it to/)).toBeTruthy();
    const rows = screen.getAllByTestId('import-row');
    expect(rows).toHaveLength(2); // the matching travel day is out of the way
    expect(within(rows[0]).getByText('Changes')).toBeTruthy();
    expect(within(rows[0]).getByText(/replaces “KOKO”/)).toBeTruthy();
    expect(within(rows[1]).getByText('New')).toBeTruthy();
    expect(within(rows[1]).getByText('Check')).toBeTruthy(); // low confidence
    expect(screen.getByRole('button', { name: 'Import 2 days' })).toBeTruthy();
  });

  it('sends exactly what was approved: edits applied, kept fields left out', async () => {
    const onApplied = vi.fn();
    render(<ScheduleImportFlow mode="existing" tourId="t1" tourStart="2026-10-01" tourEnd="2026-10-31" existing={existing} onCancel={() => {}} onApplied={onApplied} />);
    await readPasted();
    const rows = screen.getAllByTestId('import-row');
    // keep KOKO (don't take the AI's venue) but take its address
    fireEvent.click(within(rows[0]).getAllByRole('button', { name: 'keep' })[0]);
    // fix the AI's city on the new day
    fireEvent.change(within(rows[1]).getByLabelText(/City for/), { target: { value: 'Salford' } });
    fireEvent.click(screen.getByRole('button', { name: 'Import 2 days' }));
    await waitFor(() => expect(onApplied).toHaveBeenCalled());
    const call = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/routing/import'))!;
    expect(JSON.parse((call[1] as RequestInit).body as string)).toEqual({
      days: [
        { date: '2026-10-09', fields: { address: 'Chalk Farm Rd' } },
        { date: '2026-11-02', fields: { day_type: 'show', venue_name: 'O2 Ritz', city: 'Salford', country: 'UK' } },
      ],
    });
  });

  it('unticking a day leaves it out', async () => {
    render(<ScheduleImportFlow mode="existing" tourId="t1" tourStart="2026-10-01" tourEnd="2026-10-31" existing={existing} onCancel={() => {}} />);
    await readPasted();
    fireEvent.click(screen.getByLabelText(/Import Mon,? 2 Nov 2026/));
    expect(screen.getByRole('button', { name: 'Import 1 day' })).toBeTruthy();
  });

  it('new tour: hands the approved days and the book’s name/dates back', async () => {
    const onUse = vi.fn();
    render(<ScheduleImportFlow mode="new-tour" onCancel={() => {}} onUse={onUse} />);
    await readPasted();
    fireEvent.click(screen.getByRole('button', { name: 'Use 3 days' }));
    expect(onUse).toHaveBeenCalledWith(expect.objectContaining({ meta: extraction.meta }));
    expect(onUse.mock.calls[0][0].days.map((d: { date: string }) => d.date)).toEqual(['2026-10-09', '2026-10-10', '2026-11-02']);
    expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith('/routing/import'))).toBe(false);
  });

  it('closing the modal mid-review asks first', async () => {
    const onClose = vi.fn();
    render(<ScheduleImportModal open onClose={onClose} tourId="t1" tourStart="2026-10-01" tourEnd="2026-10-31" existing={existing} />);
    await readPasted();
    fireEvent.click(screen.getByLabelText('Close dialog'));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText(/Discard this import\?/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Keep reviewing' }));
    expect(screen.getByTestId('import-review')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Close dialog'));
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('a Word file never gets sent; errors come back readable', async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ error: '“b.docx” is a Word/Pages file — save it as PDF and drop that instead.' }), { status: 400 }));
    render(<ScheduleImportFlow mode="existing" tourId="t1" existing={[]} onCancel={() => {}} />);
    fireEvent.change(screen.getByLabelText(/or paste a schedule/), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: /Read with AI/ }));
    expect(await screen.findByText(/save it as PDF/)).toBeTruthy();
    expect(screen.getByTestId('import-add')).toBeTruthy();
  });
});
