/* POST /api/tours/[id]/advance/[routingId]/packs — save a reviewed info pack.
   {
     files:        [{ path, name, mime?, size?, pageCount? }],     kept with the show
     answers:      [{ section_id, field_id, value, file, page?, quote? }],
     newQuestions: [{ label, value, section_id?, scope: 'day'|'template', file, page?, quote? }]
   }
   Every accepted answer records where it came from (file + page + quote), so
   the show page can reopen the pack at that spot. New questions are added to
   this day (and, with scope 'template', to the day's template and the days
   that follow it). One answer write, through advance_merge_answers. */

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { newFieldId, type AdvSection } from '@/lib/advance/board';
import { ensureAdvance } from '@/server/advance/ensure';
import { loadAdvanceSections } from '@/server/advance/advanceSections';
import { mergeAnswers, validateChanges, type AnswerChanges, type SourceChanges } from '@/server/advance/answers';
import { asTemplateSections, cleanSections } from '@/server/advance/sections';
import { applyTemplateToDays } from '@/server/advance/templates';
import { isOwnPackPath } from '@/server/advance/packReader';
import { advanceError, readJson, tourGate } from '@/server/advance/routeGuard';

type FileIn = { path?: unknown; name?: unknown; mime?: unknown; size?: unknown; pageCount?: unknown };
type AnswerIn = { section_id?: unknown; field_id?: unknown; value?: unknown; file?: unknown; page?: unknown; quote?: unknown };
type QuestionIn = AnswerIn & { label?: unknown; scope?: unknown };

const EXTRA_SECTION = { template_id: 'from_info_packs', label: 'From info packs' };

