/* ============================================
   LOWPASS — <RoutingSettingsMenu> (routing redesign R4b)

   The routing surface's quiet settings popover. Holds the set-once, rarely-touched
   controls that used to occupy a full-width row above the grid — currently the
   primary mode of transit, which feeds the ledger's Transit column drive-time
   maths (bus 0.8× / van 0.9× / bus+trailer 0.85× / car 1× / flight estimate).

   Why it moved (spec §3 + Cowork R4b defect 3): the transit selector is a
   preference, not a per-row action. Sitting full-width above the ledger it read as
   a primary control and pushed the ledger down. The mock keeps only quiet chips in
   the action row — Calendar · Map · Export… — so the selector lives behind this one.
   ============================================ */

'use client';

import { useEffect, useRef, useState } from 'react';
import { Settings2 } from 'lucide-react';
import { StyledSelect } from '@/components/ui/StyledSelect';
import type { PrimaryTransit } from './RoutingMap';

export function RoutingSettingsMenu({
  primaryTransit,
  onPrimaryTransitChange,
}: {
  primaryTransit: PrimaryTransit;
  onPrimaryTransitChange: (value: PrimaryTransit) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      // StyledSelect portals its own list to the body — a click inside it must not
      // close this popover out from under the selection.
      if (wrapRef.current?.contains(target)) return;
      if ((target as HTMLElement).closest?.('[data-lp-dropdown]')) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Routing settings"
        className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[12.5px] transition-colors"
        style={{
          borderColor: open ? 'var(--lp-orange)' : 'var(--lp-border)',
          background: 'transparent',
          color: open ? 'var(--lp-text)' : 'var(--lp-text-secondary)',
        }}
      >
        <Settings2 size={14} />
        Settings
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Routing settings"
          className="absolute right-0 z-30 mt-2 rounded-xl border shadow-xl"
          style={{
            width: 280,
            padding: 'var(--lp-space-3)',
            borderColor: 'var(--lp-border)',
            background: 'var(--lp-surface)',
          }}
        >
          <div
            className="lp-label-caps"
            style={{ fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)', marginBottom: 6 }}
          >
            Primary mode of transit
          </div>
          <StyledSelect<PrimaryTransit>
            value={primaryTransit}
            onChange={onPrimaryTransitChange}
            options={[
              { value: 'bus_van', label: 'Bus (0.8× drive time)' },
              { value: 'van', label: 'Van (0.9× drive time)' },
              { value: 'bus_trailer', label: 'Bus + Trailer (0.85× drive time)' },
              { value: 'car', label: 'Car (Google drive time)' },
              { value: 'flight', label: 'Flight (est. time)' },
            ]}
            placeholder="Select transit"
          />
          <p style={{ marginTop: 8, fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)' }}>
            Sets how the Transit column estimates drive time between days.
          </p>
        </div>
      ) : null}
    </div>
  );
}
