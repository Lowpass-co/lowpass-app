/* node --experimental-strip-types src/components/advance/parts/uniquifyFieldIds.test.ts

   Characterization test for the VIS-AB-02 drag-reorder fix: field ids must be
   unique within a section so React key={f.id} reconciles a reorder. Locks the
   suffixing rule + the no-churn guarantee for the common (no-dup) case.
*/

import assert from 'node:assert';
import { uniquifyFieldIds } from './uniquifyFieldIds.ts';
import type { SectionDef } from './model.ts';

let pass = 0;
const check = (label: string, cond: boolean) => {
  assert.ok(cond, label);
  pass++;
};

const mk = (fieldIds: string[]): SectionDef =>
  ({
    template_id: 's1',
    label: 'Sec',
    order: 0,
    fields: fieldIds.map((id) => ({ id, label: id, type: 'text' })),
  }) as unknown as SectionDef;

/* No duplicates → returned structurally unchanged (same refs → JSON-equal, no
   spurious autosave). */
{
  const input = [mk(['a', 'b', 'c'])];
  const out = uniquifyFieldIds(input);
  check('no-dup: section ref unchanged', out[0] === input[0]);
  check('no-dup: ids intact', out[0].fields!.map((f) => f.id).join(',') === 'a,b,c');
}

/* One duplicate → later occurrence suffixed; first keeps its id. */
{
  const out = uniquifyFieldIds([mk(['notes', 'notes'])]);
  const ids = out[0].fields!.map((f) => f.id);
  check('dup: first keeps id', ids[0] === 'notes');
  check('dup: second suffixed', ids[1] === 'notes__2');
  check('dup: all unique', new Set(ids).size === ids.length);
}

/* Triple + collision with an existing suffixed id → keeps incrementing. */
{
  const out = uniquifyFieldIds([mk(['x', 'x', 'x', 'x__2'])]);
  const ids = out[0].fields!.map((f) => f.id);
  check('triple: unique set', new Set(ids).size === 4);
  check('triple: no id lost from the first', ids[0] === 'x');
  check('triple: pre-existing x__2 preserved as its own key', ids.includes('x__2'));
}

/* Independent per section — same id across sections is fine. */
{
  const out = uniquifyFieldIds([mk(['a', 'a']), mk(['a'])]);
  check('per-section: sec0 deduped', new Set(out[0].fields!.map((f) => f.id)).size === 2);
  check('per-section: sec1 untouched', out[1].fields![0].id === 'a');
}

/* Empty / missing fields tolerated. */
{
  const out = uniquifyFieldIds([{ template_id: 's', label: 's', order: 0 } as unknown as SectionDef]);
  check('empty: no throw, section returned', out.length === 1);
}

console.log(`uniquifyFieldIds.test.ts — ${pass} assertions passed`);
