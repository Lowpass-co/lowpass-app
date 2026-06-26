'use client';

/* ============================================
   LOWPASS — <GridSlideOver> (Phase 2)

   Faithful port of the playbox renderLineSlide / renderPersonSlide /
   renderHotelSlide / renderSettleSlide (+ slide CSS / GRID_SPEC §5, §7).
   ONE slide, four variants chosen by the row's section:

     SETTLEMENT  row.daytype === 'Show'        (income Show rows)
     PERSON      section.source === 'Payroll'
     HOTEL       section.source === 'Rooming'
     LINE        everything else (normal / formula / Routing-derived)

   Opened from Grid's openSlide(); all edits write back to the SAME grid
   row object via pushUndo()+render(), so ⌘Z covers them. Menus come from
   Grid's GridMenu (z above the slide); the scan + memo-viewer are local
   modals (portaled, above the slide). Token-clean via grid.css (.lp-gso).
   ============================================ */

/* Mutate-in-place model (same as <Grid>): edits write straight to the
   shared grid row object inside commit() (pushUndo → mutate → render) so ⌘Z
   covers them — a deliberately-imperative component. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Lock, Trash2 } from 'lucide-react';
import type { Doc, GridFx, GridLineApi, GridStatusConfig, Row, Section, Txn } from './types';
import type { MenuConfig } from './GridMenu';
import { STATUSES, demoFx, formulaEst, variance } from './gridModel';
import { ReceiptThumb } from './ReceiptThumb';

const LINKCATS: Record<string, string[]> = {
  Person: ['Dillon Jordan', 'Megan Clark', 'Adam Rowley', 'Ben Quinton'],
  Show: ['Jun 11 — NYC', 'Jun 12 — LA', 'Jun 13 — SF'],
};
const DOCTYPES = ['Receipt', 'Quote', 'Contract', 'Invoice', 'Other'];
const RATEPRESETS = ['Show rate', 'Off / travel rate', 'Per diem', 'Advance', 'Rehearsal', 'Buyout', 'Custom rate'];
const DEALS = ['Flat', 'Plus', 'Versus', 'Door'];

interface Rate {
  label: string;
  amount: number;
}
interface Tier {
  label: string;
  price: number;
  sold: number;
}
interface SExp {
  label: string;
  amount: number;
  kind: 'show' | 'artist';
}
interface Settle {
  tiers: Tier[];
  comps: number;
  charity: number;
  facfee: number;
  tax: number;
  deposit: number;
  cash: number;
  expenses: SExp[];
}

export interface GridSlideOverProps {
  data: Section[];
  si: number;
  ri: number;
  /** bumps on every grid render → re-key the form so uncontrolled inputs
      pick up model changes (incl. ⌘Z), exactly like the playbox rebuild. */
  version: number;
  onClose: () => void;
  pushUndo: () => void;
  render: () => void;
  openMenu: (config: MenuConfig) => void;
  /** Phase 3 injections (default to the demo). */
  fx?: GridFx;
  statuses?: GridStatusConfig;
  /** budget Expenses: always the LINE variant (no person/hotel/settlement). */
  forceLineVariant?: boolean;
  /** persist a slide field edit (item/est/act/status/notes) by the row _uid. */
  onEdit?: (rowUid: string, field: string, value: unknown) => void;
  /** Phase 3 (Steps 3–5) — async transactions/documents CRUD. When provided
      (budget), the slide reads/writes real tables; when absent (/grid-demo) the
      Transactions/Documents sections keep their in-memory demo behaviour. */
  lineApi?: GridLineApi;
}

const rectOf = (e: React.MouseEvent) => {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  return { left: r.left, bottom: r.bottom };
};
const money = (v: unknown) => parseFloat(String(v).replace(/[^0-9.\-]/g, '')) || 0;
let docSeq = 0;
const genDocId = () => `doc-${Date.now().toString(36)}-${docSeq++}`;

