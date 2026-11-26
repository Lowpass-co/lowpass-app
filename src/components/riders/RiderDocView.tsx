/* ============================================
   LOWPASS — <RiderDocView> — a rider as it reads (screen)

   The screen twin of lib/riders/render.ts's PDF renderer: the same model
   (`docModel`), the same classes, the same stylesheet (`RIDER_DOC_CSS`,
   injected once by <RiderDocStyles>). Used by the promoter page and the
   editor's preview. No hooks — server or client.
   `lineExtras` lets the promoter page hang replies under a request line;
   `fileHref` turns an attachment into a link; `photoUrl` shows a line's
   photo (signed URLs — the page signs them); `onItem` makes a line with a
   photo / exact-item link open its card. The input list and stage plot
   render inline (the plot as an <img> only — see lib/riders/embeds.ts).
   ============================================ */

import type { ReactNode } from 'react';
import { embedName, svgDataUri } from '@/lib/riders/embeds';
import { safeHref } from '@/lib/riders/prose';
import { RIDER_DOC_CSS, inputsCount, runsOf, stateText, type DocItem, type DocModel, type RiderHeader } from '@/lib/riders/render';
import type { EmbedStagePlot, EmbedTable, ProseNode, ResolvedAttachment } from '@/lib/riders/types';

type RequestItem = Extract<DocItem, { t: 'request' }>;

export function RiderDocStyles() {
  return <style dangerouslySetInnerHTML={{ __html: RIDER_DOC_CSS }} />;
}

function Inline({ nodes }: { nodes: ProseNode[] | undefined }) {
  return (
    <>
      {(nodes ?? []).map((n, i) => {
        if (n.type === 'hardBreak') return <br key={i} />;
        let el: ReactNode = n.text ?? '';
        for (const m of n.marks ?? []) {
          if (m.type === 'bold') el = <strong>{el}</strong>;
          else if (m.type === 'italic') el = <em>{el}</em>;
          else if (m.type === 'underline') el = <u>{el}</u>;
          else if (m.type === 'strike') el = <s>{el}</s>;
          else if (m.type === 'code') el = <code>{el}</code>;
          else if (m.type === 'link') {
            const href = safeHref(m.attrs?.href);
            if (href) el = <a href={href} target="_blank" rel="noopener noreferrer">{el}</a>;
          }
        }
        return <span key={i}>{el}</span>;
      })}
    </>
  );
}

export function ProseView({ nodes }: { nodes: ProseNode[] | undefined }) {
  return (
    <>
      {(nodes ?? []).map((n, i) => {
        switch (n.type) {
          case 'paragraph':
            return <p key={i}>{n.content?.length ? <Inline nodes={n.content} /> : ' '}</p>;
          case 'heading': {
            const level = Math.min(4, Math.max(2, Number(n.attrs?.level) || 3)) + 1;
            const H = `h${level}` as 'h3' | 'h4' | 'h5';
            return <H key={i}><Inline nodes={n.content} /></H>;
          }
          case 'bulletList':
            return <ul key={i}><ProseView nodes={n.content} /></ul>;
          case 'orderedList':
            return <ol key={i} start={Number(n.attrs?.start) > 1 ? Number(n.attrs?.start) : undefined}><ProseView nodes={n.content} /></ol>;
          case 'listItem':
            return <li key={i}><ProseView nodes={n.content} /></li>;
          case 'blockquote':
            return <blockquote key={i}><ProseView nodes={n.content} /></blockquote>;
          case 'horizontalRule':
            return <hr key={i} />;
          default:
            return null;
        }
      })}
    </>
  );
}

const Tag = ({ tag }: { tag: string | null }) => (tag ? <span className="rd-tag">{tag}</span> : null);

function ItemText({ r, photoUrl, onItem }: { r: RequestItem; photoUrl?: (path: string) => string | null; onItem?: (r: RequestItem) => void }) {
  const thumb = r.photo && photoUrl ? photoUrl(r.photo) : null;
  if (onItem && (r.link || thumb)) {
    return (
      <button type="button" className="rd-itembtn" onClick={() => onItem(r)} aria-label={`${r.item} — photo and details`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a signed storage URL, sized by CSS */}
        {thumb ? <img className="rd-thumb" src={thumb} alt="" loading="lazy" /> : null}
        <span>{r.item}</span>
      </button>
    );
  }
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- a signed storage URL, sized by CSS */}
      {thumb ? <img className="rd-thumb" src={thumb} alt="" loading="lazy" /> : null}
      {r.link ? (
        <a href={r.link} target="_blank" rel="noopener noreferrer nofollow">
          {r.item}
        </a>
      ) : (
        r.item
      )}
    </>
  );
}

