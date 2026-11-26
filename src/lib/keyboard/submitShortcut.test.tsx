/* ⌘↵ presses the form's OK — and nothing else (Nov 2026, Adam). */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { SubmitShortcut } from '@/components/keyboard/SubmitShortcut';
import { _resetOrangeForTests } from './submitShortcut';

afterEach(() => {
  cleanup();
  _resetOrangeForTests();
});

const cmdEnter = (el: Element, opts: Partial<KeyboardEventInit> = {}) =>
  fireEvent.keyDown(el, { key: 'Enter', metaKey: true, ...opts });

describe('⌘↵', () => {
  it('in a form: submits it through its submit button (validation + onSubmit run)', () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    const { getByLabelText } = render(
      <>
        <SubmitShortcut />
        <form onSubmit={onSubmit}>
          <input aria-label="name" />
          <button type="submit">Save</button>
        </form>
      </>,
    );
    const input = getByLabelText('name');
    input.focus();
    cmdEnter(input);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+↵ works too (Windows / Linux)', () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    const { getByLabelText } = render(
      <>
        <SubmitShortcut />
        <form onSubmit={onSubmit}>
          <textarea aria-label="notes" />
          <button type="submit">OK</button>
        </form>
      </>,
    );
    const t = getByLabelText('notes');
    t.focus();
    cmdEnter(t, { metaKey: false, ctrlKey: true });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('in a dialog: presses the primary button, not Cancel or Delete', () => {
    const save = vi.fn();
    const cancel = vi.fn();
    const del = vi.fn();
    const { getByLabelText } = render(
      <>
        <SubmitShortcut />
        <div role="dialog">
          <input aria-label="role" />
          <button type="button" onClick={del}>Remove</button>
          <button type="button" onClick={cancel}>Cancel</button>
          <button type="button" data-variant="primary" onClick={save}>Done</button>
        </div>
      </>,
    );
    const input = getByLabelText('role');
    input.focus();
    cmdEnter(input);
    expect(save).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  it('data-submit marks the button explicitly', () => {
    const ok = vi.fn();
    const other = vi.fn();
    const { getByLabelText } = render(
      <>
        <SubmitShortcut />
        <section data-submit-scope>
          <input aria-label="flight" />
          <button type="button" data-variant="primary" onClick={other}>Look up</button>
          <button type="button" data-submit onClick={ok}>Save flight</button>
        </section>
      </>,
    );
    const input = getByLabelText('flight');
    input.focus();
    cmdEnter(input);
    expect(ok).toHaveBeenCalledTimes(1);
    expect(other).not.toHaveBeenCalled();
  });

  it('two equally-primary buttons = ambiguous = nothing', () => {
    const a = vi.fn();
    const b = vi.fn();
    const { getByLabelText } = render(
      <>
        <SubmitShortcut />
        <div role="dialog">
          <input aria-label="x" />
          <button type="button" data-variant="primary" onClick={a}>A</button>
          <button type="button" data-variant="primary" onClick={b}>B</button>
        </div>
      </>,
    );
    const input = getByLabelText('x');
    input.focus();
    cmdEnter(input);
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
  });

  it('a disabled OK is not pressed', () => {
    const save = vi.fn();
    const { getByLabelText } = render(
      <>
        <SubmitShortcut />
        <div role="dialog">
          <input aria-label="x" />
          <button type="button" data-variant="primary" disabled onClick={save}>Save</button>
        </div>
      </>,
    );
    const input = getByLabelText('x');
    input.focus();
    cmdEnter(input);
    expect(save).not.toHaveBeenCalled();
  });

  it('outside a form / dialog (a search box) it does nothing — never the page’s orange button', () => {
    const cta = vi.fn();
    const { getByLabelText } = render(
      <>
        <SubmitShortcut />
        <main>
          <input aria-label="Search crew" />
          <button type="button" data-variant="primary" onClick={cta}>+ Add crew</button>
        </main>
      </>,
    );
    const input = getByLabelText('Search crew');
    input.focus();
    cmdEnter(input);
    expect(cta).not.toHaveBeenCalled();
  });

  it('plain Enter and Shift+⌘↵ are left alone', () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    const { getByLabelText } = render(
      <>
        <SubmitShortcut />
        <form onSubmit={onSubmit}>
          <textarea aria-label="t" />
          <button type="submit">OK</button>
        </form>
      </>,
    );
    const t = getByLabelText('t');
    t.focus();
    fireEvent.keyDown(t, { key: 'Enter' });
    cmdEnter(t, { shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('inside a grid the grid keeps the keyboard', () => {
    const save = vi.fn();
    const { getByLabelText } = render(
      <>
        <SubmitShortcut />
        <div role="dialog">
          <div role="grid">
            <input aria-label="cell" />
          </div>
          <button type="button" data-variant="primary" onClick={save}>Done</button>
        </div>
      </>,
    );
    const c = getByLabelText('cell');
    c.focus();
    cmdEnter(c);
    expect(save).not.toHaveBeenCalled();
  });

  it('a typeless Cancel is not a submit button (the attribute decides, not the property)', () => {
    const save = vi.fn();
    const cancel = vi.fn();
    const { getByLabelText } = render(
      <>
        <SubmitShortcut />
        <div role="dialog">
          <input aria-label="x" />
          <button onClick={cancel}>Cancel</button>
          <button data-variant="primary" onClick={save}>Save</button>
        </div>
      </>,
    );
    const input = getByLabelText('x');
    input.focus();
    cmdEnter(input);
    expect(save).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();
  });

  // The orange rung (inline `background: var(--color-lp-orange)`, most of the
  // app's OK buttons) needs computed styles jsdom doesn't resolve; it was
  // checked in Chromium (orange Save pressed, a display:none orange skipped).
});
