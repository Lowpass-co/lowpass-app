'use client';

import { useEffect, useRef } from 'react';

type Opt = { value: string; label: string; color?: string };

type SelectEditorProps = {
  options: Opt[];
  value: string;
  onChange: (v: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
};

export function SelectEditor({ options, value, onChange, onKeyDown }: SelectEditorProps) {
  const ref = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <select
      ref={ref}
      className="w-full min-w-0 border-0 bg-transparent text-sm outline-none"
      style={{ color: 'var(--lp-text)' }}
      value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      aria-label="Select cell editor"
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
