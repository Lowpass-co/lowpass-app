'use client';

import { useEffect, useRef } from 'react';

type DateEditorProps = {
  value: string;
  onChange: (v: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
};

export function DateEditor({ value, onChange, onKeyDown }: DateEditorProps) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <input
      ref={ref}
      type="date"
      className="w-full min-w-0 border-0 bg-transparent p-0 text-sm outline-none"
      style={{ color: 'var(--lp-text)' }}
      value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      aria-label="Date cell editor"
    />
  );
}
