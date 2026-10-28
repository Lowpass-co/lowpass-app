'use client';

/* ============================================
   <AdvanceShowPage> — one show's advance (Oct 2026 rebuild).

   Read like a document, answered in place. Venue answers wait for review.
   Hotel / travel / deal are SHOWN here and edited on their own pages (one
   place per fact). Local crew calls live here (day sheets are retired).
   Customise this day, Request from venue and Drop info pack open over it.
   ============================================ */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileUp, Settings2, Send, ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { LaborCallBlock } from '@/components/advance/labor/LaborCallBlock';
import { isEmptyAnswer } from '@/lib/advance/intake';
import { summariseShow, type AdvData, type AdvSection } from '@/lib/advance/board';
import type { AdvanceShowData, FieldSource, PendingAnswer } from '@/server/advance/show';
import { saveAnswers, reviewPending } from './api';
import { ShowSections } from './ShowSections';
import { CustomiseDrawer } from './CustomiseDrawer';
import { RequestFlow } from './RequestFlow';
import { PackFlow } from './packs/PackFlow';
import { SourceViewer } from './packs/SourceViewer';
import { dayTypeLabel, fmtDay, fmtLong, fmtWhen } from './format';
import './advance.css';

export interface RailShow {
  routingId: string;
  date: string;
  venue: string | null;
  state: 'review' | 'done' | 'waiting' | 'none';
}

type Contact = { id?: string; first_name: string; last_name?: string; role?: string; phone?: string; email?: string };

function railDot(s: RailShow['state']) {
  if (s === 'review') return { background: 'var(--color-lp-warning)' };
  if (s === 'done') return { background: 'var(--color-lp-success)' };
  if (s === 'waiting') return { border: '1.5px solid var(--color-lp-info)' };
  return { border: '1.5px dashed var(--lp-border-strong)' };
}

