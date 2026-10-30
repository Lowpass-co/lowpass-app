/* ============================================
   LOWPASS — Advance export bodies (Oct 2026)

   Pure HTML for the two advance documents, inside the shared shell
   (renderDocument: letterhead, fonts, page size, header/footer config):

     buildAdvanceBodyHtml          one show's filled advance
     buildAdvanceQuestionsBodyHtml the questions sent to a venue, with room
                                   to answer by hand

   Sections are dispatched over config.sections (order + visibility), the same
   contract as every other export. Styles are scoped `ax-` and use the shell's
   own tokens, so B&W / borderless / font settings apply as they do elsewhere.
   Print rules keep a heading with what follows and never split a question.
   ============================================ */

import type { TemplateConfig } from '@/lib/export/template-config';
import { escapeHtml as esc, dayTypeTickHtml } from '@/lib/export/shell';
import type { AdvanceExportData, AdvanceQuestionsData, QuestionRow } from '@/lib/export/advance-data';

const STYLE = `<style>
.ax-sec { margin: 0 0 18px; }
.ax-kicker { font-size: 8.5px; font-weight: 700; letter-spacing: 0.7px; text-transform: uppercase; color: var(--lp-orange); margin: 0 0 6px; }
.ax-hero { display: flex; gap: 18px; align-items: stretch; padding: 14px 16px; border: 1px solid var(--lp-border); border-radius: 10px; background: var(--lp-bg-subtle); break-inside: avoid; }
.ax-hero-main { flex: 1 1 auto; min-width: 0; }
.ax-when { display: flex; align-items: center; gap: 8px; font-size: 10px; color: var(--lp-text-secondary); font-weight: 600; }
.ax-venue { font-size: 20px; font-weight: 800; line-height: 1.15; margin: 4px 0 2px; color: var(--lp-text); }
.ax-addr { font-size: 10px; color: var(--lp-text-secondary); }
.ax-reach { font-size: 9.5px; color: var(--lp-text-tertiary); margin-top: 4px; }
.ax-hero-side { flex: 0 0 170px; display: flex; flex-direction: column; justify-content: center; gap: 6px; border-left: 1px solid var(--lp-border); padding-left: 16px; }
.ax-big { font-size: 22px; font-weight: 800; line-height: 1; color: var(--lp-text); font-variant-numeric: tabular-nums; }
.ax-big small { font-size: 11px; font-weight: 600; color: var(--lp-text-tertiary); }
.ax-bar { height: 5px; border-radius: 3px; background: var(--lp-border); overflow: hidden; }
.ax-bar > span { display: block; height: 100%; background: var(--lp-orange); border-radius: 3px; }
.ax-muted { color: var(--lp-text-tertiary); }
.ax-tag { display: inline-block; font-size: 8px; font-weight: 700; letter-spacing: 0.4px; text-transform: uppercase; padding: 2px 6px; border-radius: 999px; border: 1px solid var(--lp-border-strong); color: var(--lp-text-secondary); }
.ax-group { margin: 0 0 14px; break-inside: auto; }
.ax-group-head { display: flex; align-items: baseline; gap: 8px; padding: 0 0 5px; margin: 0 0 2px; border-bottom: 1.5px solid var(--lp-text); break-after: avoid; }
.ax-group-head h3 { margin: 0; font-size: 12px; font-weight: 800; color: var(--lp-text); }
.ax-count { font-size: 9px; font-weight: 700; color: var(--lp-text-tertiary); font-variant-numeric: tabular-nums; }
.ax-count.ax-done { color: #1f7a4d; }
.ax-qa { display: grid; grid-template-columns: 36% 1fr; }
.ax-qa > div { padding: 5px 0; border-bottom: 1px solid var(--lp-border); break-inside: avoid; }
.ax-qa .ax-q { color: var(--lp-text-secondary); padding-right: 12px; }
.ax-qa .ax-a { color: var(--lp-text); font-weight: 600; white-space: pre-wrap; }
.ax-qa .ax-a.ax-empty { font-weight: 400; font-style: italic; color: var(--lp-text-tertiary); }
.ax-src { display: block; font-size: 8px; font-weight: 400; font-style: normal; color: var(--lp-text-tertiary); margin-top: 1px; }
.ax-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.ax-card { border: 1px solid var(--lp-border); border-radius: 8px; padding: 9px 11px; break-inside: avoid; }
.ax-card h4 { margin: 0 0 4px; font-size: 8.5px; font-weight: 700; letter-spacing: 0.6px; text-transform: uppercase; color: var(--lp-text-tertiary); }
.ax-card p { margin: 0 0 3px; }
.ax-callout { display: flex; gap: 14px; align-items: center; padding: 12px 14px; border-radius: 10px; border: 1px solid color-mix(in srgb, var(--lp-orange) 40%, transparent); background: color-mix(in srgb, var(--lp-orange) 6%, transparent); break-inside: avoid; }
.ax-callout b { font-size: 11px; }
.ax-link { font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 9px; color: var(--lp-orange); word-break: break-all; }
.ax-ask { padding: 7px 0 9px; border-bottom: 1px solid var(--lp-border); break-inside: avoid; }
.ax-ask-label { font-weight: 700; color: var(--lp-text); font-size: 10.5px; }
.ax-ask-help { font-size: 9px; color: var(--lp-text-tertiary); margin-top: 1px; }
.ax-line { height: 22px; border-bottom: 1px solid var(--lp-border-strong); }
.ax-box { min-height: 22px; border: 1px solid var(--lp-border-strong); border-radius: 5px; margin-top: 5px; padding: 4px 7px; }
.ax-box.ax-tall { min-height: 62px; }
.ax-box.ax-short { width: 110px; }
.ax-prefill { color: var(--lp-text-secondary); white-space: pre-wrap; }
.ax-confirm { font-size: 8px; color: var(--lp-text-tertiary); margin-top: 2px; }
.ax-ticks { display: flex; flex-wrap: wrap; gap: 6px 16px; margin-top: 6px; }
.ax-tick { display: inline-flex; align-items: center; gap: 5px; }
.ax-tick i { display: inline-block; width: 10px; height: 10px; border: 1px solid var(--lp-text-secondary); border-radius: 2px; }
.ax-tick i.ax-on { background: var(--lp-text); border-color: var(--lp-text); }
.ax-time { display: inline-flex; align-items: center; gap: 4px; margin-top: 6px; }
.ax-time span.ax-cell { display: inline-block; width: 30px; height: 20px; border: 1px solid var(--lp-border-strong); border-radius: 4px; }
.ax-fill td { height: 22px; }
</style>`;

