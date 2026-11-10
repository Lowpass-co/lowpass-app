/* Channel list pickers — type to find, Enter takes the first match
   (Nov 2026, Adam: "auto select first in list instead of me having to arrow
   down"; Pos / Stand "only allow one character before forcing a selection"). */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { PositionSelectCell } from './PositionSelectCell';
import { StandSelectCell } from './StandSelectCell';
import { MicDiSelectCell, firstMatchIndex, micComboItems } from './MicDiSelectCell';
import type { MicLibraryEntry } from '@/lib/rider-packs/types';

const mics = [
  { id: '1', name: 'Audio Technica AE3000', type: 'condenser' },
  { id: '2', name: 'Audio-Technica AE2300', type: 'dynamic' },
  { id: '3', name: 'Shure SM57', type: 'dynamic' },
] as unknown as MicLibraryEntry[];

function Cells() {
  const [pos, setPos] = useState('');
  const [stand, setStand] = useState('');
  const [mic, setMic] = useState('');
  return (
    <>
      <PositionSelectCell value={pos} onChange={setPos} ariaLabel="Position" />
      <MicDiSelectCell value={mic} mics={mics} onPick={(_e, n) => setMic(n)} ariaLabel="Mic" workspaceId="w" onMicCreated={() => {}} />
      <StandSelectCell value={stand} onChange={setStand} ariaLabel="Stand" />
      <output data-testid="state">{JSON.stringify({ pos, mic, stand })}</output>
    </>
  );
}
const state = () => JSON.parse(screen.getByTestId('state').textContent ?? '{}');

describe('Pos and Stand: keep typing, Enter takes the first match', () => {
  it('Pos: "DSR" + Enter → DSR (it used to stop at one letter)', async () => {
    const u = userEvent.setup();
    render(<Cells />);
    screen.getByRole('button', { name: 'Position' }).focus();
    await u.keyboard('DSR{Enter}');
    expect(state().pos).toBe('DSR');
  });

  it('Pos: "DS" + Enter → the FIRST match, no arrow needed', async () => {
    const u = userEvent.setup();
    render(<Cells />);
    screen.getByRole('button', { name: 'Position' }).focus();
    await u.keyboard('DS{Enter}');
    expect(state().pos).toBe('DSC');
  });

  it('Stand: "tall" + Enter → Tall Boom; focus comes back to the cell', async () => {
    const u = userEvent.setup();
    render(<Cells />);
    const trigger = screen.getByRole('button', { name: 'Stand' });
    trigger.focus();
    await u.keyboard('tall{Enter}');
    expect(state().stand).toBe('Tall Boom');
    expect(document.activeElement).toBe(trigger);
  });
});

describe('Mic: typing highlights the first match', () => {
  it('"AE" + Enter → the first AE mic', async () => {
    const u = userEvent.setup();
    render(<Cells />);
    await u.click(screen.getByRole('combobox', { name: 'Mic' }));
    await u.keyboard('AE{Enter}');
    expect(state().mic).toBe('Audio Technica AE3000');
  });

  it('focus + Enter without typing picks nothing (passing through a cell is safe)', async () => {
    const u = userEvent.setup();
    render(<Cells />);
    screen.getByRole('combobox', { name: 'Mic' }).focus();
    await u.keyboard('{Enter}');
    expect(state().mic).toBe('');
  });

  it('the rule: first mic, else the Add row; never Clear; nothing when nothing typed', () => {
    expect(firstMatchIndex(micComboItems('sm', 'Shure SM57', mics), 'sm')).toBe(1); // [Clear, SM57]
    expect(firstMatchIndex(micComboItems('zzz', '', mics), 'zzz')).toBe(0); // [Add "zzz"]
    expect(firstMatchIndex(micComboItems('', 'Shure SM57', mics), '')).toBe(-1);
  });
});
