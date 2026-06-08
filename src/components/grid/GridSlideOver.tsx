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
   covers them. That trips the React-Compiler immutability lint, which
   assumes immutable state — it doesn't apply to this deliberately-imperative
   component. */
/* eslint-disable react-hooks/immutability */
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Doc, Row, Section, Txn } from './types';
import type { MenuConfig } from './GridMenu';
import { CURS, FX, STATUSES, disp, fmt, formulaEst, sym, variance } from './gridModel';

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
}

const rectOf = (e: React.MouseEvent) => {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  return { left: r.left, bottom: r.bottom };
};
const money = (v: unknown) => parseFloat(String(v).replace(/[^0-9.\-]/g, '')) || 0;

export function GridSlideOver({ data, si, ri, version, onClose, pushUndo, render, openMenu }: GridSlideOverProps) {
  const [open, setOpen] = useState(false);
  const [scan, setScan] = useState(false);
  const [memo, setMemo] = useState<string | null>(null);

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

  /* ---- shared menus ---- */
  const pickCurrency = (e: React.MouseEvent) =>
    openMenu({
      anchor: rectOf(e),
      options: [...CURS],
      current: row.cur,
      onPick: (cc) => commit(() => (row.cur = cc)),
    });
  const pickStatus = (e: React.MouseEvent) =>
    openMenu({
      anchor: rectOf(e),
      options: [...STATUSES],
      current: String(row.status),
      onPick: (v) => commit(() => (row.status = v)),
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
  const cv = (row.cur || 'USD') !== 'USD';
  const s = sym(row.cur);

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
            🔗 {sec.source} → open
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
        if (e.target.value !== row.item) commit(() => (row.item = e.target.value));
      }}
    />
  );

  const estLocked =
    sec.kind === 'formula' || (sec.kind === 'derived' && (sec.source === 'Payroll' || sec.source === 'Rooming'));

  const MoneyBlock = () => {
    const estV = sec.kind === 'formula' ? formulaEst(row, data) : Number(row.est) || 0;
    const v = variance(row, estV);
    return (
      <>
        <div className="so-2col">
          <div className="so-field">
            <label>Estimate</label>
            {estLocked ? (
              cv ? (
                <div className="so-ro">
                  <span className="fxconv">{fmt(disp(estV, row.cur))}</span> 🔒{' '}
                  <span className="fxnote">
                    from {s}
                    {Number(estV).toLocaleString()}
                  </span>
                </div>
              ) : (
                <div className="so-ro">{fmt(estV)} 🔒</div>
              )
            ) : (
              <div className="moneyin">
                <span className="cursym">{s}</span>
                <input
                  defaultValue={Number(row.est) || 0}
                  onBlur={(e) => commit(() => (row.est = money(e.target.value)))}
                />
              </div>
            )}
          </div>
          <div className="so-field">
            <label>Actual</label>
            <div className="moneyin">
              <span className="cursym">{s}</span>
              <input
                defaultValue={Number(row.act) || 0}
                onBlur={(e) => commit(() => (row.act = money(e.target.value)))}
              />
            </div>
          </div>
        </div>
        <div className="so-stat">
          Variance{' '}
          <b style={{ color: v ? (v.d > 0 ? 'var(--color-lp-error)' : 'var(--color-lp-success)') : 'var(--lp-text-tertiary)' }}>
            {v ? (v.d > 0 ? '+' : '') + v.pct.toFixed(1) + '%' : '—'}
          </b>
          {cv ? (
            <>
              {' '}·{' '}
              <span className="fxconv">
                ≈ {fmt(disp(estV, row.cur))} est / {fmt(disp(row.act, row.cur))} act in $
              </span>
            </>
          ) : null}
        </div>
      </>
    );
  };

  const CurBlock = () => (
    <div className="so-field">
      <label>Currency</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
        <span className="pill" style={{ cursor: 'pointer' }} onClick={pickCurrency}>
          {row.cur || 'USD'} ({s})
        </span>
        {cv ? <span className="fxnote">⚠ shown converted to $ at {FX[row.cur || 'USD']}× (demo rate)</span> : null}
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
    const names = (row.docs ?? []).map((d) => d.name);
    openMenu({
      anchor: rectOf(e),
      options: [...names, '＋ Upload new receipt'],
      onPick: (choice) =>
        commit(() => {
          if (choice === '＋ Upload new receipt') {
            const name = `receipt-${(row.docs?.length ?? 0) + 1}.pdf`;
            row.docs!.push({ type: 'Receipt', name });
            t.receipt = name;
          } else {
            t.receipt = choice;
          }
        }),
    });
  };

  const TxnsBlock = () => (
    <div>
      <div className="so-sec-h">
        <h5>Transactions</h5>
        <button
          type="button"
          className="so-add"
          onClick={() => commit(() => row.transactions!.push({ date: '', desc: '', amount: 0, receipt: null }))}
        >
          ＋ Add
        </button>
      </div>
      <div>
        {!row.transactions || row.transactions.length === 0 ? (
          <div className="so-empty">No transactions yet.</div>
        ) : (
          row.transactions.map((t, i) => (
            <div key={i} className="txn">
              <input
                defaultValue={t.desc}
                placeholder="Transaction name"
                onBlur={(e) => commit(() => (t.desc = e.target.value))}
              />
              <input type="date" defaultValue={t.date} onBlur={(e) => commit(() => (t.date = e.target.value))} />
              <input
                className="amt"
                defaultValue={t.amount || 0}
                onBlur={(e) => commit(() => (t.amount = money(e.target.value)))}
              />
              <div className="txn-receipt">
                {t.receipt ? (
                  <span className="rcpt has">📎 {t.receipt}</span>
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
      </div>
    </div>
  );

  const addDoc = (e: React.MouseEvent) =>
    openMenu({
      anchor: rectOf(e),
      options: DOCTYPES,
      onPick: (tp) => commit(() => row.docs!.push({ type: tp, name: `${tp.toLowerCase()}.pdf` })),
    });

  const DocsBlock = () => (
    <div>
      <div className="so-sec-h">
        <h5>Documents</h5>
        <button type="button" className="so-add" onClick={addDoc}>
          ＋ Add
        </button>
      </div>
      <div>
        {!row.docs || row.docs.length === 0 ? (
          <div className="so-empty">No quotes, contracts or receipts on this line.</div>
        ) : (
          row.docs.map((d: Doc, i: number) => (
            <div key={i} className="docrow">
              <span className="doctype">{d.type}</span>
              <input
                className="docname"
                defaultValue={d.name}
                autoFocus={i === (row.docs?.length ?? 0) - 1 && d.name.endsWith('.pdf') && d.name.startsWith(d.type.toLowerCase())}
                onBlur={(e) => commit(() => (d.name = e.target.value))}
              />
              <span className="docx" onClick={() => commit(() => row.docs!.splice(i, 1))}>
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
        onBlur={(e) => commit(() => (row.notes = e.target.value))}
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
                <input
                  className="rateamt"
                  defaultValue={r.amount || 0}
                  onBlur={(e) => commit(() => (r.amount = money(e.target.value)))}
                />
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

  const body =
    row.daytype === 'Show'
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
