'use client';

/* ============================================
   Drawings — the venue's own plans on this map (Nov 2026, Adam)

   The tool panel's section: each drawing with how it was set (scale checked,
   pinned / placed by hand, inside + floor + clear height), show / hide,
   opacity, set up again, remove (with Undo). Adding one: a PDF / JPG from the
   tour's Files (or linked to the venue), or uploaded here into Files ›
   Parking maps. When an earlier map at this venue has drawings, they're
   offered first — a venue is calibrated once.
   ============================================ */

import { useRef, useState } from 'react';
import { Eye, EyeOff, FileUp, Layers, X } from 'lucide-react';
import { CHECK_WARN_PCT, PIN_WARN_PCT, agreement, fmtFloor, scaleFromDimension, type HeadroomWarning } from '@/lib/parking/drawings';
import { fmtMetres } from '@/lib/parking/geo';
import { LIMITS, type ParkingDrawing } from '@/lib/parking/model';
import type { DrawingFile, VenueReuse } from '@/server/parking/maps';

export interface DrawingsPanelProps {
  drawings: ParkingDrawing[];
  canEdit: boolean;
  satellite: { available: boolean; on: boolean };
  /** Drawings that couldn't be opened, by id. */
  errors: ReadonlyMap<string, string>;
  /** Candidate files (null = not loaded yet). */
  files: DrawingFile[] | null;
  reuse: (VenueReuse & { when: string }) | null;
  uploading: boolean;
  warnings: HeadroomWarning[];
  onSatellite: (on: boolean) => void;
  onChange: (next: ParkingDrawing[]) => void;
  onPick: (file: DrawingFile) => void;
  onUpload: (file: File) => void;
  onUseReuse: () => void;
  onSetup: (d: ParkingDrawing) => void;
  onShow: (d: ParkingDrawing) => void;
  onOpenFiles: () => void;
}

function howSet(d: ParkingDrawing): { text: string; warn: boolean } {
  const parts: string[] = [];
  let warn = false;
  if (d.calib) {
    const check = d.calib.check ? scaleFromDimension(d.calib.check.a, d.calib.check.b, d.calib.check.metres) : null;
    const pct = check ? agreement(d.scale, check) : null;
    parts.push(`Scale from ${fmtMetres(d.calib.metres)}${pct != null ? `, checked ${Math.abs(pct).toFixed(1)} %` : ''}`);
    if (pct != null && Math.abs(pct) > CHECK_WARN_PCT) warn = true;
  }
  if (d.pinned) {
    parts.push(d.pinCheck != null ? `pinned · satellite ${Math.abs(d.pinCheck).toFixed(1)} % ${Math.abs(d.pinCheck) > PIN_WARN_PCT ? 'off — may be out of date' : 'agrees'}` : 'pinned');
    if (d.pinCheck != null && Math.abs(d.pinCheck) > PIN_WARN_PCT) warn = true;
  } else parts.push('placed by hand');
  if (d.inside) parts.push(`inside, floor ${fmtFloor(d.floor)}${d.clearHeight != null ? `, ${fmtMetres(d.clearHeight)} clear` : ''}`);
  return { text: parts.join(' · '), warn };
}

