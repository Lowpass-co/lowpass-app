'use client';

import { useEffect, useRef } from 'react';

type NumberEditorProps = {
  value: string;
  onChange: (v: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
};

export function NumberEditor({ value, onChange, onKeyDown }: NumberEditorProps) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <input
      ref={ref}
      type="text"
      inputMode="decimal"
      className="w-full min-w-0 border-0 bg-transparent p-0 text-right text-sm outline-none [font-family:var(--lp-font-numeric)] tabular-nums"
      style={{ color: 'var(--lp-text)' }}
      value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      aria-label="Number cell editor"
    />
  );
}
