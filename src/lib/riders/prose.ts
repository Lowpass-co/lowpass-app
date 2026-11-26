/* ============================================
   LOWPASS — Riders: prose (Tiptap StarterKit JSON) — pure

   The one gate for prose: `cleanDoc` keeps the StarterKit subset the editor
   writes (paragraphs, headings, lists, quotes, rules, hard breaks; bold,
   italic, underline, strike, code, links to http(s) / mailto / tel) and turns
   anything else into its text — so a pasted or bring-over document can never
   carry a node the renderers don't know, or a javascript: link.
   `proseHtml` is the PDF's renderer (every text escaped); the screen renders
   the same JSON as React (components/riders/ProseView.tsx).
   ============================================ */

import type { ProseDoc, ProseMark, ProseNode } from './types';

const BLOCKS = new Set(['paragraph', 'heading', 'bulletList', 'orderedList', 'listItem', 'blockquote', 'horizontalRule']);
const MARKS = new Set(['bold', 'italic', 'underline', 'strike', 'code', 'link']);
const MAX_NODES = 4000;
const MAX_TEXT = 20_000;

export function emptyDoc(): ProseDoc {
  return { type: 'doc', content: [{ type: 'paragraph' }] };
}

export function safeHref(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const h = v.trim();
  if (!h || h.length > 2000) return null;
  return /^(https?:\/\/|mailto:|tel:)/i.test(h) ? h : null;
}

function cleanMarks(raw: unknown): ProseMark[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: ProseMark[] = [];
  for (const m of raw) {
    const type = (m as ProseMark)?.type;
    if (!MARKS.has(type)) continue;
    if (type === 'link') {
      const href = safeHref((m as ProseMark).attrs?.href);
      if (href) out.push({ type, attrs: { href } });
    } else out.push({ type });
  }
  return out.length ? out : undefined;
}

/** Text of any node (used when a node isn't allowed: keep the words). */
function textOf(n: unknown): string {
  if (!n || typeof n !== 'object') return '';
  const node = n as ProseNode;
  if (typeof node.text === 'string') return node.text;
  const label = node.attrs && typeof node.attrs.label === 'string' ? node.attrs.label : '';
  if (label) return label;
  return Array.isArray(node.content) ? node.content.map(textOf).join('') : '';
}

export function cleanDoc(raw: unknown): ProseDoc {
  let count = 0;
  let chars = 0;
  const inline = (nodes: unknown): ProseNode[] => {
    const out: ProseNode[] = [];
    for (const n of Array.isArray(nodes) ? nodes : []) {
      if (++count > MAX_NODES) break;
      const node = n as ProseNode;
      if (node?.type === 'text' && typeof node.text === 'string' && node.text) {
        const text = node.text.slice(0, Math.max(0, MAX_TEXT - chars));
        chars += text.length;
        if (!text) continue;
        const marks = cleanMarks(node.marks);
        out.push(marks ? { type: 'text', text, marks } : { type: 'text', text });
      } else if (node?.type === 'hardBreak') {
        out.push({ type: 'hardBreak' });
      } else {
        const t = textOf(node);
        if (t) out.push({ type: 'text', text: t.slice(0, 2000) });
      }
    }
    return out;
  };
  const block = (n: unknown): ProseNode[] => {
    if (++count > MAX_NODES) return [];
    const node = n as ProseNode;
    const type = node?.type;
    if (type === 'paragraph') {
      const c = inline(node.content);
      return [c.length ? { type, content: c } : { type }];
    }
    if (type === 'heading') {
      const level = Math.min(4, Math.max(2, Number(node.attrs?.level) || 3));
      return [{ type, attrs: { level }, content: inline(node.content) }];
    }
    if (type === 'bulletList' || type === 'orderedList') {
      const items = (Array.isArray(node.content) ? node.content : []).flatMap((li) => {
        const kids = (li as ProseNode)?.type === 'listItem' ? (li as ProseNode).content : [li];
        const content = (Array.isArray(kids) ? kids : []).flatMap(block);
        return content.length ? [{ type: 'listItem', content }] : [];
      });
      if (!items.length) return [];
      const start = type === 'orderedList' && Number(node.attrs?.start) > 1 ? { start: Math.floor(Number(node.attrs?.start)) } : undefined;
      return [start ? { type, attrs: start, content: items } : { type, content: items }];
    }
    if (type === 'blockquote') {
      const content = (Array.isArray(node.content) ? node.content : []).flatMap(block);
      return content.length ? [{ type, content }] : [];
    }
    if (type === 'horizontalRule') return [{ type }];
    if (type === 'text' || type === 'hardBreak') return [{ type: 'paragraph', content: inline([node]) }];
    if (type === 'doc' || (type && !BLOCKS.has(type) && Array.isArray(node.content))) {
      return (node.content ?? []).flatMap(block);
    }
    const t = textOf(node);
    return t ? [{ type: 'paragraph', content: [{ type: 'text', text: t.slice(0, 2000) }] }] : [];
  };
  const root = raw as ProseNode;
  const content = root && Array.isArray(root.content) ? root.content.flatMap(block) : [];
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}

