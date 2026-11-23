/* <GridMenu> — the right-click additions (Nov 2026): disabled items are
   skipped by the arrow keys and can't be picked; hints, danger and group
   hairlines render; the menu stays on screen. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { GridMenu, type MenuConfig } from './GridMenu';

afterEach(cleanup);

const base = (over: Partial<MenuConfig> = {}): MenuConfig => ({
  anchor: { left: 10, bottom: 10 },
  options: [
    { value: 'copy', label: 'Copy', hint: '⌘C' },
    { value: 'paste', label: 'Paste', disabled: true, hint: 'Nothing copied' },
    { value: 'clear', label: 'Clear' },
    { value: 'delete', label: 'Delete row', danger: true, sep: true },
  ],
  onPick: vi.fn(),
  ...over,
});

describe('GridMenu', () => {
  it('a disabled item can’t be picked', () => {
    const cfg = base();
    render(<GridMenu config={cfg} onClose={() => {}} />);
    fireEvent.click(screen.getByText('Paste'));
    expect(cfg.onPick).not.toHaveBeenCalled();
  });

  it('the arrow keys skip disabled items', () => {
    const cfg = base();
    render(<GridMenu config={cfg} onClose={() => {}} />);
    const menu = screen.getByRole('menu');
    act(() => {
      fireEvent.keyDown(menu, { key: 'ArrowDown' }); // Copy → (skip Paste) → Clear
    });
    act(() => {
      fireEvent.keyDown(menu, { key: 'Enter' });
    });
    expect(cfg.onPick).toHaveBeenCalledWith('clear');
  });

  it('starts on the first pickable item', () => {
    const cfg = base({ options: [{ value: 'a', disabled: true }, { value: 'b' }] });
    render(<GridMenu config={cfg} onClose={() => {}} />);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Enter' });
    expect(cfg.onPick).toHaveBeenCalledWith('b');
  });

  it('draws hints, danger, the group line and a title', () => {
    render(<GridMenu config={base({ title: 'Production' })} onClose={() => {}} />);
    const [copy, paste, , del] = screen.getAllByRole('menuitem');
    expect(copy.querySelector('.hint')?.textContent).toBe('⌘C');
    expect(paste.className).toMatch(/\bdis\b/);
    expect(paste.getAttribute('aria-disabled')).toBe('true');
    expect(del.className).toMatch(/\bdanger\b/);
    expect(del.className).toMatch(/\bsep\b/);
    expect(screen.getByText('Production').className).toBe('ttl');
  });

  it('opens at the anchor plus the gap', () => {
    render(<GridMenu config={base({ anchor: { left: 40, bottom: 50 }, gap: 0 })} onClose={() => {}} />);
    const m = screen.getByRole('menu');
    expect(m.style.left).toBe('40px');
    expect(m.style.top).toBe('50px');
  });
});
