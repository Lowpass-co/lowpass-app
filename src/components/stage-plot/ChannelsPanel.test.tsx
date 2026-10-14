/* LOWPASS — <ChannelsPanel> (Oct 2026): placed status, suggestions, selection. */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChannelsPanel } from './ChannelsPanel';
import type { Channel, EditorItem } from '@/lib/stage-plot/editor-types';

const ch = (id: string, number: number, label: string): Channel => ({ id, number, label, color: '#3B82F6', snakeLabel: null, mic: 'SM58', di: null });
const channels = [ch('c1', 1, 'KICK'), ch('c2', 2, 'VOX SARA'), ch('c3', 3, 'SPARE')];
const items: EditorItem[] = [
  { id: 'kick', iconName: 'mic-kick', xFt: 1, yFt: 1, channelRowIds: ['c1'] },
  { id: 'sara', iconName: 'person-female', xFt: 2, yFt: 2, label: 'Sara' },
];

function setup(o: Partial<React.ComponentProps<typeof ChannelsPanel>> = {}) {
  const props = { channels, items, canCreate: true, onCreate: vi.fn(async () => {}), onApplySuggestions: vi.fn(), onSelectItems: vi.fn(), ...o };
  render(<ChannelsPanel {...props} />);
  return props;
}

describe('ChannelsPanel', () => {
  it('counts what is on the plot and says where each channel sits', () => {
    setup();
    expect(screen.getByText('1 of 3 on the plot')).toBeTruthy();
    expect(screen.getByText(/^on Kick/)).toBeTruthy();
    expect(screen.getAllByText(/not placed/).length).toBe(2);
  });

  it('offers the name match and applies the ticked ones', () => {
    const p = setup();
    expect(screen.getByText('VOX SARA → Sara')).toBeTruthy();
    fireEvent.click(screen.getByText('Link 1 channel'));
    expect(p.onApplySuggestions).toHaveBeenCalledWith([{ channelId: 'c2', itemId: 'sara' }]);
  });

  it('clicking a placed channel selects its item', () => {
    const p = setup();
    fireEvent.click(screen.getByText('KICK'));
    expect(p.onSelectItems).toHaveBeenCalledWith(['kick']);
  });

  it('channels are draggable with the channel payload', () => {
    setup();
    const row = screen.getByText('SPARE').closest('[draggable="true"]')!;
    const setData = vi.fn();
    fireEvent.dragStart(row, { dataTransfer: { setData, effectAllowed: '' } });
    expect(setData).toHaveBeenCalledWith('application/x-lowpass-channel', 'c3');
  });

  it('"Not placed only" hides placed channels', () => {
    setup();
    fireEvent.click(screen.getByLabelText('Not placed only'));
    expect(screen.queryByText('KICK')).toBeNull();
  });

  it('with no list paired it explains instead of showing an empty list', () => {
    setup({ channels: [], canCreate: false });
    expect(screen.getByText(/No channel list is paired/)).toBeTruthy();
  });

  it('a new channel goes through onCreate', async () => {
    const p = setup();
    fireEvent.change(screen.getByPlaceholderText('New channel…'), { target: { value: 'TALKBACK' } });
    fireEvent.click(screen.getByText('Add'));
    expect(p.onCreate).toHaveBeenCalledWith('TALKBACK');
  });
});
