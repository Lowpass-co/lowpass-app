/* ============================================================
   LOWPASS — uniquifyFieldIds (VIS-AB-02 drag-reorder fix)

   Pure (no JSX) so it's importable by a node --experimental-strip-types test.
   Re-exported from parts/model for the builder's existing import surface.

   Ensure every field id is UNIQUE within its section. Duplicate ids (two custom
   fields slugified to the same id, or legacy/corrupt data) collide on the
   `key={f.id}` render path: React reuses the wrong node so a drag-reorder
   updates the array but never reconciles visibly. On collision the later
   duplicate is suffixed (`id__2`, `id__3`, …). Order is preserved; sections /
   fields without collisions are returned structurally unchanged, so JSON
   equality (the autosave dirty check) is undisturbed for the common no-dup case.
   ============================================================ */

import type { SectionDef } from './model';

export function uniquifyFieldIds(sections: SectionDef[]): SectionDef[] {
  return sections.map((section) => {
    const used = new Set<string>();
    let changed = false;
    const fields = (section.fields ?? []).map((f) => {
      if (!used.has(f.id)) {
        used.add(f.id);
        return f;
      }
      changed = true;
      let n = 2;
      let candidate = `${f.id}__${n}`;
      while (used.has(candidate)) {
        n += 1;
        candidate = `${f.id}__${n}`;
      }
      used.add(candidate);
      return { ...f, id: candidate };
    });
    return changed ? { ...section, fields } : section;
  });
}
