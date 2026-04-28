'use client';

type CheckboxEditorProps = {
  checked: boolean;
  onChange: (v: boolean) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
};

export function CheckboxEditor({ checked, onChange, onKeyDown }: CheckboxEditorProps) {
  return (
    <input
      type="checkbox"
      className="h-4 w-4 rounded border"
      style={{ borderColor: 'var(--lp-border)', accentColor: 'var(--lp-orange)' }}
      checked={checked}
      onChange={e => onChange(e.target.checked)}
      onKeyDown={onKeyDown}
      aria-label="Checkbox cell"
    />
  );
}
