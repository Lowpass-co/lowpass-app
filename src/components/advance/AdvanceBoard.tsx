'use client';

/* ============================================
   <AdvanceBoard> — the tour's advance at a glance (Oct 2026 rebuild).

   Shows down the side, sections across the top, one state per cell (the
   rules in lib/advance/board.ts), the venue request per show, and one search
   across every answer on the tour. Clicking a show morphs its name into the
   show page (view transition). Days without an advance fold into thin rows.
   ============================================ */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { Search, FileUp, LayoutTemplate, Send } from 'lucide-react';
import type { BoardData, BoardShowRow } from '@/server/advance/board';
import { useSpineNavigate } from '@/lib/nav/viewTransitionNav';
import { PackFlow } from './packs/PackFlow';
import { RequestFlow } from './RequestFlow';
import { cellText, fmtDay, fmtRange, stateWord } from './format';
import './advance.css';

type Filter = 'all' | 'review' | 'waiting' | 'not_sent' | 'done';

function bucket(r: BoardShowRow): Filter | null {
  if (r.request.kind === 'done') return 'done';
  if (r.toReview > 0) return 'review';
  if (r.request.kind === 'sent' || r.request.kind === 'opened') return 'waiting';
  if (r.request.kind === 'not_sent' || r.request.kind === 'made') return 'not_sent';
  return null;
}

function matchRow(r: BoardShowRow, words: string[]): { ok: boolean; hit: { label: string; value: string } | null } {
  if (!words.length) return { ok: true, hit: null };
  const base = `${r.venue ?? ''} ${r.city ?? ''} ${r.dayType}`.toLowerCase();
  const answers = r.answers.map((a) => ({ a, text: `${a.section} ${a.label} ${a.value}`.toLowerCase() }));
  const all = `${base} ${answers.map((x) => x.text).join(' ')}`;
  if (!words.every((w) => all.includes(w))) return { ok: false, hit: null };
  const best = answers.find((x) => words.every((w) => x.text.includes(w))) ?? answers.find((x) => words.some((w) => x.text.includes(w)));
  return { ok: true, hit: best && !words.every((w) => base.includes(w)) ? { label: best.a.label, value: best.a.value } : null };
}

function Marked({ text, words }: { text: string; words: string[] }) {
  if (!words.length) return <>{text}</>;
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'ig');
  return (
    <>
      {text.split(re).map((part, i) => (i % 2 === 1 ? <mark key={i}>{part}</mark> : <span key={i}>{part}</span>))}
    </>
  );
}

