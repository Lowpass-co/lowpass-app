/* node --experimental-strip-types src/lib/grid/formula.test.ts */
import assert from 'node:assert';
import { evaluateFormula } from './formula.ts';

let pass = 0;
const ok = (expr: string, expected: number | null) => {
  const got = evaluateFormula(expr);
  assert.strictEqual(got, expected, `"${expr}" → ${got}, expected ${expected}`);
  pass++;
};

// basic arithmetic
ok('1+1', 2);
ok('2*3', 6);
ok('10-4', 6);
ok('10/4', 2.5);
ok('1+2*3', 7); // precedence
ok('(1+2)*3', 9); // parens
ok('2*(3+4)-1', 13);
ok('-5', -5); // unary minus
ok('-5+10', 5);
ok('3*-2', -6); // unary after operator
ok('1.5+2.5', 4);
ok('1,000+500', 1500); // thousands separators stripped
ok('  2  +  2  ', 4); // whitespace
ok('((1+1))', 2);

// malformed → null (caller falls back to the plain numeric parse)
ok('', null);
ok('1+', null);
ok('*2', null);
ok('1++2', 3); // unary plus (consistent with unary minus, e.g. 3*-2)
ok('(1+2', null);
ok('1+2)', null);
ok('1 2', null);
ok('abc', null);
ok('1/0', null); // div-by-zero → null (fall back)
ok('=1+1', null); // caller passes expr WITHOUT the leading '='

console.log(`formula: ${pass} checks passed`);
