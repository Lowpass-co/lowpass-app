'use client';

/* ============================================
   LOWPASS — Canonical Grid · modals

   Ports the playbox lpConfirm / promptAdd / lpOpenWarn. Portaled to <body>;
   token-clean via grid.css (.lp-grid-modal-ovl / .lp-grid-modal).
   ============================================ */

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export interface ConfirmState {
  title: string;
  body: string;
  confirmLabel?: string;
  onYes: () => void;
}
export interface PromptState {
  title: string;
  placeholder?: string;
  onSubmit: (value: string) => void;
}
export interface WarnState {
  title: string;
  body: string;
  /** name of the source module to "open" (no-op alert in Phase 1). */
  target: string;
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return createPortal(
    <div
      className="lp-grid-modal-ovl"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="lp-grid-modal">{children}</div>
    </div>,
    document.body,
  );
}

export function GridConfirm({ state, onClose }: { state: ConfirmState; onClose: () => void }) {
  return (
    <Overlay onClose={onClose}>
      <h4>{state.title}</h4>
      <p>{state.body}</p>
      <div className="acts">
        <button type="button" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="pri"
          onClick={() => {
            state.onYes();
            onClose();
          }}
        >
          {state.confirmLabel ?? 'Continue'}
        </button>
      </div>
    </Overlay>
  );
}

export function GridPrompt({ state, onClose }: { state: PromptState; onClose: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  const submit = () => {
    const v = inputRef.current?.value.trim() ?? '';
    state.onSubmit(v);
    onClose();
  };
  return (
    <Overlay onClose={onClose}>
      <h4>{state.title}</h4>
      <input
        ref={inputRef}
        type="text"
        placeholder={state.placeholder ?? ''}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        }}
      />
      <div className="acts">
        <button type="button" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="pri" onClick={submit}>
          Add
        </button>
      </div>
    </Overlay>
  );
}

export function GridWarn({ state, onClose }: { state: WarnState; onClose: () => void }) {
  return (
    <Overlay onClose={onClose}>
      <h4>{state.title}</h4>
      <p>{state.body}</p>
      <div className="acts">
        <button type="button" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="pri" onClick={onClose}>
          Open {state.target}
        </button>
      </div>
    </Overlay>
  );
}