export function GridSlideOver({
  data,
  si,
  ri,
  version,
  onClose,
  pushUndo,
  render,
  openMenu,
  fx: fxProp,
  statuses,
  forceLineVariant,
  onEdit,
  lineApi,
}: GridSlideOverProps) {
  const fxC = fxProp ?? demoFx;
  const [open, setOpen] = useState(false);
  const [scan, setScan] = useState(false);
  const [memo, setMemo] = useState<string | null>(null);
  const loadedRef = useRef(false);
  const docFileRef = useRef<HTMLInputElement>(null);

  // Step 3/4 — when a real lineApi is injected, load the line's transactions +
  // documents once on open and seed the row; writes below go through the api.
  useEffect(() => {
    if (loadedRef.current || !lineApi) return;
    const r = data[si]?.rows?.[ri];
    const lineId = r?._uid ? String(r._uid) : '';
    if (!r || !lineId) return;
    loadedRef.current = true;
    let alive = true;
    Promise.all([lineApi.listTransactions(lineId), lineApi.listDocuments(lineId)])
      .then(([txns, docs]) => {
        if (!alive) return;
        r.transactions = txns;
        r.docs = docs;
        render();
      })
      .catch(() => {
        /* leave the sections empty on a load failure */
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineApi, si, ri]);

  const close = useCallback(() => {
    setOpen(false);
    window.setTimeout(onClose, 280);
  }, [onClose]);

  useEffect(() => {
    const id = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Esc closes the slide (self-contained; the grid's handler ignores Esc).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !scan && !memo) {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [close, scan, memo]);

  const sec = data[si];
  const row = sec?.rows?.[ri];
  if (!sec || !row) return null;

  // init relational/detail arrays in place (no undo needed for defaults).
  if (!row.transactions) row.transactions = [];
  if (!row.links) row.links = [];
  if (!row.docs) row.docs = [];
  if (!row.cur) row.cur = 'USD';

  const commit = (fn: () => void) => {
    pushUndo();
    fn();
    render();
  };
  /** persist a slide edit to the backing surface (budget) by row _uid. */
  const fireEdit = (field: string, value: unknown) => {
    if (row?._uid) onEdit?.(String(row._uid), field, value);
  };

  /* ---- shared menus ---- */
  const pickCurrency = (e: React.MouseEvent) =>
    openMenu({
      anchor: rectOf(e),
      options: [...fxC.currencies],
      current: row.cur,
      onPick: (cc) =>
        commit(() => {
          row.cur = cc;
          fireEdit('cur', cc);
        }),
    });
  const pickStatus = (e: React.MouseEvent) =>
    openMenu({
      anchor: rectOf(e),
      options: statuses?.options ?? [...STATUSES],
      optColors: statuses?.colors,
      current: String(row.status),
      onPick: (v) =>
        commit(() => {
          row.status = v;
          fireEdit('status', v);
        }),
    });
  const addLink = (e: React.MouseEvent) => {
    const anchor = rectOf(e);
    openMenu({
      anchor,
      options: Object.keys(LINKCATS),
      onPick: (type) =>
        openMenu({
          anchor,
          options: LINKCATS[type],
          onPick: (name) => commit(() => row.links!.push({ type, name })),
        }),
    });
  };

  /* ---- shared blocks ---- */
  const dispCur = fxC.displayCurrency.toUpperCase();
  const cv = (row.cur || dispCur).toUpperCase() !== dispCur;
  const s = fxC.symbol(row.cur || dispCur);

  const Header = () => (
    <div className="so-head">
      <div className="so-bc">
        <span className="dot" style={{ color: sec.accent }} />
        {sec.name}
        {sec.source ? (
          <span
            className="badge src"
            onClick={() => {
              /* would open {sec.source} — wired in a later phase */
            }}
          >
            🔗 {sec.source}
            <span className="openword"> → open</span>
          </span>
        ) : null}
      </div>
      <button type="button" className="so-close" aria-label="Close" onClick={close}>
        ✕
      </button>
    </div>
  );

  const Title = (placeholder: string) => (
    <input
      className="so-title"
      placeholder={placeholder}
      defaultValue={String(row.item ?? '')}
      onBlur={(e) => {
        if (e.target.value !== row.item)
          commit(() => {
            row.item = e.target.value;
            fireEdit('item', e.target.value);
          });
      }}
    />
  );

  // Derived sections lock BOTH est + act (decision 2); formula sections lock
  // the estimate. Any derived kind locks (budget: Rooming/Payroll/Travel/Gear).
  const estLocked = sec.kind === 'formula' || sec.kind === 'derived';
  const actLocked = sec.kind === 'derived';

  const MoneyBlock = () => {
    const estV = sec.kind === 'formula' ? formulaEst(row, data) : Number(row.est) || 0;
    const v = variance(row, estV);
    // C1 — inputs hold the SOURCE figure in row.cur (same number the grid cell
    // shows); the display-currency conversion is a red ≈ note BENEATH, never
    // replacing the typed value.
    const fxBelow = (srcVal: number) =>
      cv ? (
        <div className="fxnote" style={{ marginTop: 4 }}>
          ≈ {fxC.formatDisplay(fxC.toDisplay(srcVal, row.cur || dispCur))} in {dispCur}
        </div>
      ) : null;
    const lockedMoney = (val: number) => (
      <div className="so-ro" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span>
          {s}
          {Number(val).toLocaleString()}
        </span>
        <Lock size={12} strokeWidth={2.25} color="var(--lp-text-tertiary)" aria-label="locked" />
      </div>
    );
    return (
      <>
        <div className="so-2col">
          <div className="so-field">
            <label>Estimate</label>
            {estLocked ? (
              lockedMoney(estV)
            ) : (
              <div className="moneyin">
                <span className="cursym">{s}</span>
                <input
                  defaultValue={Number(row.est) || 0}
                  onBlur={(e) =>
                    commit(() => {
                      row.est = money(e.target.value);
                      fireEdit('est', row.est);
                    })
                  }
                />
              </div>
            )}
            {fxBelow(estV)}
          </div>
          <div className="so-field">
            <label>Actual</label>
            {actLocked ? (
              lockedMoney(Number(row.act) || 0)
            ) : (
              <div className="moneyin">
                <span className="cursym">{s}</span>
                <input
                  defaultValue={Number(row.act) || 0}
                  onBlur={(e) =>
                    commit(() => {
                      row.act = money(e.target.value);
                      // Manual actual = override (mirrors the server) so a later
                      // txn edit won't auto-sync over it this session (BUD-47).
                      row._actualOverride = true;
                      fireEdit('act', row.act);
                    })
                  }
                />
              </div>
            )}
            {fxBelow(Number(row.act) || 0)}
          </div>
        </div>
        <div className="so-stat">
          Variance{' '}
          <b style={{ color: v ? (v.d > 0 ? 'var(--color-lp-error)' : 'var(--color-lp-success)') : 'var(--lp-text-tertiary)' }}>
            {v ? (v.d > 0 ? '+' : '') + v.pct.toFixed(1) + '%' : '—'}
          </b>
        </div>
      </>
    );
  };

  const CurBlock = () => (
    <div className="so-field">
      <label>Currency</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
        <span className="pill" style={{ cursor: 'pointer' }} onClick={pickCurrency}>
          {row.cur || dispCur} ({s})
        </span>
        {cv ? <span className="fxnote">⚠ shown converted to {dispCur}</span> : null}
      </div>
    </div>
  );

  const StatusBlock = () => (
    <div className="so-field">
      <label>Status</label>
      <div>
        <span className={`pill ${row.status}`} style={{ cursor: 'pointer' }} onClick={pickStatus}>
          {String(row.status ?? '')}
        </span>
      </div>
    </div>
  );

  const LinksBlock = () => (
    <div>
      <div className="so-sec-h">
        <h5>Linked to</h5>
      </div>
      <div>
        {!row.links || row.links.length === 0 ? (
          <span className="so-empty">Nothing linked yet.</span>
        ) : (
          row.links.map((l, i) => (
            <span key={i} className="badge src" style={{ cursor: 'default', marginRight: 6 }}>
              {l.type}: {l.name}{' '}
              <span className="linkx" onClick={() => commit(() => row.links!.splice(i, 1))}>
                ✕
              </span>
            </span>
          ))
        )}
      </div>
      <button type="button" className="so-add" style={{ marginTop: 8 }} onClick={addLink}>
        🔗 Link to a person or show…
      </button>
    </div>
  );

  const attachReceipt = (e: React.MouseEvent, t: Txn) => {
    // Receipts overhaul B1 — prefer the real Add-Receipt panel (drop → upload →
    // scan → confirm) over the blank-pill mint. Resolves with the saved receipt;
    // the amount it confirmed has already been PATCHed onto this transaction.
    if (lineApi?.onAddReceipt && row._uid && t.id) {
      void lineApi
        .onAddReceipt({ lineId: String(row._uid), txnId: t.id })
        .then((res) => {
          if (!res) return; // cancelled
          commit(() => {
            t.receipt = res.receiptId;
            t.receiptLabel = res.label;
            if (res.amount) t.amount = res.amount;
            syncActualFromTxns();
          });
        })
        .catch(() => {});
      return;
    }
    // Legacy/fallback: create a blank numbered expense_receipts row + link it.
    if (lineApi && row._uid && t.id) {
      void lineApi
        .attachReceipt(String(row._uid), t.id)
        .then(({ receiptId, label }) =>
          commit(() => {
            t.receipt = receiptId;
            t.receiptLabel = label;
          }),
        )
        .catch(() => {
          /* ignore — the chip stays "attach receipt" */
        });
      return;
    }
    const names = (row.docs ?? []).map((d) => d.name);
    openMenu({
      anchor: rectOf(e),
      options: [...names, '＋ Upload new receipt'],
      onPick: (choice) =>
        commit(() => {
          // C4 (demo) — store the linked document's id (not a name copy), so
          // renaming the document later updates the txn's receipt label too.
          if (choice === '＋ Upload new receipt') {
            const doc: Doc = { id: genDocId(), type: 'Receipt', name: `receipt-${(row.docs?.length ?? 0) + 1}.pdf` };
            row.docs!.push(doc);
            t.receipt = doc.id!;
          } else {
            const d = row.docs!.find((x) => x.name === choice);
            t.receipt = d?.id ?? choice;
          }
        }),
    });
  };

  /** A transaction's receipt label — real receipts carry their own label
   *  (expense_receipts number/vendor); demo links to a row.doc by id (C4). */
  const receiptLabel = (t: Txn): string => {
    if (t.receiptLabel) return t.receiptLabel;
    const d = row.docs?.find((x) => x.id && x.id === t.receipt);
    return d ? d.name : String(t.receipt);
  };

  // BUD-47 — keep the line's Actual (slide + grid cell) in step with the
  // transactions sum WITHOUT a reload, mirroring the server's
  // syncActualCostIfNoOverride: only when auto-synced (real surface, not a
  // derived/locked line, no manual override) and ≥1 txn remains (the server
  // preserves actual_cost when the last txn is removed). Pure display update —
  // no PATCH (the server already synced actual_cost).
  const syncActualFromTxns = () => {
    if (!lineApi || actLocked || row._actualOverride) return;
    const txns = row.transactions ?? [];
    if (txns.length === 0) return;
    row.act = txns.reduce((a, t) => a + (Number(t.amount) || 0), 0);
  };

  // Add a transaction: real surface creates the row first (needs its id);
  // demo pushes an empty in-memory txn.
  const addTxn = () => {
    if (lineApi && row._uid) {
      void lineApi
        .addTransaction(String(row._uid))
        .then((t) =>
          commit(() => {
            row.transactions!.push(t);
            syncActualFromTxns();
          }),
        )
        .catch(() => {});
    } else {
      commit(() => row.transactions!.push({ date: '', desc: '', amount: 0, receipt: null }));
    }
  };
  const patchTxn = (t: Txn, patch: { desc?: string; date?: string; amount?: number }) => {
    if (lineApi && t.id) void lineApi.patchTransaction(t.id, patch).catch(() => {});
  };
  const deleteTxn = (t: Txn, i: number) => {
    if (lineApi && t.id) {
      void lineApi
        .deleteTransaction(t.id)
        .then(() =>
          commit(() => {
            row.transactions!.splice(i, 1);
            syncActualFromTxns();
          }),
        )
        .catch(() => {});
    } else {
      commit(() => row.transactions!.splice(i, 1));
    }
  };

  const TxnsBlock = () => (
    <div>
      <div className="so-sec-h">
        <h5>Transactions</h5>
        <button type="button" className="so-add" onClick={addTxn}>
          ＋ Add transaction
        </button>
      </div>
      <div>
        {!row.transactions || row.transactions.length === 0 ? (
          <div className="so-empty">No transactions yet.</div>
        ) : (
          row.transactions.map((t, i) => (
            <div key={t.id ?? i} className="txn">
              <input
                defaultValue={t.desc}
                placeholder="Transaction name"
                onBlur={(e) => {
                  if (e.target.value === t.desc) return;
                  commit(() => (t.desc = e.target.value));
                  patchTxn(t, { desc: e.target.value });
                }}
              />
              <input
                type="date"
                defaultValue={t.date}
                onBlur={(e) => {
                  if (e.target.value === t.date) return;
                  commit(() => (t.date = e.target.value));
                  patchTxn(t, { date: e.target.value });
                }}
              />
              <div className="cellin">
                <span className="pre">{s}</span>
                <input
                  className="amt"
                  defaultValue={t.amount || 0}
                  onBlur={(e) => {
                    const v = money(e.target.value);
                    if (v === t.amount) return;
                    commit(() => {
                      t.amount = v;
                      syncActualFromTxns();
                    });
                    patchTxn(t, { amount: v });
                  }}
                />
              </div>
              <button
                type="button"
                className="txn-del"
                title="Delete transaction"
                aria-label="Delete transaction"
                onClick={() => deleteTxn(t, i)}
              >
                <Trash2 size={14} strokeWidth={2} />
              </button>
              <div className="txn-receipt">
                {t.receipt ? (
                  lineApi?.signReceiptUrl ? (
                    <ReceiptThumb receiptId={String(t.receipt)} label={receiptLabel(t)} signUrl={lineApi.signReceiptUrl} />
                  ) : (
                    <span className="rcpt has">📎 {receiptLabel(t)}</span>
                  )
                ) : (
                  <span className="rcpt none" onClick={(e) => attachReceipt(e, t)}>
                    ＋ attach receipt
                  </span>
                )}
                <button
                  type="button"
                  className="so-add"
                  style={{ marginLeft: 'auto', padding: '3px 8px' }}
                  onClick={addLink}
                >
                  🔗 Link
                </button>
              </div>
            </div>
          ))
        )}
        {/* Prominent bottom add — where a user expects to add another row
            (the header "＋ Add transaction" is easy to miss). Same addTxn path. */}
        <button
          type="button"
          onClick={addTxn}
          className="btn-transition"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            width: '100%',
            marginTop: 'var(--lp-space-2)',
            padding: 'var(--lp-space-2)',
            borderRadius: 'var(--lp-radius-md)',
            border: '1px dashed var(--lp-border-strong)',
            background: 'transparent',
            color: 'var(--lp-text-secondary)',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          ＋ Add transaction
        </button>
      </div>
    </div>
  );

  // Demo: a type-picker that pushes a placeholder doc. Real: open the OS file
  // picker (handled by the hidden input below) → upload → push the attachment.
  const addDoc = (e: React.MouseEvent) => {
    if (lineApi) {
      docFileRef.current?.click();
      return;
    }
    openMenu({
      anchor: rectOf(e),
      options: DOCTYPES,
      onPick: (tp) => commit(() => row.docs!.push({ id: genDocId(), type: tp, name: `${tp.toLowerCase()}.pdf` })),
    });
  };
  const onDocFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f || !lineApi || !row._uid) return;
    void lineApi
      .addDocument(String(row._uid), f)
      .then((d) => commit(() => row.docs!.push(d)))
      .catch(() => {});
  };
  const renameDoc = (d: Doc, name: string) => {
    if (lineApi && d.id && row._uid) void lineApi.renameDocument(String(row._uid), d.id, name).catch(() => {});
  };
  const deleteDoc = (d: Doc, i: number) => {
    if (lineApi && d.id && row._uid) {
      void lineApi
        .deleteDocument(String(row._uid), d.id)
        .then(() => commit(() => row.docs!.splice(i, 1)))
        .catch(() => {});
    } else {
      commit(() => row.docs!.splice(i, 1));
    }
  };

  // Receipts overhaul B1 — line-level scan: open the Add-Receipt panel (no txn);
  // the panel adds a transaction for the amount, so refresh the txn list after.
  const scanReceiptForLine = () => {
    if (!lineApi?.onAddReceipt || !row._uid) return;
    void lineApi
      .onAddReceipt({ lineId: String(row._uid) })
      .then(async (res) => {
        if (!res) return;
        const txns = await lineApi.listTransactions(String(row._uid)).catch(() => null);
        if (txns) commit(() => { row.transactions = txns; syncActualFromTxns(); });
      })
      .catch(() => {});
  };

  const DocsBlock = () => (
    <div>
      <div className="so-sec-h">
        <h5>Documents</h5>
        <div style={{ display: 'inline-flex', gap: 6 }}>
          {lineApi?.onAddReceipt ? (
            <button type="button" className="so-add" onClick={scanReceiptForLine}>
              📷 Scan receipt
            </button>
          ) : null}
          <button type="button" className="so-add" onClick={addDoc}>
            ＋ Add
          </button>
        </div>
      </div>
      <input
        ref={docFileRef}
        type="file"
        style={{ display: 'none' }}
        onChange={onDocFile}
        aria-hidden
      />
      <div>
        {!row.docs || row.docs.length === 0 ? (
          <div className="so-empty">No quotes, contracts or receipts on this line.</div>
        ) : (
          row.docs.map((d: Doc, i: number) => (
            <div key={d.id ?? i} className="docrow">
              <span className="doctype">{d.type}</span>
              <input
                className="docname"
                defaultValue={d.name}
                autoFocus={
                  !lineApi &&
                  i === (row.docs?.length ?? 0) - 1 &&
                  d.name.endsWith('.pdf') &&
                  d.name.startsWith(d.type.toLowerCase())
                }
                onBlur={(e) => {
                  if (e.target.value === d.name) return;
                  commit(() => (d.name = e.target.value));
                  renameDoc(d, e.target.value);
                }}
              />
              <span className="docx" onClick={() => deleteDoc(d, i)}>
                ✕
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );

  const NotesBlock = (placeholder = 'Add notes…') => (
    <div className="so-field">
      <label>Notes</label>
      <textarea
        rows={3}
        placeholder={placeholder}
        defaultValue={String(row.notes ?? '')}
        onBlur={(e) =>
          commit(() => {
            row.notes = e.target.value;
            fireEdit('notes', e.target.value);
          })
        }
      />
    </div>
  );

  /* ---- variant bodies ---- */
  const LineBody = () => (
    <div className="so-body" key={version}>
      {Title('Untitled line')}
      {MoneyBlock()}
      {CurBlock()}
      <div className="so-field">
        <label>Vendor</label>
        <input defaultValue={String(row.vendor ?? '')} onBlur={(e) => commit(() => (row.vendor = e.target.value))} />
      </div>
      {StatusBlock()}
      {LinksBlock()}
      {TxnsBlock()}
      {DocsBlock()}
      {NotesBlock()}
    </div>
  );

  const PersonBody = () => {
    if (!row.rates)
      row.rates = [
        { label: 'Show rate', amount: 0 },
        { label: 'Off / travel rate', amount: 0 },
        { label: 'Per diem', amount: 0 },
        { label: 'Advance', amount: 0 },
      ] as unknown as Row['rates'];
    const rates = row.rates as unknown as Rate[];
    return (
      <div className="so-body" key={version}>
        {Title('Name')}
        <div className="so-note">
          Employment + pay for this person. UK crew on a USD tour? Set their currency below.{' '}
          <button type="button" className="so-link">
            Open in Personnel ↗
          </button>
        </div>
        {MoneyBlock()}
        {CurBlock()}
        <div>
          <div className="so-sec-h">
            <h5>Rate card</h5>
            <button
              type="button"
              className="so-add"
              onClick={(e) =>
                openMenu({
                  anchor: rectOf(e),
                  options: RATEPRESETS,
                  onPick: (t) => commit(() => rates.push({ label: t === 'Custom rate' ? 'New rate' : t, amount: 0 })),
                })
              }
            >
              ＋ Add rate
            </button>
          </div>
          <div>
            {rates.map((r, i) => (
              <div key={i} className="docrow rate">
                <input className="ratelabel" defaultValue={r.label} onBlur={(e) => commit(() => (r.label = e.target.value))} />
                <div className="cellin">
                  <span className="pre">{s}</span>
                  <input
                    className="rateamt"
                    defaultValue={r.amount || 0}
                    onBlur={(e) => commit(() => (r.amount = money(e.target.value)))}
                  />
                </div>
                <span className="docx" onClick={() => commit(() => rates.splice(i, 1))}>
                  ✕
                </span>
              </div>
            ))}
          </div>
        </div>
        {StatusBlock()}
        {LinksBlock()}
        {TxnsBlock()}
        {DocsBlock()}
      </div>
    );
  };

  const HotelBody = () => {
    if (!row.hotel) row.hotel = { conf: '', contact: '', nights: 0 } as unknown as Row['hotel'];
    const hotel = row.hotel as unknown as { conf: string; contact: string; nights: number };
    return (
      <div className="so-body" key={version}>
        {Title('Hotel')}
        {MoneyBlock()}
        {CurBlock()}
        <div className="so-note">
          Hotel detail for this stay.{' '}
          <button type="button" className="so-link">
            Open in Rooming ↗
          </button>{' '}
          ·{' '}
          <button type="button" className="so-link">
            Link to Advance
          </button>
        </div>
        <div className="so-2col">
          <div className="so-field">
            <label>Confirmation #</label>
            <input defaultValue={hotel.conf} onBlur={(e) => commit(() => (hotel.conf = e.target.value))} />
          </div>
          <div className="so-field">
            <label>Nights</label>
            <input
              defaultValue={hotel.nights}
              onBlur={(e) => commit(() => (hotel.nights = money(e.target.value)))}
            />
          </div>
        </div>
        <div className="so-field">
          <label>Hotel contact</label>
          <input
            placeholder="Name / phone / email"
            defaultValue={hotel.contact}
            onBlur={(e) => commit(() => (hotel.contact = e.target.value))}
          />
        </div>
        {StatusBlock()}
        {LinksBlock()}
        {TxnsBlock()}
        {DocsBlock()}
        {NotesBlock('Hotel notes from advance…')}
      </div>
    );
  };

  const SettleBody = () => {
    if (!row.settle)
      row.settle = {
        tiers: [
          { label: 'Advance', price: 35, sold: 1000 },
          { label: 'Door', price: 40, sold: 120 },
        ],
        comps: 40,
        charity: 0,
        facfee: 0,
        tax: 0,
        deposit: 0,
        cash: 0,
        expenses: [
          { label: 'Production', amount: 0, kind: 'show' },
          { label: 'Catering / hospitality', amount: 0, kind: 'show' },
          { label: 'Tour bus (artist)', amount: 0, kind: 'artist' },
        ],
      } as unknown as Row['settle'];
    const st = row.settle as unknown as Settle;
    const f = (n: number) => '£' + Math.round(n || 0).toLocaleString('en-US');
    const tixSold = st.tiers.reduce((a, t) => a + (t.sold || 0), 0);
    const gross = st.tiers.reduce((a, t) => a + (t.price || 0) * (t.sold || 0), 0);
    const net = (gross - ((st.charity || 0) + (st.facfee || 0)) * tixSold) * (1 - (st.tax || 0) / 100);
    const showExp = st.expenses.filter((e) => e.kind !== 'artist').reduce((a, e) => a + (e.amount || 0), 0);
    const artistExp = st.expenses.filter((e) => e.kind === 'artist').reduce((a, e) => a + (e.amount || 0), 0);
    const G = Number(row.est) || 0;
    const sp = (Number(row.split) || 0) / 100;
    const deal = String(row.deal || 'Flat');
    let walk = G;
    let how = 'Guarantee';
    if (deal === 'Plus') {
      walk = G + sp * Math.max(0, net - showExp - G);
      how = `Gtee + ${row.split || 0}% of overage`;
    } else if (deal === 'Versus') {
      walk = Math.max(G, sp * net);
      how = `Greater of gtee or ${row.split || 0}% of net`;
    } else if (deal === 'Door') {
      walk = sp * net;
      how = `${row.split || 0}% of net`;
    }
    const wh = Number(row.wh) || 0;
    const postWalk = walk * (1 - wh / 100);
    const balance = postWalk - (st.deposit || 0) - (st.cash || 0) - artistExp;
    const mny = (v: number, onB: (n: number) => void) => (
      <div className="moneyin">
        <span className="cursym">£</span>
        <input defaultValue={v || 0} onBlur={(e) => commit(() => onB(money(e.target.value)))} />
      </div>
    );
    const pctf = (v: number, onB: (n: number) => void) => (
      <div className="pctfield">
        <input defaultValue={v || 0} onBlur={(e) => commit(() => onB(money(e.target.value)))} />
        <span className="suf">%</span>
      </div>
    );
    const pickDeal = (e: React.MouseEvent) =>
      openMenu({
        anchor: rectOf(e),
        options: DEALS,
        current: deal,
        onPick: (v) =>
          commit(() => {
            row.deal = v;
            if (v === 'Flat') row.split = 0;
            else if (!row.split) row.split = 80;
          }),
      });
    return (
      <div className="so-body" key={version}>
        {Title('Show')}
        <div className="so-note">
          {String(row.city || '')} · {String(row.idate || '')} · cap {String(row.cap || '—')} ·{' '}
          <button type="button" className="so-link" onClick={() => setScan(true)}>
            ⬆ Upload &amp; scan deal memo
          </button>
        </div>
        <div className="so-2col">
          <div className="so-field">
            <label>Deal</label>
            <div>
              <span className="pill" style={{ cursor: 'pointer' }} onClick={pickDeal}>
                {deal}
                {deal !== 'Flat' ? ' ' + (row.split || 0) + '%' : ''}
              </span>
            </div>
          </div>
          <div className="so-field">
            <label>Guarantee</label>
            {mny(G, (n) => (row.est = n))}
          </div>
        </div>

        <div className="so-sec-h">
          <h5>Ticket tiers</h5>
          <button
            type="button"
            className="so-add"
            onClick={() => commit(() => st.tiers.push({ label: 'New tier', price: 0, sold: 0 }))}
          >
            ＋ Tier
          </button>
        </div>
        <div className="st-tier h">
          <div>Tier</div>
          <div>£ Price</div>
          <div>Sold</div>
        </div>
        {st.tiers.map((t, i) => (
          <div key={i} className="st-tier">
            <input defaultValue={t.label} placeholder="Tier" onBlur={(e) => commit(() => (t.label = e.target.value))} />
            <div className="cellin">
              <span className="pre">£</span>
              <input defaultValue={t.price || 0} onBlur={(e) => commit(() => (t.price = money(e.target.value)))} />
            </div>
            <input
              className="amt"
              defaultValue={t.sold || 0}
              style={{ textAlign: 'right' }}
              onBlur={(e) => commit(() => (t.sold = money(e.target.value)))}
            />
          </div>
        ))}

        <div className="so-2col">
          <div className="so-field">
            <label>Comps (free)</label>
            <input
              defaultValue={st.comps || 0}
              style={{ textAlign: 'right' }}
              onBlur={(e) => commit(() => (st.comps = money(e.target.value)))}
            />
          </div>
          <div className="so-field">
            <label>Charity / ticket</label>
            {mny(st.charity, (n) => (st.charity = n))}
          </div>
          <div className="so-field">
            <label>Facility fee / ticket</label>
            {mny(st.facfee, (n) => (st.facfee = n))}
          </div>
          <div className="so-field">
            <label>Tax</label>
            {pctf(st.tax, (n) => (st.tax = n))}
          </div>
          <div className="so-field">
            <label>Withholding</label>
            {pctf(wh, (n) => (row.wh = n))}
          </div>
          <div className="so-field">
            <label>Deposit paid</label>
            {mny(st.deposit, (n) => (st.deposit = n))}
          </div>
        </div>

        <div className="so-sec-h">
          <h5>Show expenses &amp; deductions</h5>
          <button
            type="button"
            className="so-add"
            onClick={() => commit(() => st.expenses.push({ label: 'New expense', amount: 0, kind: 'show' }))}
          >
            ＋ Line
          </button>
        </div>
        <div className="so-empty" style={{ padding: '0 2px 6px' }}>
          Show costs sit inside the deal; artist costs are deducted from the balance.
        </div>
        <div className="st-tier exp h">
          <div>Expense</div>
          <div>Type</div>
          <div>£ Amount</div>
          <div />
        </div>
        {st.expenses.length === 0 ? (
          <div className="so-empty">No expenses added.</div>
        ) : (
          st.expenses.map((ex, i) => (
            <div key={i} className="st-tier exp">
              <input
                defaultValue={ex.label}
                placeholder="e.g. extra production, hospitality"
                onBlur={(e) => commit(() => (ex.label = e.target.value))}
              />
              <span
                className={`costkind ${ex.kind === 'artist' ? 'artist' : 'show'}`}
                onClick={() => commit(() => (ex.kind = ex.kind === 'artist' ? 'show' : 'artist'))}
              >
                {ex.kind === 'artist' ? 'Artist' : 'Show'}
              </span>
              <div className="cellin">
                <span className="pre">£</span>
                <input defaultValue={ex.amount || 0} onBlur={(e) => commit(() => (ex.amount = money(e.target.value)))} />
              </div>
              <span className="docx" onClick={() => commit(() => st.expenses.splice(i, 1))}>
                ✕
              </span>
            </div>
          ))
        )}

        <div className="settle-out">
          <div>
            <span>
              Gross box office ({tixSold} sold · {st.comps || 0} comps)
            </span>
            <b>{f(gross)}</b>
          </div>
          <div>
            <span>Net box office</span>
            <b>{f(net)}</b>
          </div>
          <div>
            <span>Show expenses (in deal)</span>
            <b>{f(showExp)}</b>
          </div>
          <div>
            <span>Deal · {how}</span>
            <b>{f(walk)}</b>
          </div>
          <div>
            <span>After {wh}% withholding</span>
            <b>{f(postWalk)}</b>
          </div>
          {artistExp ? (
            <div>
              <span>Less artist costs</span>
              <b>−{f(artistExp)}</b>
            </div>
          ) : null}
          <div className="bal">
            <span>Balance due</span>
            <b>{f(balance)}</b>
          </div>
        </div>

        <div>
          <div className="so-sec-h">
            <h5>Deal memo</h5>
          </div>
          <div>
            {(row.memos ?? []).length === 0 ? (
              <div className="so-empty">No deal memo attached.</div>
            ) : (
              (row.memos ?? []).map((m, i) => (
                <div key={i} className="docrow">
                  <span className="doctype">Memo</span>
                  <span style={{ flex: 1, cursor: 'pointer' }} onClick={() => setMemo(m)}>
                    {m}
                  </span>
                  <span style={{ color: 'var(--lp-text-tertiary)', fontSize: 'var(--lp-text-2xs)' }}>view ↗</span>
                </div>
              ))
            )}
          </div>
          <button
            type="button"
            className="so-add"
            style={{ marginTop: 8 }}
            onClick={() =>
              commit(() => {
                if (!row.memos) row.memos = [];
                row.memos.push(`deal-memo-${row.memos.length + 1}.pdf`);
              })
            }
          >
            ＋ Add memo
          </button>
        </div>
      </div>
    );
  };

  const body = forceLineVariant
    ? LineBody()
    : row.daytype === 'Show'
      ? SettleBody()
      : sec.source === 'Payroll'
        ? PersonBody()
        : sec.source === 'Rooming'
          ? HotelBody()
          : LineBody();

  return createPortal(
    <>
      <div className={`lp-gso-ovl${open ? ' open' : ''}`} onClick={close} />
      <aside className={`lp-gso${open ? ' open' : ''}`} role="dialog" aria-modal="true">
        {Header()}
        {body}
      </aside>

      {scan ? <ScanModal onDone={() => {
        setScan(false);
        commit(() => {
          row.deal = 'Versus';
          row.split = 85;
          row.cap = (row.cap as number) || 1500;
          row.est = (Number(row.est) || 0) || 18000;
          if (!row.memos) row.memos = [];
          if (!row.memos.length) row.memos.push('deal-memo.pdf');
        });
      }} /> : null}
      {memo ? <MemoViewer name={memo} row={row} onClose={() => setMemo(null)} /> : null}
    </>,
    document.body,
  );
}

/* ---- scan + memo-viewer modals ---- */
function ScanModal({ onDone }: { onDone: () => void }) {
  const steps = ['Reading document', 'Extracting deal type & %', 'Reading guarantee + capacity', 'Pulling clauses & notes'];
  const [step, setStep] = useState(0);
  useEffect(() => {
    let i = 0;
    const iv = window.setInterval(() => {
      i++;
      if (i < steps.length) setStep(i);
    }, 420);
    const done = window.setTimeout(onDone, 1900);
    return () => {
      window.clearInterval(iv);
      window.clearTimeout(done);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="lp-gso-modal-ovl">
      <div className="lp-gso-modal">
        <div className="lp-gso-scanner" />
        <h4>Scanning deal memo…</h4>
        <p className="lp-gso-scanstep">{steps[step]}</p>
      </div>
    </div>
  );
}

function MemoViewer({ name, row, onClose }: { name: string; row: Row; onClose: () => void }) {
  return (
    <div className="lp-gso-modal-ovl" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="lp-gso-memviewer">
        <div className="mv-doc">
          <div>
            📄
            <div style={{ fontSize: 'var(--lp-text-xs)', marginTop: 10, color: 'var(--lp-text-tertiary)' }}>{name}</div>
          </div>
        </div>
        <div className="mv-info">
          <div className="so-head" style={{ padding: '0 0 12px', border: 0 }}>
            <div className="so-bc">Deal memo · advance</div>
            <button type="button" className="so-close" onClick={onClose}>
              ✕
            </button>
          </div>
          <div className="mv-field">
            <label>Deal type</label>
            <div>
              {String(row.deal || 'Flat')}
              {row.deal && row.deal !== 'Flat' ? ' ' + (row.split || 0) + '%' : ''}
            </div>
          </div>
          <div className="mv-field">
            <label>Guarantee</label>
            <div>£{Math.round(Number(row.est) || 0).toLocaleString()}</div>
          </div>
          <div className="mv-field">
            <label>Capacity</label>
            <div>{String(row.cap || '—')}</div>
          </div>
          <div className="mv-field">
            <label>Transport arrangements</label>
            <div>Backline supplied by promoter; 2× Sprinter on the day; secure parking for one nightliner.</div>
          </div>
          <div className="mv-field">
            <label>Exclusivity</label>
            <div>120-mile / 30-day radius clause around the show date.</div>
          </div>
          <div className="mv-field">
            <label>Hospitality</label>
            <div>Buyout £400; 12 hot meals; dressing-room rider attached.</div>
          </div>
          <div className="mv-field">
            <label>Notes</label>
            <div>Settlement in cash on the night; promoter to provide a ticket audit + manifest.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
