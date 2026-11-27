import { describe, expect, it } from 'vitest';
import { FakeDb } from '@/test-utils/fakeSupabase';
import { fileRefId, filesWrite, tourOfFile, tourOfLink } from './writeGate';

/* Adam, Nov 2026: "Ben is tour manager permissions but can't save a parking
   map". Filing the PDF went through admin/manager-only Files routes. */
describe('Files writes go by tour access', () => {
  const db = new FakeDb();
  db.seed('routing', [{ id: 'day-1', tour_id: 'tour-1' }]);
  db.seed('file_references', [
    { id: 'f-tour', linked_to_type: 'tour', linked_to_id: 'tour-1' },
    { id: 'f-day', linked_to_type: 'routing', linked_to_id: 'day-1' },
    { id: 'f-artist', linked_to_type: 'artist', linked_to_id: 'artist-1' },
  ]);
  db.seed('file_entity_links', [{ id: 'l-1', file_id: 'f-day' }]);

  it('a tour file asks for Files EDIT on its tour (a Tour manager has it on his tours)', async () => {
    expect(filesWrite(await tourOfFile(db.client(), 'f-tour'))).toEqual({ area: 'files', tourId: 'tour-1' });
    expect(filesWrite(await tourOfFile(db.client(), 'f-day'))).toEqual({ area: 'files', tourId: 'tour-1' });
    expect(filesWrite(await tourOfLink(db.client(), 'l-1'))).toEqual({ area: 'files', tourId: 'tour-1' });
  });

  it('the canvas id "ref:<uuid>" is the same file (the parking export sent it unstripped)', async () => {
    expect(fileRefId('ref:f-tour')).toBe('f-tour');
    expect(await tourOfFile(db.client(), 'ref:f-tour')).toBe('tour-1');
  });

  it('artist files and files nobody can place stay admin / manager', async () => {
    expect(filesWrite(await tourOfFile(db.client(), 'f-artist'))).toEqual({});
    expect(filesWrite(await tourOfFile(db.client(), 'nope'))).toEqual({});
    expect(filesWrite(await tourOfLink(db.client(), 'nope'))).toEqual({});
  });
});