export function RequestLine({
  r,
  extras,
  photoUrl,
  onItem,
}: {
  r: RequestItem;
  extras?: ReactNode;
  photoUrl?: (path: string) => string | null;
  onItem?: (r: RequestItem) => void;
}) {
  return (
    <li className="rd-req" data-state={r.state?.state} id={`line-${r.id}`}>
      <span className={`rd-qty${r.qty ? '' : ' rd-qty-none'}`}>{r.qty ?? '—'}</span>
      <span className="rd-item">
        <ItemText r={r} photoUrl={photoUrl} onItem={onItem} />
      </span>
      <span className="rd-side">
        {r.state ? (
          <span className="rd-state" data-state={r.state.state}>
            {stateText(r.state)}
          </span>
        ) : null}
        {r.provider ? (
          <span className="rd-who" data-who={r.providerId ?? undefined}>
            {r.provider}
          </span>
        ) : null}
        {r.optional ? <span className="rd-opt">If possible</span> : null}
        <Tag tag={r.tag} />
      </span>
      {r.alternatives || r.perPerson || r.note ? (
        <span className="rd-sub">
          {r.alternatives ? (
            <span>
              <i>Or</i> {r.alternatives}
            </span>
          ) : null}
          {r.perPerson ? <span>{r.perPerson}</span> : null}
          {r.note ? <span>{r.note}</span> : null}
        </span>
      ) : null}
      {extras}
    </li>
  );
}