export function AdvanceShowPage({ show, rail, templates }: { show: AdvanceShowData; rail: RailShow[]; templates: { id: string; name: string }[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const tourId = show.tour.id;
  const routingId = show.routing.id;

  const [data, setData] = useState<AdvData>(show.data);
  const [sources, setSources] = useState<Record<string, FieldSource>>(show.sources);
  const [pending, setPending] = useState<PendingAnswer[]>(show.pending);
  const [instanceId, setInstanceId] = useState<string | null>(show.instanceId);
  const [customise, setCustomise] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [packs, setPacks] = useState<File[] | null>(null);
  const [viewing, setViewing] = useState<{ src: FieldSource; label: string } | null>(null);
  const [current, setCurrent] = useState<string | null>(show.sections[0]?.template_id ?? null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Server props change after router.refresh(): adopt them.
  useEffect(() => {
    setData(show.data);
    setSources(show.sources);
    setPending(show.pending);
    setInstanceId(show.instanceId);
  }, [show]);

  const summary = useMemo(() => summariseShow(show.allSections, data, countBy(pending), show.request.live), [show.allSections, data, pending, show.request.live]);

  const onSave = useCallback(
    async (sectionId: string, fieldId: string, value: unknown) => {
      setData((d) => ({ ...d, [sectionId]: { ...(d[sectionId] ?? {}), [fieldId]: value } }));
      try {
        const out = await saveAnswers(tourId, routingId, { [sectionId]: { [fieldId]: value } }, {
          [`${sectionId}:${fieldId}`]: isEmptyAnswer(value) ? null : { kind: 'you', at: new Date().toISOString() },
        });
        setSources(out.field_sources);
        if (!instanceId) {
          setInstanceId(out.instanceId);
          router.refresh();
        }
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Couldn’t save', 'error');
        throw e;
      }
    },
    [tourId, routingId, instanceId, router, showToast],
  );

  const onReview = useCallback(
    async (accept: PendingAnswer[], reject: PendingAnswer[]) => {
      if (!instanceId) return;
      try {
        await reviewPending(instanceId, accept.map((p) => p.id), reject.map((p) => p.id));
        setPending((ps) => ps.filter((p) => !accept.includes(p) && !reject.includes(p)));
        if (accept.length) {
          setData((d) => {
            const next = { ...d };
            for (const a of accept) next[a.section_id] = { ...(next[a.section_id] ?? {}), [a.field_id]: a.value };
            return next;
          });
          const srcs: Record<string, FieldSource> = {};
          for (const a of accept) srcs[`${a.section_id}:${a.field_id}`] = { kind: 'venue', at: new Date().toISOString() };
          const out = await saveAnswers(tourId, routingId, {}, srcs).catch(() => null);
          if (out) setSources(out.field_sources);
        }
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Couldn’t save that', 'error');
        throw e;
      }
    },
    [instanceId, tourId, routingId, showToast],
  );

  // Section tabs follow the scroll.
  useEffect(() => {
    const els = show.sections.map((s) => document.getElementById(`sec-${s.template_id}`)).filter((e): e is HTMLElement => !!e);
    if (!els.length || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setCurrent(top.target.id.slice(4));
      },
      { rootMargin: '-80px 0px -60% 0px' },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [show.sections]);

  // Contacts the venue gave (any section's `contacts` list).
  const contactsSid = show.contactsSection?.template_id ?? show.sections[0]?.template_id ?? null;
  const contacts: Contact[] = contactsSid && Array.isArray(data[contactsSid]?.contacts) ? (data[contactsSid].contacts as Contact[]) : [];
  const saveContacts = async (next: Contact[]) => {
    if (!contactsSid) return;
    setData((d) => ({ ...d, [contactsSid]: { ...(d[contactsSid] ?? {}), contacts: next } }));
    try {
      await saveAnswers(tourId, routingId, { [contactsSid]: { contacts: next } });
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Couldn’t save the contact', 'error');
    }
  };

  // Answers from earlier shows at this venue (other tours).
  const [previous, setPrevious] = useState<{ date: string; tour: string; changes: Record<string, Record<string, unknown>>; n: number } | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/advance/previously-played?routingId=${routingId}&withData=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { shows?: { date: string; tourName: string; data?: Record<string, Record<string, unknown>> }[] } | null) => {
        if (!live || !j?.shows?.length) return;
        const last = j.shows.find((s) => s.data) ?? null;
        if (!last?.data) return;
        const changes: Record<string, Record<string, unknown>> = {};
        let n = 0;
        for (const s of show.sections) {
          for (const f of s.fields ?? []) {
            const prior = last.data[s.template_id]?.[f.id];
            if (isEmptyAnswer(prior) || typeof prior === 'object') continue;
            if (!isEmptyAnswer(show.data[s.template_id]?.[f.id])) continue;
            (changes[s.template_id] ??= {})[f.id] = prior;
            n++;
          }
        }
        setPrevious({ date: last.date, tour: last.tourName, changes, n });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [routingId, show.sections, show.data]);

  const reusePrevious = async () => {
    if (!previous?.n) return;
    const srcs: Record<string, FieldSource> = {};
    for (const [sid, fs] of Object.entries(previous.changes)) for (const fid of Object.keys(fs)) srcs[`${sid}:${fid}`] = { kind: 'previous', at: new Date().toISOString() };
    try {
      const out = await saveAnswers(tourId, routingId, previous.changes, srcs);
      setData(out.data);
      setSources(out.field_sources);
      setPrevious({ ...previous, n: 0 });
      showToast(`Reused ${Object.keys(srcs).length} answers`);
      router.refresh();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Couldn’t reuse them', 'error');
    }
  };

  const pct = summary.total ? Math.round((summary.answered / summary.total) * 100) : 0;
  const reviewPct = summary.total ? Math.round((summary.toReview / summary.total) * 100) : 0;

  return (
    <div
      className="adv-show"
      onDragOver={(e) => {
        if (Array.from(e.dataTransfer.types).includes('Files')) e.preventDefault();
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setPacks(Array.from(e.dataTransfer.files));
      }}
    >
      <nav className="adv-shows-rail" aria-label="Shows">
        <Link href={`/advance/${tourId}`} style={{ fontSize: 'var(--lp-text-xs)', padding: '0 12px 10px' }}>
          <ArrowLeft size={13} aria-hidden /> All shows
        </Link>
        {rail.map((r) => (
          <Link key={r.routingId} href={`/advance/${tourId}/${r.routingId}`} aria-current={r.routingId === routingId ? 'page' : undefined}>
            <span className="adv-dot" style={railDot(r.state)} aria-hidden />
            <span className="when">{fmtDay(r.date)}</span>
            <span className="name">{r.venue ?? 'Show'}</span>
          </Link>
        ))}
      </nav>

      <main className="adv-page adv-grow" style={{ paddingTop: 'var(--lp-space-5)' }}>
        <div className="adv-row-flex" style={{ alignItems: 'flex-start', gap: 20 }}>
          <div className="adv-grow">
            <div className="adv-eyebrow">{fmtLong(show.routing.date)} · {dayTypeLabel(show.routing.dayType)}</div>
            <h1 className="adv-venue-title" style={{ viewTransitionName: 'adv-venue' }}>{show.venue.name ?? show.routing.city ?? 'Show'}</h1>
            <div style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)' }}>{show.venue.address ?? show.venue.city ?? ''}</div>
            <div className="adv-row-flex" style={{ gap: 8, marginTop: 12 }}>
              {show.template ? (
                <Link className="adv-tag" href={`/advance/${tourId}/templates`}>{show.template.name} template</Link>
              ) : (
                <Link className="adv-tag" href={`/advance/${tourId}/templates`}>No template — choose one</Link>
              )}
              {show.changes.off.length + show.changes.added.length + show.changes.addedQuestions > 0 ? (
                <button type="button" className="adv-tag" style={{ background: 'none', cursor: 'pointer' }} onClick={() => setCustomise(true)}>
                  {show.changes.off.length + show.changes.added.length + show.changes.addedQuestions} changes for this day
                </button>
              ) : null}
              {show.request.kind !== 'not_sent' ? <span className="adv-tag">{show.request.label}</span> : null}
            </div>
          </div>
          <div className="adv-row-flex" style={{ gap: 8 }}>
            <input ref={fileInput} type="file" multiple hidden accept=".pdf,image/*,.xlsx,.xls,.csv,.txt" onChange={(e) => e.target.files?.length && setPacks(Array.from(e.target.files))} />
            <button type="button" className="adv-btn" onClick={() => fileInput.current?.click()}>
              <FileUp size={15} aria-hidden /> Drop info pack
            </button>
            <button type="button" className="adv-btn" onClick={() => setCustomise(true)}>
              <Settings2 size={15} aria-hidden /> Customise this day
            </button>
            <button type="button" className="adv-btn adv-btn-primary" onClick={() => setRequesting(true)} disabled={!show.sections.length}>
              <Send size={15} aria-hidden /> Request from venue
            </button>
          </div>
        </div>

        <div className="adv-row-flex" style={{ gap: 14 }}>
          <div className="adv-progress" aria-hidden>
            <span style={{ width: `${pct}%`, background: 'var(--color-lp-success)' }} />
            <span style={{ width: `${reviewPct}%`, background: 'var(--color-lp-warning)' }} />
          </div>
          <span style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)', whiteSpace: 'nowrap' }}>
            <b style={{ color: 'var(--lp-text)' }}>{summary.answered} of {summary.total}</b> answered
            {summary.toReview ? <> · <span style={{ color: 'color-mix(in srgb, var(--color-lp-warning) 75%, var(--lp-text))' }}>{summary.toReview} for you to review</span></> : null}
          </span>
        </div>

        {pending.length ? (
          <div className="adv-banner">
            <span className="adv-grow" style={{ fontSize: 'var(--lp-text-sm)' }}>
              The venue answered <b>{pending.length} {pending.length === 1 ? 'question' : 'questions'}</b>. Nothing changes until you accept.
            </span>
            <button
              type="button"
              className="adv-btn adv-btn-sm"
              onClick={() => document.querySelector('[data-pending="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
            >
              Review one by one
            </button>
            <button
              type="button"
              className="adv-btn adv-btn-sm"
              style={{ background: 'var(--color-lp-warning)', borderColor: 'var(--color-lp-warning)', color: 'var(--lp-text-inverse)', fontWeight: 600 }}
              onClick={() => {
                const safe = pending.filter((p) => isEmptyAnswer(data[p.section_id]?.[p.field_id]));
                void onReview(safe, [])
                  .then(() => {
                    if (safe.length < pending.length) showToast(`${pending.length - safe.length} differ from yours — decide those one by one`);
                  })
                  .catch(() => {});
              }}
            >
              Accept all new
            </button>
          </div>
        ) : null}

        {!show.sections.length ? (
          <div className="adv-banner adv-banner-info">
            <span className="adv-grow" style={{ fontSize: 'var(--lp-text-sm)' }}>
              This day has no questions yet. {templates.length ? 'Pick a template, or customise the day.' : 'Make a template first.'}
            </span>
            <button type="button" className="adv-btn adv-btn-sm" onClick={() => setCustomise(true)}>Customise this day</button>
          </div>
        ) : (
          <div className="adv-tabs" role="navigation" aria-label="Sections">
            {summary.sections.map((p) => (
              <button
                key={p.template_id}
                type="button"
                className="adv-tab"
                aria-current={current === p.template_id}
                onClick={() => document.getElementById(`sec-${p.template_id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              >
                {p.label}
                {p.state === 'review' ? <span className="adv-n" data-s="review">{p.toReview}</span> : p.state === 'done' ? <span className="adv-n" data-s="done">✓</span> : <span className="adv-n" data-s="other">{p.answered}/{p.total}</span>}
              </button>
            ))}
          </div>
        )}

        <div className="adv-cols">
          <div className="adv-grow">
            <ShowSections
              sections={show.sections}
              data={data}
              sources={sources}
              pending={pending}
              requestLive={show.request.live}
              onSave={onSave}
              onReview={onReview}
              onOpenSource={(src, label) => setViewing({ src, label })}
              afterSchedule={
                <section id="crew-calls" className="adv-section" aria-label="Local crew calls" style={{ ['--i' as string]: 1, scrollMarginTop: 'var(--lp-space-6)' }}>
                  <div className="adv-section-head">
                    <h2>Local crew calls</h2>
                    <span className="adv-muted" style={{ fontSize: 'var(--lp-text-xs)' }}>Calls for the venue’s crew on this day</span>
                  </div>
                  <div style={{ padding: '0 18px 14px' }}>
                    <LaborCallBlock tourId={tourId} routingId={routingId} />
                  </div>
                </section>
              }
            />
          </div>

          <aside className="adv-aside" aria-label="About this show">
            <ContactsCard contacts={contacts} onChange={saveContacts} disabled={!contactsSid} />

            <div className="adv-card" style={{ ['--i' as string]: 1 }}>
              <h3>From elsewhere in Lowpass</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 'var(--lp-text-sm)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span className="adv-muted" style={{ fontSize: 'var(--lp-text-xs)' }}>Hotel</span>
                  {show.linked.hotels.length ? (
                    show.linked.hotels.map((h, i) => (
                      <span key={i}>
                        {h.name}
                        {h.rooms ? ` · ${h.rooms} ${h.rooms === 1 ? 'room' : 'rooms'}` : ''}
                        {h.checkIn ? ` · in ${fmtWhen(h.checkIn)}` : ''}
                      </span>
                    ))
                  ) : (
                    <span className="adv-muted">None booked for this day</span>
                  )}
                  <Link href={`/operations/${tourId}/rooming`}>Edit in Hotels &amp; rooming →</Link>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span className="adv-muted" style={{ fontSize: 'var(--lp-text-xs)' }}>Travel</span>
                  {show.linked.flights.length ? show.linked.flights.slice(0, 3).map((f, i) => <span key={i}>{f.label}</span>) : <span className="adv-muted">No flights on this day</span>}
                  <Link href={`/operations/${tourId}/travel`}>Edit in Travel →</Link>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span className="adv-muted" style={{ fontSize: 'var(--lp-text-xs)' }}>Deal · only you see this</span>
                  {show.linked.deal ? <span>{show.linked.deal.title} · {show.linked.deal.status}</span> : <span className="adv-muted">No deal memo</span>}
                  <Link href={`/budget/${tourId}?tab=income`}>Edit in Income &amp; settlements →</Link>
                </div>
              </div>
              <span className="adv-muted" style={{ fontSize: 'var(--lp-text-xs)', lineHeight: 1.4 }}>Shown here, edited in one place. Never sent to the venue.</span>
            </div>

            <div className="adv-card" style={{ ['--i' as string]: 2 }}>
              <h3>Venue documents</h3>
              {show.documents.length ? (
                show.documents.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setViewing({ src: { kind: 'pack', doc_id: d.id, file_name: d.file_name, page: 1 }, label: d.file_name })}
                    style={{ display: 'flex', gap: 10, alignItems: 'center', background: 'none', border: 0, padding: 0, textAlign: 'left', cursor: 'pointer', color: 'inherit', fontFamily: 'inherit' }}
                  >
                    <span className="adv-ficon" style={{ width: 28, height: 34, fontSize: 8, paddingBottom: 4 }}>{(d.file_name.split('.').pop() ?? 'file').toUpperCase().slice(0, 4)}</span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 'var(--lp-text-sm)' }}>{d.file_name}</span>
                      <span className="adv-muted" style={{ display: 'block', fontSize: 'var(--lp-text-xs)' }}>
                        Added {fmtWhen(d.created_at)} · {d.answers_used} {d.answers_used === 1 ? 'answer' : 'answers'} came from it
                      </span>
                    </span>
                  </button>
                ))
              ) : (
                <span className="adv-muted" style={{ fontSize: 'var(--lp-text-sm)' }}>Drop a venue’s tech pack or info sheet and the AI fills in what it can.</span>
              )}
              <button type="button" className="adv-link" style={{ alignSelf: 'flex-start' }} onClick={() => fileInput.current?.click()}>
                <Plus size={13} aria-hidden /> {show.documents.length ? 'Drop another pack' : 'Add a pack'}
              </button>
            </div>

            {previous && previous.n > 0 ? (
              <div className="adv-card" style={{ ['--i' as string]: 3 }}>
                <h3>Played here before</h3>
                <span style={{ fontSize: 'var(--lp-text-sm)' }}>{fmtLong(previous.date)} · {previous.tour}</span>
                <span className="adv-muted" style={{ fontSize: 'var(--lp-text-xs)' }}>{previous.n} answers you haven’t filled in here yet</span>
                <button type="button" className="adv-btn adv-btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => void reusePrevious()}>
                  Reuse {previous.n} answers
                </button>
              </div>
            ) : null}
          </aside>
        </div>
      </main>

      {customise ? (
        <CustomiseDrawer
          tourId={tourId}
          routingId={routingId}
          dayLabel={`${fmtDay(show.routing.date)} · ${show.venue.name ?? show.routing.city ?? 'Show'}`}
          sections={show.allSections}
          template={show.template}
          templateSections={show.templateSections}
          templates={templates}
          onClose={() => setCustomise(false)}
          onSaved={() => router.refresh()}
        />
      ) : null}
      {requesting ? (
        <RequestFlow
          tourId={tourId}
          routingIds={[routingId]}
          shows={[{ routingId, date: show.routing.date, venue: show.venue.name, city: show.venue.city }]}
          onClose={() => {
            setRequesting(false);
            router.refresh();
          }}
        />
      ) : null}
      {packs ? (
        <PackFlow
          tourId={tourId}
          initialFiles={packs}
          fixedRoutingId={routingId}
          shows={[{ routingId, date: show.routing.date, venue: show.venue.name, city: show.venue.city }]}
          onClose={(saved) => {
            setPacks(null);
            if (fileInput.current) fileInput.current.value = '';
            if (saved) router.refresh();
          }}
        />
      ) : null}
      {viewing ? <SourceViewer tourId={tourId} source={viewing.src} label={viewing.label} onClose={() => setViewing(null)} /> : null}
    </div>
  );
}

function countBy(pending: PendingAnswer[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const p of pending) m[p.section_id] = (m[p.section_id] ?? 0) + 1;
  return m;
}

function ContactsCard({ contacts, onChange, disabled }: { contacts: Contact[]; onChange: (c: Contact[]) => void; disabled: boolean }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Contact>({ first_name: '', role: '', phone: '', email: '' });
  return (
    <div className="adv-card" style={{ ['--i' as string]: 0 }}>
      <h3>Venue contacts</h3>
      {contacts.length ? (
        contacts.map((c, i) => (
          <div key={c.id ?? i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <div className="adv-grow" style={{ fontSize: 'var(--lp-text-sm)' }}>
              <div>{[c.first_name, c.last_name].filter(Boolean).join(' ')}</div>
              <div className="adv-muted" style={{ fontSize: 'var(--lp-text-xs)' }}>
                {[c.role, c.phone ? <a key="p" href={`tel:${c.phone}`}>{c.phone}</a> : null, c.email ? <a key="e" href={`mailto:${c.email}`}>{c.email}</a> : null]
                  .filter(Boolean)
                  .map((x, j) => <span key={j}>{j ? ' · ' : ''}{x}</span>)}
              </div>
            </div>
            <button type="button" className="adv-btn adv-btn-sm adv-btn-ghost" aria-label={`Remove ${c.first_name}`} onClick={() => onChange(contacts.filter((_, j) => j !== i))}>
              <Trash2 size={13} aria-hidden />
            </button>
          </div>
        ))
      ) : (
        <span className="adv-muted" style={{ fontSize: 'var(--lp-text-sm)' }}>No contacts yet.</span>
      )}
      {adding ? (
        <form
          style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.first_name.trim()) return;
            onChange([...contacts, { ...draft, id: crypto.randomUUID(), first_name: draft.first_name.trim() }]);
            setDraft({ first_name: '', role: '', phone: '', email: '' });
            setAdding(false);
          }}
        >
          <input className="adv-field" aria-label="Name" placeholder="Name" value={draft.first_name} onChange={(e) => setDraft({ ...draft, first_name: e.target.value })} autoFocus />
          <input className="adv-field" aria-label="Role" placeholder="Role (production manager…)" value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} />
          <input className="adv-field" aria-label="Phone" placeholder="Phone" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
          <input className="adv-field" aria-label="Email" type="email" placeholder="Email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
          <span className="adv-row-flex" style={{ gap: 6 }}>
            <button type="submit" className="adv-btn adv-btn-sm adv-btn-light">Add</button>
            <button type="button" className="adv-btn adv-btn-sm adv-btn-ghost" onClick={() => setAdding(false)}>Cancel</button>
          </span>
        </form>
      ) : (
        <button type="button" className="adv-link" style={{ alignSelf: 'flex-start' }} disabled={disabled} onClick={() => setAdding(true)}>
          <Plus size={13} aria-hidden /> Add a contact
        </button>
      )}
    </div>
  );
}

export type { AdvSection };
