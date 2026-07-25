/* ============================================
   LOWPASS — F-2: Save must not be dead while artists are still loading

   `artists` is a prop that arrives asynchronously. The modal used to snapshot it
   once via a lazy useState initialiser, so opening before the list resolved left
   the picked artist at '' and Save disabled until the user nudged the dropdown.

   This pins the async arrival: mount with artists=[], then rerender with the list,
   and assert Save became enabled WITHOUT any user interaction.
   ============================================ */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TourEditorModal } from './TourEditorModal';
import { ToastProvider } from '@/components/ui/Toast';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ dates: [] }) })));
});

/** The primary CTA — "Next: routing →" on the details tab. All the footer CTAs
 *  share `disabled={!canSave}`, so any of them proves the gate. */
function saveButton(): HTMLButtonElement | null {
  const btns = Array.from(document.querySelectorAll('button'));
  return (btns.find((b) => /next: routing/i.test(b.textContent ?? '')) as HTMLButtonElement) ?? null;
}

describe('TourEditorModal — artist seeding (F-2)', () => {
  it('enables Save once the artists prop arrives, with no user interaction', () => {
    const { rerender } = render(
      <ToastProvider>
        <TourEditorModal open mode="create" onClose={() => {}} artists={[]} />
      </ToastProvider>,
    );

    // A name is required too — type one so the ONLY thing gating Save is the artist.
    const nameInput = document.querySelector('input[type="text"]') as HTMLInputElement | null;
    expect(nameInput).not.toBeNull();
    // React-controlled input: set via the native setter so onChange fires.
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(nameInput, 'Fall Tour');
    nameInput!.dispatchEvent(new Event('input', { bubbles: true }));

    // Artists have NOT arrived yet — Save is legitimately disabled.
    expect(saveButton()?.disabled).toBe(true);

    // The list resolves.
    rerender(
      <ToastProvider>
        <TourEditorModal open mode="create" onClose={() => {}} artists={[{ id: 'a1', name: 'Charlotte Sands' }]} />
      </ToastProvider>,
    );

    // THE ASSERTION: Save must now be live. Before the fix it stayed disabled
    // until the user changed the dropdown.
    expect(saveButton()?.disabled).toBe(false);
    void screen;
  });
});