function Table({ t }: { t: EmbedTable }) {
  return (
    <div className="rd-scroll">
      <table className="rd-table rd-inputs">
        <thead>
          <tr>
            {t.columns.map((c, i) => (
              <th key={i}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {t.rows.map((r, ri) => (
            <tr key={ri}>
              {r.map((c, ci) => (
                <td key={ci}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmbedHead({ title, meta }: { title: string; meta: string | null }) {
  return (
    <div className="rd-embed-head">
      <span className="rd-embed-title">{title}</span>
      {meta ? <span className="rd-embed-meta">{meta}</span> : null}
    </div>
  );
}

function Others({ others }: { others: string[] }) {
  return others.length ? <div className="rd-embed-note">Different for: {others.join(' · ')}</div> : null;
}

export function InputsView({ it }: { it: Extract<DocItem, { t: 'inputs' }> }) {
  const l = it.list;
  return (
    <section className="rd-embed" id={`sec-${it.id}`}>
      <EmbedHead title="Input list" meta={l ? `${embedName(l)} · ${inputsCount(l)}` : null} />
      {l ? (
        <>
          <Table t={l.inputs} />
          {it.outputs && l.outputs && l.outputs.rows.length ? (
            <>
              <div className="rd-embed-sub">Outputs (IEM / mixes)</div>
              <Table t={l.outputs} />
            </>
          ) : null}
        </>
      ) : (
        <div className="rd-embed-none">The input list will follow.</div>
      )}
      <Others others={it.others} />
    </section>
  );
}

/** The plot's data URI, made once per copy (it can be megabytes, and the
 *  editor re-renders on every keystroke). No hooks: this file renders on the
 *  server too. */
const PLOT_SRC = new WeakMap<object, string>();
function plotSrc(plot: EmbedStagePlot): string {
  let src = PLOT_SRC.get(plot);
  if (!src) {
    src = svgDataUri(plot.svg);
    PLOT_SRC.set(plot, src);
  }
  return src;
}

export function PlotView({ it }: { it: Extract<DocItem, { t: 'plot' }> }) {
  return (
    <section className={it.plot ? 'rd-embed rd-embed-plot' : 'rd-embed'} id={`sec-${it.id}`}>
      <EmbedHead title="Stage plot" meta={it.plot ? embedName(it.plot) : null} />
      {it.plot ? (
        <figure className="rd-plot">
          {/* An <img>, never inline SVG: a custom icon is uploaded SVG and an image can't run anything. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="Stage plot" src={plotSrc(it.plot)} />
        </figure>
      ) : (
        <div className="rd-embed-none">The stage plot will follow.</div>
      )}
      <Others others={it.others} />
    </section>
  );
}

function FileLine({ a, href }: { a: ResolvedAttachment; href: string | null }) {
  if (!a.id) return <li className="rd-file"><span className="rd-file-missing">{a.label} — not attached yet</span></li>;
  return (
    <li className="rd-file">
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer">
          {a.label}
        </a>
      ) : (
        <span>{a.label}</span>
      )}
    </li>
  );
}

export function RiderDocView({
  model,
  header,
  lineExtras,
  fileHref,
  photoUrl,
  onItem,
}: {
  model: DocModel;
  header: RiderHeader;
  lineExtras?: (r: RequestItem) => ReactNode;
  fileHref?: (a: ResolvedAttachment) => string | null;
  photoUrl?: (path: string) => string | null;
  onItem?: (r: RequestItem) => void;
}) {
  return (
    <article className="rd-doc">
      <header className="rd-head">
        {header.artist ? <div className="rd-artist">{header.artist}</div> : null}
        <h1 className="rd-title">{model.title}</h1>
        <div className="rd-meta">
          <b>{header.version}</b>
          {header.show ? ` · ${header.show}` : ''}
        </div>
      </header>
      {runsOf(model.items).map((run, i) => {
        if (run.t === 'requests') {
          return (
            <ul className="rd-reqs" key={`r${i}`}>
              {run.items.map((r) => (
                <RequestLine key={r.id} r={r} extras={lineExtras?.(r)} photoUrl={photoUrl} onItem={onItem} />
              ))}
            </ul>
          );
        }
        const it = run.item;
        switch (it.t) {
          case 'heading':
            return it.level === 1 ? (
              <h2 className="rd-h1" key={it.id} id={`sec-${it.id}`}>
                {it.text} <Tag tag={it.tag} />
              </h2>
            ) : (
              <h3 className="rd-h2" key={it.id} id={`sec-${it.id}`}>
                {it.text} <Tag tag={it.tag} />
              </h3>
            );
          case 'prose':
            return (
              <div className="rd-prose" key={it.id}>
                {it.tag ? (
                  <p>
                    <Tag tag={it.tag} />
                  </p>
                ) : null}
                <ProseView nodes={it.doc.content} />
              </div>
            );
          case 'table':
            return (
              <table className="rd-table" key={it.id}>
                {it.columns.some((c) => c.trim()) ? (
                  <thead>
                    <tr>
                      {it.columns.map((c, ci) => (
                        <th key={ci}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                ) : null}
                <tbody>
                  {it.rows.map((r, ri) => (
                    <tr key={ri}>
                      {r.map((c, ci) => (
                        <td key={ci} style={{ whiteSpace: 'pre-wrap' }}>
                          {c}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          case 'contacts':
            return (
              <table className="rd-contacts" key={it.id}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Role</th>
                    <th>Phone</th>
                    <th>Email</th>
                  </tr>
                </thead>
                <tbody>
                  {it.people.map((p, pi) => (
                    <tr key={pi}>
                      <td>{p.name}</td>
                      <td>{p.role}</td>
                      <td>{p.phone ? <a href={`tel:${p.phone.replace(/[^\d+]/g, '')}`}>{p.phone}</a> : null}</td>
                      <td>{p.email ? <a href={`mailto:${p.email}`}>{p.email}</a> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          case 'summary':
            return (
              <section className="rd-summary" key={it.id}>
                <div className="rd-summary-title">
                  <span>{it.title}</span>
                  {it.party ? <span className="rd-summary-party">{it.party}</span> : null}
                </div>
                {it.groups.length ? (
                  <div className="rd-summary-grid">
                    {it.groups.map((g) => (
                      <div key={g.heading}>
                        <h4>{g.heading}</h4>
                        <ul>
                          {g.lines.map((l, li) => (
                            <li key={li}>{l}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rd-summary-empty">Nothing marked for the summary yet.</div>
                )}
              </section>
            );
          case 'files':
            return (
              <ul className="rd-files" key={it.id}>
                {it.items.map((a, ai) => (
                  <FileLine key={ai} a={a} href={fileHref ? fileHref(a) : null} />
                ))}
              </ul>
            );
          case 'inputs':
            return <InputsView key={it.id} it={it} />;
          case 'plot':
            return <PlotView key={it.id} it={it} />;
          case 'break':
            return <hr className="rd-break" key={it.id} />;
          default:
            return null;
        }
      })}
    </article>
  );
}