/* ---------- shared bits ---------- */

const DAY_FMT = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
function longDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : DAY_FMT.format(d);
}
const SHORT_FMT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
function shortDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso.length > 10 ? iso : `${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? '' : SHORT_FMT.format(d);
}

function heroHtml(d: AdvanceExportData | AdvanceQuestionsData, side: string): string {
  const v = d.show.venue;
  const reach = [v.phone, v.website?.replace(/^https?:\/\//, '').replace(/\/$/, '')].filter(Boolean).map((x) => esc(x as string)).join(' · ');
  return `<div class="ax-hero">
    <div class="ax-hero-main">
      <div class="ax-when">${esc(longDate(d.show.date))} ${dayTypeTickHtml(d.show.dayType)}</div>
      <div class="ax-venue">${esc(v.name ?? d.show.city ?? 'Show')}</div>
      ${v.address ? `<div class="ax-addr">${esc(v.address)}</div>` : v.city ? `<div class="ax-addr">${esc(v.city)}</div>` : ''}
      ${reach ? `<div class="ax-reach">${reach}</div>` : ''}
    </div>
    ${side}
  </div>`;
}

/* ---------- filled advance ---------- */

function overviewHtml(d: AdvanceExportData): string {
  const { answered, total } = d.progress;
  const pct = total ? Math.round((answered / total) * 100) : 0;
  const side = `<div class="ax-hero-side">
      <div class="ax-big">${answered}<small> / ${total} answered</small></div>
      <div class="ax-bar"><span style="width:${pct}%"></span></div>
      ${d.show.templateName ? `<div class="ax-muted" style="font-size:9px;">${esc(d.show.templateName)} template</div>` : ''}
    </div>`;
  return `<div class="ax-sec">${heroHtml(d, side)}</div>`;
}

function answersHtml(d: AdvanceExportData, config: TemplateConfig): string {
  const hide = config.advance?.unanswered === 'hide';
  const groups = d.groups
    .map((g) => ({ ...g, rows: hide ? g.rows.filter((r) => r.value) : g.rows }))
    .filter((g) => g.rows.length);
  if (!groups.length) return `<div class="ax-sec"><div class="ax-kicker">Advance</div><p class="ax-muted">${hide ? 'No answers yet.' : 'This day has no questions.'}</p></div>`;
  const body = groups
    .map((g) => {
      const done = g.total > 0 && g.answered === g.total;
      const rows = g.rows
        .map((r) => {
          const a = r.value
            ? `<div class="ax-a">${esc(r.value)}${r.source ? `<span class="ax-src">${esc(r.source)}</span>` : ''}</div>`
            : `<div class="ax-a ax-empty">Not answered yet</div>`;
          return `<div class="ax-q">${esc(r.label)}</div>${a}`;
        })
        .join('');
      return `<div class="ax-group">
        <div class="ax-group-head"><h3>${esc(g.label)}</h3><span class="ax-count${done ? ' ax-done' : ''}">${done ? '✓ ' : ''}${g.answered}/${g.total}</span>${g.tmOnly ? '<span class="ax-tag">Only you</span>' : ''}</div>
        <div class="ax-qa">${rows}</div>
      </div>`;
    })
    .join('');
  return `<div class="ax-sec"><div class="ax-kicker">Advance</div>${body}</div>`;
}

function contactsHtml(d: AdvanceExportData): string {
  if (!d.contacts.length) return '';
  const rows = d.contacts
    .map((c) => `<tr><td><b>${esc(c.name || '—')}</b></td><td>${esc(c.role)}</td><td>${esc(c.phone)}</td><td>${esc(c.email)}</td></tr>`)
    .join('');
  return `<div class="ax-sec" style="break-inside:avoid;"><div class="ax-kicker">Key contacts</div>
    <table class="lp-tbl"><thead><tr><th>Name</th><th>Role</th><th>Phone</th><th>Email</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function crewCallsHtml(d: AdvanceExportData): string {
  if (!d.crewCalls.length) return '';
  const rows = d.crewCalls
    .map((c) => {
      const contact = [c.company, c.contact_name, c.contact_phone].filter(Boolean).map((x) => esc(x)).join(' · ');
      const notes = [c.meal_break_notes, c.union_notes, c.notes].filter(Boolean).map((x) => esc(x)).join(' · ');
      return `<tr><td><b>${esc(c.department || '—')}</b></td><td class="num">${esc(c.call_time ?? '')}</td><td class="num">${c.headcount ?? ''}</td><td>${contact}</td><td>${notes}</td></tr>`;
    })
    .join('');
  return `<div class="ax-sec" style="break-inside:avoid;"><div class="ax-kicker">Local crew calls</div>
    <table class="lp-tbl"><thead><tr><th>Department</th><th class="num">Call</th><th class="num">Heads</th><th>Company / contact</th><th>Notes</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function logisticsHtml(d: AdvanceExportData): string {
  const { hotels, flights, deal } = d.linked;
  if (!hotels.length && !flights.length && !deal) return '';
  const hotel = hotels.length
    ? hotels.map((h) => `<p><b>${esc(h.name)}</b></p><p class="ax-muted">${esc([shortDate(h.checkIn), shortDate(h.checkOut)].filter(Boolean).join(' → '))}${h.rooms ? ` · ${h.rooms} room${h.rooms === 1 ? '' : 's'}` : ''}</p>`).join('')
    : '<p class="ax-muted">None booked</p>';
  const travel = flights.length ? flights.map((f) => `<p>${esc(f.label)}</p>`).join('') : '<p class="ax-muted">No flights</p>';
  const status = deal?.status ? deal.status.charAt(0).toUpperCase() + deal.status.slice(1).replace(/_/g, ' ') : '';
  const dealHtml = deal ? `<p><b>${esc(deal.title)}</b></p>${status ? `<p class="ax-muted">${esc(status)}</p>` : ''}` : '<p class="ax-muted">No deal memo</p>';
  return `<div class="ax-sec"><div class="ax-kicker">Hotel, travel &amp; deal</div>
    <div class="ax-cards"><div class="ax-card"><h4>Hotel</h4>${hotel}</div><div class="ax-card"><h4>Travel</h4>${travel}</div><div class="ax-card"><h4>Deal</h4>${dealHtml}</div></div></div>`;
}

function documentsHtml(d: AdvanceExportData): string {
  if (!d.documents.length) return '';
  const rows = d.documents.map((x) => `<tr><td>${esc(x.name)}</td><td class="num">${x.pages ?? ''}</td><td class="num">${esc(shortDate(x.added))}</td></tr>`).join('');
  return `<div class="ax-sec" style="break-inside:avoid;"><div class="ax-kicker">Venue documents</div>
    <table class="lp-tbl"><thead><tr><th>File</th><th class="num">Pages</th><th class="num">Added</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

export function buildAdvanceBodyHtml(d: AdvanceExportData, config: TemplateConfig): string {
  const parts = config.sections
    .filter((s) => s.show)
    .map((s) => {
      if (s.id === 'overview') return overviewHtml(d);
      if (s.id === 'answers') return answersHtml(d, config);
      if (s.id === 'contacts') return contactsHtml(d);
      if (s.id === 'crew-calls') return crewCallsHtml(d);
      if (s.id === 'logistics') return logisticsHtml(d);
      if (s.id === 'documents') return documentsHtml(d);
      return '';
    });
  return STYLE + parts.join('');
}

/* ---------- venue question sheet ---------- */

const CONTACT_ROLES = ['Production manager', 'Venue manager / promoter rep', 'Sound', 'Lighting', 'Hospitality', 'Security'];

function introHtml(d: AdvanceQuestionsData): string {
  const side = `<div class="ax-hero-side"><div class="ax-big">${d.groups.reduce((n, g) => n + g.rows.length, 0)}<small> questions</small></div>${d.recipientName ? `<div class="ax-muted" style="font-size:9px;">For ${esc(d.recipientName)}</div>` : ''}</div>`;
  const how = d.link
    ? `<div class="ax-callout"><div style="flex:1;min-width:0;"><b>Quicker online</b><div class="ax-muted" style="margin:2px 0 4px;">Answer at this link — no login. Or write your answers on this sheet and send it back.</div><div class="ax-link">${esc(d.link)}</div></div></div>`
    : `<div class="ax-callout"><div><b>Please answer the questions below</b><div class="ax-muted" style="margin-top:2px;">Write in the boxes and send this sheet back to us.</div></div></div>`;
  return `<div class="ax-sec">${heroHtml(d, side)}</div><div class="ax-sec">${how}</div>`;
}

function answerArea(q: QuestionRow, prefill: boolean): string {
  const cur = prefill ? q.current : null;
  const confirm = cur ? '<div class="ax-confirm">What we have — please correct it if it’s wrong.</div>' : '';
  const box = (cls: string) => `<div class="ax-box ${cls}">${cur ? `<span class="ax-prefill">${esc(cur)}</span>` : ''}</div>${confirm}`;
  switch (q.type) {
    case 'textarea':
      return box('ax-tall');
    case 'boolean':
    case 'checkbox': {
      const yes = cur === 'Yes';
      const no = cur === 'No';
      return `<div class="ax-ticks"><span class="ax-tick"><i class="${yes ? 'ax-on' : ''}"></i>Yes</span><span class="ax-tick"><i class="${no ? 'ax-on' : ''}"></i>No</span></div>${confirm}`;
    }
    case 'select':
      if (q.options.length) {
        return `<div class="ax-ticks">${q.options.map((o) => `<span class="ax-tick"><i class="${cur === o ? 'ax-on' : ''}"></i>${esc(o)}</span>`).join('')}</div>${confirm}`;
      }
      return box('');
    case 'time':
      return cur ? box('ax-short') : `<div class="ax-time"><span class="ax-cell"></span>:<span class="ax-cell"></span></div>`;
    case 'date':
    case 'number':
    case 'currency':
      return box('ax-short');
    case 'labor_call':
      return `<table class="lp-tbl ax-fill" style="margin-top:6px;"><thead><tr><th>Department</th><th>Call time</th><th>Heads</th><th>Notes</th></tr></thead><tbody>${'<tr><td></td><td></td><td></td><td></td></tr>'.repeat(3)}</tbody></table>`;
    default:
      return box('');
  }
}

function questionsHtml(d: AdvanceQuestionsData, config: TemplateConfig): string {
  const prefill = config.advance?.prefill === true;
  if (!d.groups.length) return `<div class="ax-sec"><p class="ax-muted">No questions to ask.</p></div>`;
  const body = d.groups
    .map(
      (g) => `<div class="ax-group">
      <div class="ax-group-head"><h3>${esc(g.label)}</h3><span class="ax-count">${g.rows.length}</span></div>
      ${g.rows
        .map(
          (q) => `<div class="ax-ask"><div class="ax-ask-label">${esc(q.label)}</div>${q.help ? `<div class="ax-ask-help">${esc(q.help)}</div>` : ''}${answerArea(q, prefill)}</div>`,
        )
        .join('')}
    </div>`,
    )
    .join('');
  return `<div class="ax-sec"><div class="ax-kicker">Questions</div>${body}</div>`;
}

function contactsBlankHtml(): string {
  const rows = [...CONTACT_ROLES, '', '']
    .map((r) => `<tr><td><b>${esc(r)}</b></td><td></td><td></td><td></td></tr>`)
    .join('');
  return `<div class="ax-sec" style="break-inside:avoid;"><div class="ax-kicker">Your contacts on the day</div>
    <table class="lp-tbl ax-fill"><thead><tr><th style="width:26%">Role</th><th>Name</th><th>Phone</th><th>Email</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

export function buildAdvanceQuestionsBodyHtml(d: AdvanceQuestionsData, config: TemplateConfig): string {
  const parts = config.sections
    .filter((s) => s.show)
    .map((s) => {
      if (s.id === 'intro') return introHtml(d);
      if (s.id === 'questions') return questionsHtml(d, config);
      if (s.id === 'contacts-blank') return contactsBlankHtml();
      return '';
    });
  return STYLE + parts.join('');
}
