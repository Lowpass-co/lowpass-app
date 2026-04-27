'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export type PositionPickerEntity = {
  id: string;
  label: string;
  colour: string;
  capacity: number;
};

type Occupant = { rowIndex: number; name: string };

type PositionPickerProps = {
  entityId: string | null;
  position: number | null;
  entities: PositionPickerEntity[];
  usedPositions: Record<string, Set<number>>;
  onChange: (entityId: string | null, position: number | null) => void;
  onManageClick: () => void;
  ariaLabel: string;
  /** When set, labels use "Label-position" (sub-snake). When false, same for stage (SB1-7). */
  formatLabel?: (entityLabel: string, pos: number) => string;
  manageLabel: string;
  getOccupant?: (entityId: string, pos: number) => Occupant | null;
};

export default function PositionPicker({
  entityId,
  position,
  entities,
  usedPositions,
  onChange,
  onManageClick,
  ariaLabel,
  formatLabel = (label, pos) => `${label}-${pos}`,
  manageLabel,
  getOccupant,
}: PositionPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const selectedEntity = useMemo(
    () => entities.find((e) => e.id === entityId) ?? null,
    [entities, entityId],
  );

  const triggerLabel = useMemo(() => {
    if (!entityId || position == null || !selectedEntity) {
      return null;
    }
    return formatLabel(selectedEntity.label, position);
  }, [entityId, position, selectedEntity, formatLabel]);

  const usedCountFor = (eid: string) =>
    (usedPositions[eid]?.size ?? 0) + (eid === entityId && position != null ? 1 : 0);

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        className="flex w-full min-w-0 items-center gap-1 rounded border border-lp-border bg-lp-bg px-1.5 py-1 text-left text-xs outline-none focus:border-lp-orange/50"
        onClick={() => setOpen((o) => !o)}
        aria-label={ariaLabel}
      >
        {triggerLabel == null ? (
          <span className="text-lp-text-tertiary">—</span>
        ) : (
          <>
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: selectedEntity?.colour ?? '#737373' }}
            />
            <span className="min-w-0 truncate text-lp-text">{triggerLabel}</span>
          </>
        )}
      </button>
      {open && (
        <div
          className="absolute left-0 z-40 mt-0.5 max-h-[320px] min-w-[14rem] overflow-y-auto rounded-md border border-lp-border bg-lp-surface py-1 shadow-lg"
          role="listbox"
        >
          {entities.map((ent) => {
            const cap = Math.max(1, Math.min(64, ent.capacity));
            const usedN = usedCountFor(ent.id);
            return (
              <div key={ent.id} className="border-b border-lp-border px-2 py-1.5 last:border-b-0">
                <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-lp-text-secondary">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: ent.colour }} />
                  <span className="min-w-0 flex-1 truncate">{ent.label}</span>
                  <span className="shrink-0 tabular-nums text-lp-text-tertiary">
                    {usedN}/{cap} used
                  </span>
                </div>
                <div className="space-y-0.5 pl-3">
                  {Array.from({ length: cap }, (_, i) => i + 1).map((pos) => {
                    const isThisRow = ent.id === entityId && pos === position;
                    const blockedByOther = (usedPositions[ent.id]?.has(pos) ?? false) && !isThisRow;
                    const occ = blockedByOther && getOccupant ? getOccupant(ent.id, pos) : null;
                    const title = occ
                      ? `Used by row #${occ.rowIndex} — ${occ.name}`
                      : undefined;
                    return (
                      <button
                        key={pos}
                        type="button"
                        disabled={blockedByOther}
                        title={title}
                        className={`flex w-full items-center gap-2 rounded px-1.5 py-0.5 text-left text-[11px] ${
                          blockedByOther
                            ? 'cursor-not-allowed opacity-50 text-lp-text-tertiary'
                            : isThisRow
                              ? 'bg-lp-orange/10 text-lp-text'
                              : 'text-lp-text hover:bg-lp-surface-hover'
                        }`}
                        onClick={() => {
                          if (blockedByOther) return;
                          onChange(ent.id, pos);
                          setOpen(false);
                        }}
                      >
                        <span className="w-3 shrink-0 text-center">{isThisRow ? '✓' : '▢'}</span>
                        <span className="font-mono tabular-nums">{formatLabel(ent.label, pos)}</span>
                        <span className="min-w-0 flex-1 truncate text-lp-text-tertiary">
                          {blockedByOther && occ
                            ? `#${occ.rowIndex} ${occ.name}`
                            : isThisRow
                              ? '(this row)'
                              : '(free)'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <div className="border-t border-lp-border px-2 py-1">
            <button
              type="button"
              className="w-full rounded px-1.5 py-1.5 text-left text-[11px] text-lp-text-secondary hover:bg-lp-surface-hover"
              onClick={() => {
                onChange(null, null);
                setOpen(false);
              }}
            >
              — Clear assignment
            </button>
            <button
              type="button"
              className="w-full rounded px-1.5 py-1.5 text-left text-[11px] text-lp-orange hover:bg-lp-surface-hover"
              onClick={() => {
                setOpen(false);
                onManageClick();
              }}
            >
              {manageLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
