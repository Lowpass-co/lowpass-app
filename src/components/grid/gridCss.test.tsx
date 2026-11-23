/* Every grid cell is `contain: inline-size` (#117: a cell's text never sizes
   its column). A cell that sizes ITSELF to its content (justify-self: end /
   start / center) therefore collapses to zero width — the section totals did,
   and broke every section header with figures (Nov 2026). Guard the header. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'src/components/grid/grid.css'), 'utf8');
const rule = (sel: string) => {
  const i = css.indexOf(`${sel} {`);
  expect(i, `${sel} rule`).toBeGreaterThan(-1);
  return css.slice(i, css.indexOf('}', i));
};

describe('grid section header', () => {
  it('the totals fill their span (never content-sized), on one line, within the real columns', () => {
    const r = rule('.lp-grid .sh-sub');
    expect(r).toMatch(/justify-self:\s*stretch/);
    expect(r).toMatch(/white-space:\s*nowrap/);
    expect(r).toMatch(/grid-column:\s*4\s*\/\s*-1/);
  });
  it('the name stays on one line', () => {
    expect(rule('.lp-grid .sh-name')).toMatch(/white-space:\s*nowrap/);
  });
});
