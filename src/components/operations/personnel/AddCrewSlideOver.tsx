'use client';

/* ============================================
   LOWPASS — <AddCrewSlideOver> (Nov 2026, Adam: "more visually pleasing,
   better flow, less restrictive")

   Tick people, then add them all at once.
     - Everyone in People who isn't on the tour is loaded ONCE
       (/personnel/candidates) and filtered as you type — people who've
       toured with this artist first.
     - Typing a name that isn't there offers "+ Add 'X' as new".
     - Each picked person gets a line in the tray (footer): role (their usual
       role), role tag worked out from it (a chip you can change), dates
       ("Whole tour" unless changed), and — for workspace admins — app access
       on this tour (a preset; needs an email).
     - One POST to /personnel/add. Invite links come back to copy; the app
       never emails.
   Status is retired — everyone added is simply on the crew.

   Mounted by the Crew page, Payroll and Rooming (AddPersonToTourButton).
   ============================================ */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Loader2, Plus, X } from 'lucide-react';
import { SlideOver } from '@/components/ui/SlideOver';
import { useToast } from '@/components/ui/Toast';
import { ROLE_TAG_OPTIONS, type RoleTag } from '@/lib/personnel/role-tags';
import { inferRoleTag, matchesCandidate, PRESET_HINTS, type Candidate } from '@/lib/personnel/crew';
import { PRESETS, PRESET_LABELS, type Preset } from '@/lib/permissions/areas';
import './crewRoster.css';

const SHOW_MAX = 150;

type Entry = {
  key: string;
  /** Existing person, or null for a new one. */
  person: Candidate | null;
  name: string;
  email: string;
  phone: string;
  role: string;
  /** null = follow the role (worked out). */
  tag: RoleTag | null;
  wholeTour: boolean;
  starts: string;
  ends: string;
  login: Preset | '';
};

type AddResult = {
  name: string;
  ok: boolean;
  error?: string;
  id?: string;
  rateCard?: Record<string, unknown> | null;
  login?: { kind: 'full' | 'granted' | 'invited' | 'error'; url?: string; error?: string };
};

export interface AddCrewSlideOverProps {
  open: boolean;
  tourId: string;
  tourStartDate?: string | null;
  tourEndDate?: string | null;
  /** Open with this person ticked (People › Assign to tour, ?assign=). */
  preselectPersonId?: string | null;
  onClose: () => void;
  /** Called once per person added (Payroll / Rooming append the seeded card). */
  onAdded: (result?: { id?: string; rateCard?: Record<string, unknown> | null }) => void;
}