export async function POST(request: Request, { params }: { params: Promise<{ id: string; routingId: string }> }) {
  const { id: tourId, routingId } = await params;
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const gate = await tourGate(supabase, tourId, auth.workspaceId);
  if (gate) return gate;
  const body = await readJson<{ files?: FileIn[]; answers?: AnswerIn[]; newQuestions?: QuestionIn[] }>(request);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  const files = Array.isArray(body.files) ? body.files : [];
  const answers = Array.isArray(body.answers) ? body.answers : [];
  const newQuestions = Array.isArray(body.newQuestions) ? body.newQuestions : [];
  if (!files.length || files.length > 10) return NextResponse.json({ error: 'Send the 1–10 files you reviewed' }, { status: 400 });
  if (!files.every((f) => isOwnPackPath(f.path, auth.workspaceId, tourId))) return NextResponse.json({ error: 'Not your file' }, { status: 403 });
  if (answers.length > 500 || newQuestions.length > 30) return NextResponse.json({ error: 'Too many answers' }, { status: 400 });

  const client = supabase as unknown as SupabaseClient;
  try {
    const adv = await ensureAdvance(client, tourId, routingId, auth.user.id);

    // 1. Keep the files with the show (once per file).
    const docIds: string[] = [];
    for (const f of files) {
      const path = f.path as string;
      const { data: existing } = await client
        .from('advance_documents')
        .select('id')
        .eq('routing_id', routingId)
        .eq('storage_path', path)
        .maybeSingle<{ id: string }>();
      if (existing) {
        docIds.push(existing.id);
        continue;
      }
      const { data: doc, error } = await client
        .from('advance_documents')
        .insert({
          workspace_id: auth.workspaceId,
          tour_id: tourId,
          routing_id: routingId,
          storage_path: path,
          file_name: typeof f.name === 'string' ? f.name.slice(0, 200) : path.split('/').pop(),
          mime_type: typeof f.mime === 'string' ? f.mime.slice(0, 100) : null,
          size_bytes: typeof f.size === 'number' ? Math.round(f.size) : null,
          page_count: typeof f.pageCount === 'number' ? Math.round(f.pageCount) : null,
          created_by: auth.user.id,
        })
        .select('id')
        .single<{ id: string }>();
      if (error || !doc) throw new Error(`keep file: ${error?.message ?? 'not saved'}`);
      docIds.push(doc.id);
    }
    const fileName = (i: number) => (typeof files[i]?.name === 'string' ? (files[i].name as string) : 'Info pack');

    // 2. New questions → onto the day (and maybe its template).
    let sections = (await loadAdvanceSections(client, adv.formConfigId)) as unknown as AdvSection[];
    const added: { section_id: string; field_id: string; q: QuestionIn }[] = [];
    const toTemplate: { section_id: string; label: string; field: { id: string; label: string; type: string } }[] = [];
    if (newQuestions.length) {
      sections = sections.map((s) => ({ ...s, fields: [...(s.fields ?? [])] }));
      for (const q of newQuestions) {
        const label = typeof q.label === 'string' ? q.label.trim().slice(0, 200) : '';
        if (!label) continue;
        let target = sections.find((s) => s.template_id === q.section_id);
        if (!target) {
          target = sections.find((s) => s.template_id === EXTRA_SECTION.template_id);
          if (!target) {
            target = { ...EXTRA_SECTION, fields: [], order: sections.length };
            sections.push(target);
          }
        }
        const id = newFieldId(label, target.fields.map((f) => f.id));
        const field = { id, label, type: 'textarea', ...(q.scope === 'template' ? {} : { day_only: true }) };
        target.fields.push(field);
        added.push({ section_id: target.template_id, field_id: id, q });
        if (q.scope === 'template') toTemplate.push({ section_id: target.template_id, label: target.label, field: { id, label, type: 'textarea' } });
      }
      const cleaned = cleanSections(sections);
      if ('error' in cleaned) return NextResponse.json({ error: cleaned.error }, { status: 400 });
      sections = cleaned.sections;
      const { data: cfg } = await client
        .from('advance_form_configs')
        .select('layout_template_id')
        .eq('id', adv.formConfigId)
        .maybeSingle<{ layout_template_id: string | null }>();
      const { error } = await client
        .from('advance_form_configs')
        .update({ sections, customised: added.some((a) => a.q.scope !== 'template') ? true : undefined, updated_at: new Date().toISOString() })
        .eq('id', adv.formConfigId);
      if (error) throw new Error(error.message);
      if (toTemplate.length && cfg?.layout_template_id) {
        const { data: tpl } = await client
          .from('advance_layout_templates')
          .select('sections')
          .eq('id', cfg.layout_template_id)
          .eq('workspace_id', auth.workspaceId)
          .maybeSingle<{ sections: AdvSection[] | null }>();
        if (tpl) {
          const tsecs = (Array.isArray(tpl.sections) ? tpl.sections : []).map((s) => ({ ...s, fields: [...(s.fields ?? [])] }));
          for (const t of toTemplate) {
            let s = tsecs.find((x) => x.template_id === t.section_id);
            if (!s) {
              s = { template_id: t.section_id, label: t.label, fields: [], order: tsecs.length };
              tsecs.push(s);
            }
            if (!s.fields.some((f) => f.id === t.field.id)) s.fields.push(t.field);
          }
          await client
            .from('advance_layout_templates')
            .update({ sections: asTemplateSections(tsecs), updated_at: new Date().toISOString() })
            .eq('id', cfg.layout_template_id);
          await applyTemplateToDays(client, cfg.layout_template_id, { except: adv.formConfigId });
        }
      }
    }

    // 3. Answers + where each came from.
    const changes: AnswerChanges = {};
    const sources: SourceChanges = {};
    const used = new Map<number, number>();
    const put = (sid: string, fid: string, a: AnswerIn) => {
      const idx = typeof a.file === 'number' && a.file >= 0 && a.file < files.length ? a.file : 0;
      (changes[sid] ??= {})[fid] = a.value as unknown;
      sources[`${sid}:${fid}`] = {
        kind: 'pack',
        doc_id: docIds[idx],
        file_name: fileName(idx).slice(0, 300),
        ...(typeof a.page === 'number' && Number.isInteger(a.page) && a.page > 0 ? { page: a.page } : {}),
        ...(typeof a.quote === 'string' && a.quote ? { quote: a.quote.slice(0, 600) } : {}),
        at: new Date().toISOString(),
      };
      used.set(idx, (used.get(idx) ?? 0) + 1);
    };
    for (const a of answers) if (typeof a.section_id === 'string' && typeof a.field_id === 'string') put(a.section_id, a.field_id, a);
    for (const n of added) if (typeof n.q.value === 'string' && n.q.value.trim()) put(n.section_id, n.field_id, { ...n.q, value: n.q.value.trim().slice(0, 2000) });

    const bad = validateChanges(sections, changes, sources);
    if (bad) return NextResponse.json({ error: bad }, { status: 400 });
    const out = Object.keys(changes).length ? await mergeAnswers(client, adv.instanceId, changes, sources) : null;

    for (const [idx, n] of used) {
      await client.from('advance_documents').update({ answers_used: n }).eq('id', docIds[idx]);
    }
    return NextResponse.json({ documents: docIds, saved: answers.length + added.length, ...(out ?? {}) });
  } catch (e) {
    return advanceError(e);
  }
}