export function AdvanceBoard({ data }: { data: BoardData }) {
  const tourId = data.tour.id;
  const navigate = useSpineNavigate();
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [packs, setPacks] = useState<File[] | null>(null);
  const [requesting, setRequesting] = useState<string[] | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === '/' && !(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable))) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const words = useMemo(() => q.toLowerCase().split(/\s+/).filter(Boolean), [q]);
  const shows = data.rows.filter((r): r is BoardShowRow => r.kind === 'show');
  const notSent = shows.filter((r) => bucket(r) === 'not_sent');

  const visible = useMemo(() => {
    const out: (typeof data.rows[number] & { hit?: { label: string; value: string } | null })[] = [];
    for (const r of data.rows) {
      if (r.kind === 'gap') {
        if (filter === 'all' && !words.length) out.push(r);
        continue;
      }
      if (filter !== 'all' && bucket(r) !== filter) continue;
      const m = matchRow(r, words);
      if (m.ok) out.push({ ...r, hit: m.hit });
    }
    return out;
  }, [data.rows, filter, words]);

  const cols = data.columns;
  const grid: CSSProperties = { gridTemplateColumns: `240px 210px repeat(${cols.length}, minmax(92px, 1fr)) 64px` };

  const open = (e: React.MouseEvent<HTMLAnchorElement>, r: BoardShowRow) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    const name = e.currentTarget.querySelector<HTMLElement>('.adv-show-name');
    if (name) name.style.viewTransitionName = 'adv-venue';
    navigate(`/advance/${tourId}/${r.routingId}`);
  };

  const filters: [Filter, string, number][] = [
    ['all', 'All shows', data.counts.shows],
    ['review', 'To review', data.counts.review],
    ['waiting', 'Waiting on venue', data.counts.waiting],
    ['not_sent', 'Not sent', data.counts.notSent],
    ['done', 'Done', data.counts.done],
  ];

  return (
    <div
      className="adv-page"
      onDragOver={(e) => {
        if (Array.from(e.dataTransfer.types).includes('Files')) e.preventDefault();
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setPacks(Array.from(e.dataTransfer.files));
      }}
    >
      <div className="adv-row-flex" style={{ alignItems: 'flex-end' }}>
        <div className="adv-grow">
          <h1 className="lp-page-title" style={{ margin: 0 }}>Advance</h1>
          <p className="adv-sub">
            {data.counts.shows} {data.counts.shows === 1 ? 'show' : 'shows'}
            {data.counts.review ? <> · <span style={{ color: 'color-mix(in srgb, var(--color-lp-warning) 75%, var(--lp-text))' }}>{data.counts.review} to review</span></> : null}
            {data.counts.waiting ? <> · <span style={{ color: 'color-mix(in srgb, var(--color-lp-info) 60%, var(--lp-text))' }}>{data.counts.waiting} waiting on venues</span></> : null}
            {data.counts.notSent ? <> · {data.counts.notSent} not sent</> : null}
            {data.counts.done ? <> · <span style={{ color: 'color-mix(in srgb, var(--color-lp-success) 60%, var(--lp-text))' }}>{data.counts.done} done</span></> : null}
          </p>
        </div>
        <Link className="adv-btn" href={`/advance/${tourId}/templates`}>
          <LayoutTemplate size={15} aria-hidden /> Templates
        </Link>
        <button type="button" className="adv-btn" onClick={() => setPacks([])}>
          <FileUp size={15} aria-hidden /> Drop info packs
        </button>
        {notSent.length ? (
          <button type="button" className="adv-btn adv-btn-primary" onClick={() => setRequesting(notSent.map((r) => r.routingId))}>
            <Send size={15} aria-hidden /> Request {notSent.length} not sent
          </button>
        ) : null}
      </div>

      {!data.templates.length ? (
        <div className="adv-banner adv-banner-info">
          <span className="adv-grow" style={{ fontSize: 'var(--lp-text-sm)' }}>
            No advance templates yet. Make a <b>Show day</b> template and every show gets its questions automatically.
          </span>
          <Link className="adv-btn adv-btn-sm" href={`/advance/${tourId}/templates`}>Set up templates</Link>
        </div>
      ) : !data.hasMapping ? (
        <div className="adv-banner adv-banner-info">
          <span className="adv-grow" style={{ fontSize: 'var(--lp-text-sm)' }}>Choose which template each day type gets, so new days start filled in.</span>
          <Link className="adv-btn adv-btn-sm" href={`/advance/${tourId}/templates`}>Choose templates</Link>
        </div>
      ) : null}

      <div className="adv-row-flex">
        <label className="adv-search">
          <Search size={16} aria-hidden style={{ color: 'var(--lp-text-tertiary)' }} />
          <span className="sr-only">Search every answer on this tour</span>
          <input
            ref={searchRef}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search every answer on this tour — “curfew”, “shore power”, “Wembley”…"
          />
          <span className="adv-kbd" aria-hidden>/</span>
        </label>
        <div role="group" aria-label="Filter shows" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {filters.map(([id, label, n]) => (
            <button key={id} type="button" className="adv-chip" aria-pressed={filter === id} onClick={() => setFilter(id)}>
              {label} <b>{n}</b>
            </button>
          ))}
        </div>
      </div>

      <div className="adv-board" role="table" aria-label="Advance by show">
        <div className="adv-board-grid adv-board-head" style={grid} role="row">
          <span className="adv-th" style={{ textAlign: 'left', padding: 0 }} role="columnheader">Show</span>
          <span className="adv-th" style={{ textAlign: 'left' }} role="columnheader">Venue request</span>
          {cols.map((c) => (
            <span key={c.key} className="adv-th" role="columnheader">{c.label}</span>
          ))}
          <span className="adv-th" style={{ textAlign: 'right' }} role="columnheader">Done</span>
        </div>

        {visible.length === 0 ? (
          <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--lp-text-tertiary)', fontSize: 'var(--lp-text-sm)' }}>
            {words.length ? <>Nothing on this tour mentions “{q}”.</> : shows.length ? 'No shows in this filter.' : 'No show days on this tour yet — add them on the Schedule.'}
          </div>
        ) : null}

        {visible.map((r, i) =>
          r.kind === 'gap' ? (
            <div key={r.key} className="adv-gap" style={{ ['--i' as string]: i }} role="row">
              <span className="adv-mono" style={{ minWidth: 150 }}>{fmtRange(r.from, r.to)}</span>
              <span className="adv-dot" style={{ background: 'var(--color-lp-info)' }} aria-hidden />
              {r.label} · no advance
            </div>
          ) : (
            <a
              key={r.routingId}
              href={`/advance/${tourId}/${r.routingId}`}
              onClick={(e) => open(e, r)}
              className="adv-board-grid adv-board-row"
              data-review={r.toReview > 0}
              style={{ ...grid, ['--i' as string]: i }}
              role="row"
            >
              <span style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }} role="cell">
                <span className="adv-mono" style={{ fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-secondary)', width: 70, flexShrink: 0 }}>{fmtDay(r.date)}</span>
                <span style={{ minWidth: 0 }}>
                  <span className="adv-show-name"><Marked text={r.venue ?? r.city ?? 'Show'} words={words} /></span>
                  {r.hit ? (
                    <span className="adv-hit">
                      {r.hit.label}: <Marked text={r.hit.value} words={words} />
                    </span>
                  ) : (
                    <span className="adv-show-sub">
                      {[r.city, r.templateName ?? 'No template', r.changes ? `${r.changes} ${r.changes === 1 ? 'change' : 'changes'}` : null].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </span>
              </span>
              <span style={{ padding: '0 6px' }} role="cell">
                <span className="adv-req" data-k={r.request.kind} data-chase={r.request.chase}>{r.request.label}</span>
              </span>
              {cols.map((c) => {
                const cell = r.cells[c.key];
                const s = cell ? cell.state : 'off';
                return (
                  <span key={c.key} style={{ display: 'flex', justifyContent: 'center' }} role="cell">
                    <span className="adv-cell" data-s={s} title={`${c.label}: ${stateWord(s, cell)}`}>
                      {cellText(s, cell)}
                    </span>
                  </span>
                );
              })}
              <span className="adv-mono" style={{ textAlign: 'right', fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-secondary)' }} role="cell">
                {r.total ? `${r.answered}/${r.total}` : '—'}
              </span>
            </a>
          ),
        )}
      </div>

      <div className="adv-row-flex" style={{ gap: 18, fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-tertiary)' }} aria-label="Key">
        <span>Key</span>
        <span className="adv-row-flex" style={{ gap: 6 }}><span className="adv-cell" data-s="done" style={{ minWidth: 0 }}>✓</span> All answered</span>
        <span className="adv-row-flex" style={{ gap: 6 }}><span className="adv-cell" data-s="review" style={{ minWidth: 0 }}>3</span> Answered — review</span>
        <span className="adv-row-flex" style={{ gap: 6 }}><span className="adv-cell" data-s="asked" style={{ minWidth: 0 }}>Asked</span> Waiting on venue</span>
        <span className="adv-row-flex" style={{ gap: 6 }}><span className="adv-cell" data-s="partial" style={{ minWidth: 0 }}>4/7</span> Part answered</span>
        <span className="adv-row-flex" style={{ gap: 6 }}><span className="adv-cell" data-s="none" style={{ minWidth: 0 }}>—</span> Not started</span>
        <span className="adv-row-flex" style={{ gap: 6 }}><span className="adv-cell" data-s="off" style={{ minWidth: 0 }}>off</span> Not on this day</span>
        <span style={{ marginLeft: 'auto' }}>Drop venue packs anywhere on this page</span>
      </div>

      {packs ? (
        <PackFlow
          tourId={tourId}
          initialFiles={packs}
          shows={shows.map((r) => ({ routingId: r.routingId, date: r.date, venue: r.venue, city: r.city }))}
          onClose={() => setPacks(null)}
        />
      ) : null}
      {requesting ? <RequestFlow tourId={tourId} routingIds={requesting} shows={shows} onClose={() => setRequesting(null)} /> : null}
    </div>
  );
}
