/* <NumberField>: a number box you can empty while typing (Oct 2026). */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { NumberField, readNumber } from './NumberField';

function Harness({ initial, blank, scale, onValue }: { initial: number; blank?: number | null; scale?: number; onValue?: (n: number) => void }) {
  const [v, setV] = useState(initial);
  return <NumberField aria-label="n" value={v} blank={blank} scale={scale} onValue={(n) => { setV(n); onValue?.(n); }} />;
}

describe('NumberField', () => {
  it('can be emptied while typing; empty means 0', () => {
    const seen = vi.fn();
    render(<Harness initial={1} onValue={seen} />);
    const box = screen.getByLabelText('n') as HTMLInputElement;
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: '' } });
    expect(box.value).toBe('');
    expect(seen).toHaveBeenLastCalledWith(0);
    fireEvent.change(box, { target: { value: '5' } });
    expect(box.value).toBe('5');
    expect(seen).toHaveBeenLastCalledWith(5);
  });

  it('with blank=null an empty box keeps the old value and shows it again on blur', () => {
    const seen = vi.fn();
    render(<Harness initial={7} blank={null} onValue={seen} />);
    const box = screen.getByLabelText('n') as HTMLInputElement;
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: '' } });
    expect(box.value).toBe('');
    expect(seen).not.toHaveBeenCalled();
    fireEvent.blur(box);
    expect(box.value).toBe('7');
  });

  it('shows a fraction as a percentage and reads it back', () => {
    const seen = vi.fn();
    render(<Harness initial={0.15} scale={100} onValue={seen} />);
    const box = screen.getByLabelText('n') as HTMLInputElement;
    expect(box.value).toBe('15');
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: '12.5' } });
    expect(seen).toHaveBeenLastCalledWith(0.125);
  });

  it('typing 0 is a value, not nothing', () => {
    expect(readNumber('0', null, 1)).toBe(0);
    expect(readNumber('abc', 0, 1)).toBeNull();
  });
});
