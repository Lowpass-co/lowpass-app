'use client';

import type { GridColumn, GridMode, GridRow } from './types';
import { formatCellValue, isNegativeNumber } from './utils/format';
import { getCellRaw } from './utils/accessor';
import { TextEditor } from './cell-editors/TextEditor';
import { NumberEditor } from './cell-editors/NumberEditor';
import { DateEditor } from './cell-editors/DateEditor';
import { SelectEditor } from './cell-editors/SelectEditor';
import { CheckboxEditor } from './cell-editors/CheckboxEditor';
import { EntityRefEditor } from './cell-editors/EntityRefEditor';
import { EntityChip } from '@/components/entity/EntityChip';
import { cn } from '@/lib/utils';

const pad = (d: 'comfortable' | 'compact' | 'tight') => ({
  padding: `var(--lp-row-cell-padding-y-${d}) var(--lp-row-cell-padding-x)`,
});

type GridCellProps<T> = {
  row: GridRow<T>;
  col: GridColumn<T>;
  colIndex: number;
  density: 'comfortable' | 'compact' | 'tight';
  width: number;
  frozen: boolean;
  left?: number;
  mode: GridMode;
  isActive: boolean;
  isInRange: boolean;
  isEditing: boolean;
  draft: string;
  onDraft: (s: string) => void;
  onEditorKey: (e: React.KeyboardEvent) => void;
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseEnter: () => void;
  readOnly: boolean;
  readOnlyHint?: string;
  error?: string | null;
  bulkHint?: boolean;
  ariaRow: number;
  ariaCol: number;
  entitySearchTourId?: string | null;
};

function EditorBridge<T>(props: {
  col: GridColumn<T>;
  draft: string;
  onDraft: (s: string) => void;
  onKey: (e: React.KeyboardEvent) => void;
  tourId?: string | null;
}) {
  const { col, draft, onDraft, onKey, tourId } = props;
  const t = col.type;
  if (t.kind === 'text') {
    return <TextEditor value={draft} multiline={t.multiline} onChange={onDraft} onKeyDown={onKey} />;
  }
  if (t.kind === 'number' || t.kind === 'currency' || t.kind === 'percent') {
    return <NumberEditor value={draft} onChange={onDraft} onKeyDown={onKey} />;
  }
  if (t.kind === 'date') {
    return <DateEditor value={draft} onChange={onDraft} onKeyDown={onKey} />;
  }
  if (t.kind === 'select') {
    return <SelectEditor options={t.options} value={draft} onChange={onDraft} onKeyDown={onKey} />;
  }
  if (t.kind === 'checkbox') {
    return (
      <CheckboxEditor
        checked={draft === 'true' || draft === '1'}
        onChange={v => onDraft(v ? 'true' : 'false')}
        onKeyDown={onKey}
      />
    );
  }
  if (t.kind === 'entityRef') {
    return (
      <EntityRefEditor
        value={draft}
        onChange={onDraft}
        onKeyDown={onKey}
        entity={t.entity}
        tourId={tourId}
      />
    );
  }
  if (t.kind === 'computed') {
    return <span className="text-sm italic" style={{ color: 'var(--lp-text-tertiary)' }}>—</span>;
  }
  return <TextEditor value={draft} onChange={onDraft} onKeyDown={onKey} />;
}

export function GridCell<T>({
  row,
  col,
  colIndex,
  density,
  width,
  frozen,
  left,
  mode,
  isActive,
  isInRange,
  isEditing,
  draft,
  onDraft,
  onEditorKey,
  onMouseDown,
  onMouseEnter,
  readOnly,
  readOnlyHint,
  error,
  bulkHint,
  ariaRow,
  ariaCol,
  entitySearchTourId,
}: GridCellProps<T>) {
  const raw = getCellRaw(row, col);
  const display = formatCellValue(raw, col.type);
  const numeric = ['number', 'currency', 'percent'].includes(col.type.kind);
  const err = error || null;

  if (readOnly) {
    return (
      <td
        role="gridcell"
        aria-rowindex={ariaRow}
        aria-colindex={ariaCol}
        className="border-b text-sm"
        style={{
          width,
          minWidth: col.minWidth ?? width,
          position: frozen ? 'sticky' : 'relative',
          left: frozen ? left : undefined,
          zIndex: frozen ? 5 : 0,
          background: 'var(--lp-bg-secondary)',
          fontStyle: 'italic',
          color: 'var(--lp-text-secondary)',
          borderColor: 'var(--lp-border-light)',
          borderWidth: 1,
          borderStyle: 'solid',
          ...pad(density),
        }}
        title={readOnlyHint}
      >
        {col.type.kind === 'computed' ? (col.type as { render: (r: unknown) => React.ReactNode }).render(row.data) : display}
        {row.computed && colIndex === 0 && <span className="ml-1 text-[10px]">↗</span>}
      </td>
    );
  }

  const selected = isInRange;
  const focusNavigate = isActive && mode === 'navigate';
  const neg = isNegativeNumber(raw, col.type);

  return (
    <td
      role="gridcell"
      aria-rowindex={ariaRow}
        aria-colindex={ariaCol}
        aria-current={isActive && !isEditing ? 'true' : undefined}
        className={cn('relative border-b text-sm', col.align === 'right' && 'text-right', col.align === 'center' && 'text-center')}
      style={{
        width,
        minWidth: col.minWidth ?? width,
        maxWidth: col.maxWidth,
        position: frozen ? 'sticky' : 'relative',
        left: frozen ? left : undefined,
        zIndex: frozen ? 5 : 0,
        backgroundColor: isEditing ? 'var(--lp-bg)' : selected ? 'color-mix(in srgb, var(--lp-orange) 5.1%, transparent)' : 'transparent',
        boxShadow: focusNavigate
          ? 'inset 0 0 0 2px var(--lp-orange)'
          : err
            ? 'inset 0 0 0 1px var(--color-lp-error)'
            : isEditing
              ? 'inset 0 0 0 1px var(--lp-orange), var(--lp-shadow-xs)'
              : undefined,
        color: neg ? 'var(--color-lp-error)' : 'var(--lp-text)',
        fontFamily: numeric ? 'var(--lp-font-numeric)' : undefined,
        fontVariantNumeric: 'tabular-nums',
        borderColor: 'var(--lp-border-light)',
        borderWidth: 1,
        borderStyle: 'solid',
        ...pad(density),
      }}
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
      title={err ?? (bulkHint && isEditing ? 'Enter applies to whole selection' : undefined)}
    >
      {isEditing ? (
        <div className="relative">
          <EditorBridge
            col={col}
            draft={draft}
            onDraft={onDraft}
            onKey={onEditorKey}
            tourId={entitySearchTourId}
          />
          {bulkHint && (
            <div
              className="absolute right-0 top-full z-10 mt-0.5 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px]"
              style={{ background: 'var(--lp-orange)', color: '#fff' }}
            >
              Apply to selection
            </div>
          )}
        </div>
      ) : col.type.kind === 'entityRef' && String(raw ?? '').length > 0 ? (
        <div className="min-w-0" onClick={e => e.stopPropagation()}>
          <EntityChip kind={col.type.entity} id={String(raw)} variant="compact" />
        </div>
      ) : col.type.kind === 'entityRef' ? (
        <span className="text-sm" style={{ color: 'var(--lp-text-tertiary)' }}>
          —
        </span>
      ) : (
        <span className="block min-w-0 truncate" style={numeric ? { textAlign: col.align === 'right' ? 'right' : 'left' } : undefined}>
          {display}
        </span>
      )}
    </td>
  );
}