export function DrawingsPanel(p: DrawingsPanelProps) {
  const { drawings, canEdit } = p;
  const [choosing, setChoosing] = useState(false);
  const [removed, setRemoved] = useState<{ d: ParkingDrawing; at: number } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const patch = (id: string, q: Partial<ParkingDrawing>) => p.onChange(drawings.map((d) => (d.id === id ? { ...d, ...q } : d)));
  const full = drawings.length >= LIMITS.drawings;

  return (
    <section className="pk-sec" aria-label="Venue drawings">
      <h3>Venue drawings</h3>

      {p.warnings.length ? (
        <div className="pk-warnbox" role="alert">
          <b>Headroom</b>
          <ul>
            {p.warnings.map((w) => (
              <li key={w.text}>{w.text}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {p.satellite.available ? (
        <label className="pk-check">
          <input type="checkbox" checked={p.satellite.on} onChange={(e) => p.onSatellite(e.target.checked)} disabled={!canEdit} />
          Satellite imagery under the drawings
        </label>
      ) : null}

      {p.reuse && !drawings.length && canEdit ? (
        <div className="pk-reuse">
          <span>
            Last time here ({p.reuse.when}): {p.reuse.drawings.map((d) => d.name).join(', ')} — already scaled and placed.
          </span>
          <button type="button" className="adv-btn adv-btn-sm adv-btn-primary" onClick={p.onUseReuse}>
            Use {p.reuse.drawings.length === 1 ? 'it' : 'them'}
          </button>
        </div>
      ) : null}

      {drawings.map((d) => {
        const how = howSet(d);
        const err = p.errors.get(d.id);
        return (
          <div key={d.id} className="pk-drawing" data-hidden={d.hidden || undefined}>
            <div className="adv-row-flex" style={{ gap: 'var(--lp-space-1)' }}>
              <Layers size={13} aria-hidden />
              <b className="adv-grow pk-drawing-name" title={d.name}>{d.name}</b>
              <button type="button" className="pk-iconbtn" aria-label={d.hidden ? `Show ${d.name}` : `Hide ${d.name}`} aria-pressed={!d.hidden} onClick={() => patch(d.id, { hidden: !d.hidden })} disabled={!canEdit}>
                {d.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
              {canEdit ? (
                <button
                  type="button"
                  className="pk-iconbtn"
                  aria-label={`Remove ${d.name}`}
                  onClick={() => {
                    setRemoved({ d, at: drawings.indexOf(d) });
                    p.onChange(drawings.filter((x) => x.id !== d.id));
                  }}
                >
                  <X size={13} />
                </button>
              ) : null}
            </div>
            <span className={`pk-muted${how.warn ? ' pk-warntext' : ''}`}>{err ?? how.text}</span>
            {canEdit ? (
              <>
                <label className="pk-field pk-field-row">
                  Opacity
                  <input type="range" min={0.1} max={1} step={0.05} value={d.opacity} onChange={(e) => patch(d.id, { opacity: Number(e.target.value) })} aria-label={`Opacity of ${d.name}`} />
                </label>
                <label className="pk-check">
                  <input type="checkbox" checked={d.inside} onChange={(e) => patch(d.id, { inside: e.target.checked })} />
                  Inside a building
                </label>
                {d.inside ? (
                  <div className="pk-grid2">
                    <label className="pk-field">
                      Floor (m)
                      <input
                        className="adv-field"
                        type="number"
                        step={0.5}
                        min={LIMITS.floorMin}
                        max={LIMITS.floorMax}
                        value={d.floor}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          if (Number.isFinite(n)) patch(d.id, { floor: Math.max(LIMITS.floorMin, Math.min(LIMITS.floorMax, n)) });
                        }}
                        aria-label={`Floor of ${d.name}, metres from the street`}
                      />
                    </label>
                    <label className="pk-field">
                      Clear height (m)
                      <input
                        className="adv-field"
                        type="number"
                        step={0.1}
                        min={0.5}
                        max={30}
                        value={d.clearHeight ?? ''}
                        placeholder="—"
                        onChange={(e) => {
                          const n = e.target.value === '' ? null : Number(e.target.value);
                          if (n == null || (Number.isFinite(n) && n >= 0.5 && n <= 30)) patch(d.id, { clearHeight: n });
                        }}
                        aria-label={`Clear height inside ${d.name}, metres`}
                      />
                    </label>
                  </div>
                ) : null}
              </>
            ) : null}
            <div className="adv-row-flex" style={{ gap: 'var(--lp-space-2)' }}>
              <button type="button" className="adv-link" onClick={() => p.onShow(d)}>Show</button>
              {canEdit ? (
                <button type="button" className="adv-link" onClick={() => p.onSetup(d)}>Set up again</button>
              ) : null}
            </div>
          </div>
        );
      })}

      {removed ? (
        <div className="pk-reuse" role="status">
          <span>Removed {removed.d.name}.</span>
          <button
            type="button"
            className="adv-btn adv-btn-sm"
            onClick={() => {
              const next = [...drawings];
              next.splice(Math.min(removed.at, next.length), 0, removed.d);
              p.onChange(next);
              setRemoved(null);
            }}
          >
            Undo
          </button>
        </div>
      ) : null}

      {canEdit ? (
        choosing ? (
          <div className="pk-chooser">
            <div className="adv-row-flex">
              <b className="adv-grow">Add a drawing</b>
              <button type="button" className="pk-iconbtn" aria-label="Close" onClick={() => setChoosing(false)}>
                <X size={13} />
              </button>
            </div>
            {p.files == null ? (
              <span className="pk-muted">Looking in Files…</span>
            ) : p.files.length ? (
              <ul className="pk-filelist">
                {p.files.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      className="pk-add"
                      onClick={() => {
                        setChoosing(false);
                        p.onPick(f);
                      }}
                    >
                      <span className="pk-filekind">{f.kind === 'pdf' ? 'PDF' : 'IMG'}</span>
                      <span className="adv-grow pk-drawing-name">{f.name}</span>
                      <span className="pk-dims">{f.from}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="pk-muted">No PDFs or images in this tour’s Files yet.</span>
            )}
            <button type="button" className="adv-btn adv-btn-sm" onClick={() => input.current?.click()} disabled={p.uploading}>
              <FileUp size={13} aria-hidden /> {p.uploading ? 'Uploading…' : 'Upload a PDF or JPG'}
            </button>
            <input
              ref={input}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) {
                  setChoosing(false);
                  p.onUpload(f);
                }
              }}
            />
            <span className="pk-muted">Uploads go to Files › Parking maps.</span>
          </div>
        ) : (
          <button
            type="button"
            className="adv-btn adv-btn-sm"
            disabled={full}
            onClick={() => {
              setChoosing(true);
              p.onOpenFiles();
            }}
          >
            <Layers size={13} aria-hidden /> {full ? `At most ${LIMITS.drawings} drawings` : 'Add a venue drawing'}
          </button>
        )
      ) : null}
      {!drawings.length ? (
        <span className="pk-muted">For car parks the satellite can’t see — trucks inside the building, a basement dock — or to check a venue’s plan against the satellite.</span>
      ) : null}
    </section>
  );
}
