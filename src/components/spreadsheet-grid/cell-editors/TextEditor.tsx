'use client';

import { useEffect, useRef } from 'react';

type TextEditorProps = {
  value: string;
  multiline?: boolean;
  onChange: (v: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  autoFocus?: boolean;
};

export function TextEditor({ value, multiline, onChange, onKeyDown, autoFocus = true }: TextEditorProps) {
  const rInput = useRef<HTMLInputElement>(null);
  const rArea = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (autoFocus) (multiline ? rArea : rInput).current?.focus();
  }, [autoFocus, multiline]);
  if (multiline) {
    return (
      <textarea
        ref={rArea}
        className="min-h-8 w-full resize-none border-0 bg-transparent p-0 text-sm outline-none"
        style={{ color: 'var(--lp-text)' }}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        rows={3}
        aria-label="Cell editor"
      />
    );
  }
  return (
    <input
      ref={rInput}
      className="w-full min-w-0 border-0 bg-transparent p-0 text-sm outline-none"
      style={{ color: 'var(--lp-text)' }}
      value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      aria-label="Cell editor"
    />
  );
}