/** Plain text: blocks on their own lines, list items as "• ". */
export function proseText(doc: ProseDoc | null | undefined): string {
  if (!doc) return '';
  const lines: string[] = [];
  const walk = (nodes: ProseNode[] | undefined, prefix = '') => {
    for (const n of nodes ?? []) {
      if (n.type === 'paragraph' || n.type === 'heading') lines.push(prefix + inlineText(n.content));
      else if (n.type === 'bulletList' || n.type === 'orderedList') {
        (n.content ?? []).forEach((li, i) => walk(li.content, n.type === 'orderedList' ? `${i + 1}. ` : '• '));
      } else if (n.type === 'blockquote') walk(n.content, prefix);
      else if (n.type === 'horizontalRule') lines.push('—');
    }
  };
  walk(doc.content);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function inlineText(nodes: ProseNode[] | undefined): string {
  return (nodes ?? []).map((n) => (n.type === 'hardBreak' ? '\n' : n.text ?? '')).join('');
}

/** Text → doc: a line per paragraph; "- " / "• " lines become a bullet list. */
export function docFromText(text: string): ProseDoc {
  const content: ProseNode[] = [];
  let list: ProseNode | null = null;
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    const bullet = /^\s*[-•*]\s+(.*)$/.exec(line);
    if (bullet) {
      if (!list) {
        list = { type: 'bulletList', content: [] };
        content.push(list);
      }
      list.content!.push({ type: 'listItem', content: [{ type: 'paragraph', content: bullet[1] ? [{ type: 'text', text: bullet[1] }] : undefined }] });
      continue;
    }
    list = null;
    if (!line.trim()) continue;
    content.push({ type: 'paragraph', content: [{ type: 'text', text: line.trim() }] });
  }
  return cleanDoc({ type: 'doc', content });
}

export function isEmptyDoc(doc: ProseDoc | null | undefined): boolean {
  return !proseText(doc).trim();
}

/* ---------- HTML (the PDF) ---------- */

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function inlineHtml(nodes: ProseNode[] | undefined): string {
  return (nodes ?? [])
    .map((n) => {
      if (n.type === 'hardBreak') return '<br>';
      let html = esc(n.text ?? '');
      for (const m of n.marks ?? []) {
        if (m.type === 'bold') html = `<strong>${html}</strong>`;
        else if (m.type === 'italic') html = `<em>${html}</em>`;
        else if (m.type === 'underline') html = `<u>${html}</u>`;
        else if (m.type === 'strike') html = `<s>${html}</s>`;
        else if (m.type === 'code') html = `<code>${html}</code>`;
        else if (m.type === 'link') {
          const href = safeHref(m.attrs?.href);
          if (href) html = `<a href="${esc(href)}">${html}</a>`;
        }
      }
      return html;
    })
    .join('');
}

export function proseHtml(doc: ProseDoc | null | undefined): string {
  const walk = (nodes: ProseNode[] | undefined): string =>
    (nodes ?? [])
      .map((n) => {
        switch (n.type) {
          case 'paragraph':
            return `<p>${inlineHtml(n.content) || '&nbsp;'}</p>`;
          case 'heading': {
            const l = Math.min(4, Math.max(2, Number(n.attrs?.level) || 3)) + 1;
            return `<h${l}>${inlineHtml(n.content)}</h${l}>`;
          }
          case 'bulletList':
            return `<ul>${walk(n.content)}</ul>`;
          case 'orderedList':
            return `<ol${Number(n.attrs?.start) > 1 ? ` start="${Math.floor(Number(n.attrs?.start))}"` : ''}>${walk(n.content)}</ol>`;
          case 'listItem':
            return `<li>${walk(n.content)}</li>`;
          case 'blockquote':
            return `<blockquote>${walk(n.content)}</blockquote>`;
          case 'horizontalRule':
            return '<hr>';
          default:
            return '';
        }
      })
      .join('');
  return doc ? walk(doc.content) : '';
}