export function AddCrewSlideOver({
  open,
  tourId,
  tourStartDate = null,
  tourEndDate = null,
  preselectPersonId = null,
  onClose,
  onAdded,
}: AddCrewSlideOverProps) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [people, setPeople] = useState<Candidate[]>([]);
  const [artistName, setArtistName] = useState<string | null>(null);
  const [canGiveAccess, setCanGiveAccess] = useState(false);
  const [q, setQ] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<AddResult[] | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const newKey = useRef(0);

  useEffect(() => {
    if (!open) return;
    setQ('');
    setEntries([]);
    setError(null);
    setDone(null);
    setSubmitting(false);
    setLoading(true);
    setLoadError(null);
    let live = true;
    fetch(`/api/tours/${tourId}/personnel/candidates`, { cache: 'no-store' })
      .then(async (r) => {
        const body = (await r.json().catch(() => null)) as
          | { people?: Candidate[]; artistName?: string | null; canGiveAccess?: boolean; error?: string }
          | null;
        if (!live) return;
        if (!r.ok) {
          setLoadError(body?.error ?? `Couldn't load People (${r.status})`);
          return;
        }
        const list = body?.people ?? [];
        setPeople(list);
        const pre = preselectPersonId ? list.find((c) => c.id === preselectPersonId) : undefined;
        if (pre) setEntries([blankFor(pre, pre.name, tourStartDate, tourEndDate)]);
        setArtistName(body?.artistName ?? null);
        setCanGiveAccess(!!body?.canGiveAccess);
      })
      .catch(() => live && setLoadError("Couldn't load People — check your connection"))
      .finally(() => live && setLoading(false));
    const t = setTimeout(() => searchRef.current?.focus(), 50);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [open, tourId, preselectPersonId, tourStartDate, tourEndDate]);

  const picked = useMemo(() => new Set(entries.filter((e) => e.person).map((e) => e.person!.id)), [entries]);
  const shown = useMemo(() => people.filter((c) => matchesCandidate(c, q)), [people, q]);
  const withArtist = shown.filter((c) => c.withArtist);
  const others = shown.filter((c) => !c.withArtist);
  const typed = q.trim();
  const offerNew =
    typed.length > 1 &&
    !people.some((c) => c.name.toLowerCase() === typed.toLowerCase()) &&
    !entries.some((e) => !e.person && e.name.toLowerCase() === typed.toLowerCase());

  function blank(person: Candidate | null, name: string): Entry {
    return blankFor(person, name, tourStartDate, tourEndDate, person ? undefined : `new-${++newKey.current}`);
  }

  function toggle(c: Candidate) {
    setEntries((prev) => (prev.some((e) => e.person?.id === c.id) ? prev.filter((e) => e.person?.id !== c.id) : [...prev, blank(c, c.name)]));
  }
  function addNew() {
    setEntries((prev) => [...prev, blank(null, typed)]);
    setQ('');
    searchRef.current?.focus();
  }
  function update(key: string, patch: Partial<Entry>) {
    setEntries((prev) => prev.map((e) => (e.key === key ? { ...e, ...patch } : e)));
  }

  function needsEmail(e: Entry): boolean {
    return !!e.login && !e.person?.hasLogin && !e.person?.email && !e.email.trim();
  }

  async function submit() {
    setError(null);
    const missing = entries.find(needsEmail);
    if (missing) {
      setError(`Add an email for ${missing.name} to give them a login.`);
      return;
    }
    const bad = entries.find((e) => !e.wholeTour && e.starts && e.ends && e.ends < e.starts);
    if (bad) {
      setError(`${bad.name}: the end date is before the start date.`);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/tours/${tourId}/personnel/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          people: entries.map((e) => ({
            ...(e.person
              ? { person_id: e.person.id }
              : { new: { name: e.name, email: e.email.trim() || null, phone: e.phone.trim() || null } }),
            role: e.role.trim() || null,
            role_tag: e.tag ?? inferRoleTag(e.role),
            starts_on: e.wholeTour ? tourStartDate : e.starts || null,
            ends_on: e.wholeTour ? tourEndDate : e.ends || null,
            ...(e.login ? { login: { preset: e.login, email: e.email.trim() || null } } : {}),
          })),
        }),
      });
      const body = (await res.json().catch(() => null)) as { results?: AddResult[]; error?: string } | null;
      const results = body?.results;
      if (!results) {
        setError(body?.error ?? `Couldn't add (${res.status})`);
        return;
      }
      for (const r of results) if (r.ok) onAdded({ id: r.id, rateCard: r.rateCard ?? null });
      const added = results.filter((r) => r.ok).length;
      const invites = results.filter((r) => r.login?.kind === 'invited' || r.login?.kind === 'error');
      const failed = results.filter((r) => !r.ok);
      if (!invites.length && !failed.length) {
        showToast(added === 1 ? `${results[0].name} added` : `${added} added to the crew`);
        onClose();
        return;
      }
      // Keep the panel open to show the links to copy / what went wrong.
      setDone(results);
    } catch {
      setError("Couldn't add — check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const footer =
    done ? (
      <div className="cr-foot" style={{ width: '100%' }}>
        <span />
        <button type="button" className="cr-btn is-primary" onClick={onClose}>
          Done
        </button>
      </div>
    ) : entries.length ? (
      <div className="cr-tray">
        <div className="cr-list-head" style={{ padding: 0 }}>
          Adding {entries.length}
        </div>
        <div className="cr-tray-list">
          {entries.map((e) => (
            <TrayEntry
              key={e.key}
              entry={e}
              canGiveAccess={canGiveAccess}
              needsEmail={needsEmail(e)}
              onChange={(patch) => update(e.key, patch)}
              onRemove={() => setEntries((prev) => prev.filter((x) => x.key !== e.key))}
            />
          ))}
        </div>
        {error ? <div className="cr-error" role="alert">{error}</div> : null}
        <div className="cr-foot">
          <span>Pay starts from their last tour — set it in Payroll.</span>
          <button type="button" className="cr-btn is-primary" onClick={() => void submit()} disabled={submitting}>
            {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
            {entries.length === 1 ? 'Add to tour' : `Add ${entries.length} to tour`}
          </button>
        </div>
      </div>
    ) : null;

  return (
    <SlideOver open={open} onClose={onClose} title="Add crew" width="wide" footer={footer}>
      {done ? (
        <DoneView results={done} />
      ) : (
        <div className="cr-add">
          <input
            ref={searchRef}
            className="cr-input cr-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              if (shown.length === 1 && !shown[0].onTour && !picked.has(shown[0].id)) {
                toggle(shown[0]);
                setQ('');
              } else if (offerNew && shown.length === 0) addNew();
            }}
            placeholder="Search People, or type a new name"
            aria-label="Search People"
            autoComplete="off"
            spellCheck={false}
          />

          {loading ? (
            <div className="cr-muted" style={{ fontSize: 'var(--lp-text-sm)' }}>
              <Loader2 size={12} className="animate-spin" style={{ display: 'inline', marginRight: 6 }} />
              Loading People…
            </div>
          ) : loadError ? (
            <div className="cr-error" role="alert">{loadError}</div>
          ) : (
            <div>
              {offerNew ? (
                <button type="button" className="cr-pick is-new" onClick={addNew} style={{ borderTop: 0 }}>
                  <Plus size={14} />
                  <span>
                    Add “{typed}” as a new person
                  </span>
                </button>
              ) : null}
              {withArtist.length ? (
                <>
                  <div className="cr-list-head">{artistName ? `Toured with ${artistName}` : 'Toured with this artist'}</div>
                  {withArtist.slice(0, SHOW_MAX).map((c) => (
                    <PickRow key={c.id} c={c} on={picked.has(c.id)} onToggle={() => toggle(c)} />
                  ))}
                </>
              ) : null}
              {others.length ? (
                <>
                  <div className="cr-list-head">{withArtist.length ? 'Everyone else' : 'People'}</div>
                  {others.slice(0, Math.max(0, SHOW_MAX - withArtist.length)).map((c) => (
                    <PickRow key={c.id} c={c} on={picked.has(c.id)} onToggle={() => toggle(c)} />
                  ))}
                </>
              ) : null}
              {shown.length > SHOW_MAX ? (
                <div className="cr-muted" style={{ fontSize: 'var(--lp-text-xs)', padding: 'var(--lp-space-2)' }}>
                  {shown.length - SHOW_MAX} more — keep typing to narrow it down.
                </div>
              ) : null}
              {!shown.length && !offerNew ? (
                <div className="cr-empty">
                  {people.length ? 'No one matches.' : 'No one in People yet. Type a name to add someone new.'}
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}
    </SlideOver>
  );
}

function blankFor(
  person: Candidate | null,
  name: string,
  tourStartDate: string | null,
  tourEndDate: string | null,
  key?: string,
): Entry {
  return {
    key: key ?? person?.id ?? name,
    person,
    name,
    email: '',
    phone: '',
    role: person?.usualRole ?? '',
    tag: null,
    wholeTour: true,
    starts: tourStartDate ?? '',
    ends: tourEndDate ?? '',
    login: '',
  };
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

function PickRow({ c, on, onToggle }: { c: Candidate; on: boolean; onToggle: () => void }) {
  const sub = [c.usualRole, c.lastTour ? `last on ${c.lastTour.name}` : 'not toured yet'].filter(Boolean).join(' · ');
  if (c.onTour) {
    return (
      <div className="cr-pick is-on-tour" aria-disabled>
        <span className="cr-box" aria-hidden />
        <span className="cr-avatar" aria-hidden>
          {initials(c.name)}
        </span>
        <span style={{ minWidth: 0 }}>
          <span className="cr-name" style={{ display: 'block' }}>{c.name}</span>
          <span className="cr-sub" style={{ display: 'block' }}>{c.usualRole ?? ''}</span>
        </span>
        <span className="cr-muted" style={{ fontSize: 'var(--lp-text-xs)' }}>On this tour</span>
      </div>
    );
  }
  return (
    <button type="button" className="cr-pick" onClick={onToggle} aria-pressed={on}>
      <span className={`cr-box${on ? ' is-on' : ''}`} aria-hidden>
        {on ? <Check size={12} strokeWidth={3} /> : null}
      </span>
      <span className="cr-avatar" aria-hidden>
        {initials(c.name)}
      </span>
      <span style={{ minWidth: 0 }}>
        <span className="cr-name" style={{ display: 'block' }}>{c.name}</span>
        <span className="cr-sub" style={{ display: 'block' }}>{sub}</span>
      </span>
      <span className="cr-muted" style={{ fontSize: 'var(--lp-text-xs)' }}>{c.hasLogin ? 'has login' : ''}</span>
    </button>
  );
}

function TrayEntry({
  entry: e,
  canGiveAccess,
  needsEmail,
  onChange,
  onRemove,
}: {
  entry: Entry;
  canGiveAccess: boolean;
  needsEmail: boolean;
  onChange: (patch: Partial<Entry>) => void;
  onRemove: () => void;
}) {
  const tag = e.tag ?? inferRoleTag(e.role);
  const showEmail = !e.person || (!!e.login && !e.person.hasLogin && !e.person.email);
  return (
    <div className="cr-entry">
      <div className="cr-entry-top">
        <span className="cr-name">{e.name}</span>
        {!e.person ? <span className="cr-new">new</span> : null}
        <button type="button" className="cr-x" onClick={onRemove} aria-label={`Remove ${e.name}`}>
          <X size={14} />
        </button>
      </div>
      <div className="cr-entry-line">
        <input
          className="cr-input is-small cr-role-input"
          value={e.role}
          onChange={(ev) => onChange({ role: ev.target.value })}
          placeholder="Role on this tour"
          aria-label={`Role for ${e.name}`}
        />
        <label className="cr-chip" title="Role tag — used by rider variables">
          <select
            value={tag}
            onChange={(ev) => onChange({ tag: ev.target.value as RoleTag })}
            aria-label={`Role tag for ${e.name}`}
          >
            {ROLE_TAG_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {e.wholeTour ? (
          <button type="button" className="cr-chip" onClick={() => onChange({ wholeTour: false })}>
            Whole tour
          </button>
        ) : (
          <>
            <input
              className="cr-input is-small"
              type="date"
              value={e.starts}
              onChange={(ev) => onChange({ starts: ev.target.value })}
              aria-label={`First day for ${e.name}`}
            />
            <input
              className="cr-input is-small"
              type="date"
              value={e.ends}
              onChange={(ev) => onChange({ ends: ev.target.value })}
              aria-label={`Last day for ${e.name}`}
            />
            <button type="button" className="cr-chip" onClick={() => onChange({ wholeTour: true })}>
              Whole tour
            </button>
          </>
        )}
      </div>
      {showEmail ? (
        <div className="cr-entry-line">
          <input
            className="cr-input is-small"
            style={{ flex: '1 1 180px', borderColor: needsEmail ? 'var(--color-lp-error)' : undefined }}
            type="email"
            value={e.email}
            onChange={(ev) => onChange({ email: ev.target.value })}
            placeholder={e.login ? 'Email (needed for a login)' : 'Email'}
            aria-label={`Email for ${e.name}`}
          />
          {!e.person ? (
            <input
              className="cr-input is-small"
              style={{ flex: '0 1 140px' }}
              type="tel"
              value={e.phone}
              onChange={(ev) => onChange({ phone: ev.target.value })}
              placeholder="Phone"
              aria-label={`Phone for ${e.name}`}
            />
          ) : null}
        </div>
      ) : null}
      {canGiveAccess ? (
        <div className="cr-entry-line">
          <label className={`cr-chip${e.login ? ' is-on' : ''}`} title={e.login ? PRESET_HINTS[e.login] : 'No app login'}>
            <span className="cr-muted">App access:</span>
            <select
              value={e.login}
              onChange={(ev) => onChange({ login: ev.target.value as Preset | '' })}
              aria-label={`App access for ${e.name}`}
            >
              <option value="">{e.person?.hasLogin ? 'No change' : 'No login'}</option>
              {PRESETS.map((p) => (
                <option key={p} value={p}>
                  {PRESET_LABELS[p]}
                </option>
              ))}
            </select>
          </label>
          {e.login ? <span className="cr-sub">{PRESET_HINTS[e.login]} — this tour only</span> : null}
        </div>
      ) : null}
    </div>
  );
}

function DoneView({ results }: { results: AddResult[] }) {
  const added = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);
  return (
    <div className="cr-add">
      <div style={{ fontSize: 'var(--lp-text-base)', fontWeight: 'var(--lp-weight-semibold)' }}>
        {added.length === 1 ? '1 added to the crew' : `${added.length} added to the crew`}
      </div>
      {added.some((r) => r.login) ? (
        <div>
          <div className="cr-list-head" style={{ paddingLeft: 0 }}>App access</div>
          {added
            .filter((r) => r.login)
            .map((r) => (
              <div key={r.name} className="cr-done-row">
                <span className="cr-name" style={{ flex: 1 }}>{r.name}</span>
                <LoginOutcome login={r.login!} />
              </div>
            ))}
          <p className="cr-sub" style={{ whiteSpace: 'normal', marginTop: 'var(--lp-space-2)' }}>
            Lowpass doesn’t send emails — send each link yourself. It works for 14 days, for that email.
          </p>
        </div>
      ) : null}
      {failed.length ? (
        <div>
          <div className="cr-list-head" style={{ paddingLeft: 0 }}>Not added</div>
          {failed.map((r) => (
            <div key={r.name} className="cr-done-row">
              <span className="cr-name" style={{ flex: 1 }}>{r.name}</span>
              <span className="cr-warn" style={{ fontSize: 'var(--lp-text-xs)' }}>{r.error}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function LoginOutcome({ login }: { login: NonNullable<AddResult['login']> }) {
  const [copied, setCopied] = useState(false);
  if (login.kind === 'full') return <span className="cr-sub">Already sees every tour</span>;
  if (login.kind === 'granted') return <span className="cr-sub">This tour added to their login</span>;
  if (login.kind === 'error') return <span className="cr-warn" style={{ fontSize: 'var(--lp-text-xs)' }}>{login.error}</span>;
  return (
    <button
      type="button"
      className="cr-btn"
      onClick={() => {
        if (!login.url) return;
        void navigator.clipboard?.writeText(login.url).then(() => setCopied(true));
      }}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {copied ? 'Copied' : 'Copy invite link'}
    </button>
  );
}
