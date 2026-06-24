/* ============================================
   LOWPASS — Grid cell formula evaluator (Grid-v2 #1)

   Spreadsheet-style arithmetic for money/number cells: typing `=1+1` commits 2.
   v1 is LITERAL arithmetic only — no cell references (`=A1+B2` is out of scope).

   SAFETY: there is NO `eval` / `new Function`. This is a hand-written
   tokenizer + recursive-descent parser over a tiny grammar:

     expr   = term   (('+' | '-') term)*
     term   = factor (('*' | '/') factor)*
     factor = NUMBER | '(' expr ')' | ('+' | '-') factor      // unary +/-

   `evaluateFormula` takes the expression WITHOUT the leading '=' and returns the
   numeric result, or `null` if the input isn't a well-formed arithmetic
   expression (caller falls back to the plain numeric parse → never throws).
   ============================================ */

type Token =
  | { k: 'num'; v: number }
  | { k: 'op'; v: '+' | '-' | '*' | '/' }
  | { k: 'lp' }
  | { k: 'rp' };

function tokenize(src: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === ' ' || ch === '\t') {
      i++;
      continue;
    }
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
      tokens.push({ k: 'op', v: ch });
      i++;
      continue;
    }
    if (ch === '(') {
      tokens.push({ k: 'lp' });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ k: 'rp' });
      i++;
      continue;
    }
    // number: digits with an optional single decimal point. Commas are stripped
    // (thousands separators) so "1,000" reads as 1000.
    if (ch === ',') {
      i++;
      continue;
    }
    if ((ch >= '0' && ch <= '9') || ch === '.') {
      let j = i;
      let seenDot = false;
      while (j < src.length) {
        const c = src[j];
        if (c >= '0' && c <= '9') {
          j++;
        } else if (c === '.' && !seenDot) {
          seenDot = true;
          j++;
        } else if (c === ',') {
          j++;
        } else {
          break;
        }
      }
      const numStr = src.slice(i, j).replace(/,/g, '');
      const n = Number(numStr);
      if (!Number.isFinite(n)) return null;
      tokens.push({ k: 'num', v: n });
      i = j;
      continue;
    }
    // any other character → not a literal-arithmetic expression
    return null;
  }
  return tokens;
}

/** Evaluate a literal-arithmetic expression (no leading '='). Returns the
 *  numeric result, or null if it isn't well-formed. Never throws. */
export function evaluateFormula(expr: string): number | null {
  const tokens = tokenize(expr);
  if (!tokens || tokens.length === 0) return null;

  let pos = 0;
  const peek = (): Token | undefined => tokens[pos];

  // factor = NUMBER | '(' expr ')' | ('+'|'-') factor
  function parseFactor(): number | null {
    const t = peek();
    if (!t) return null;
    if (t.k === 'op' && (t.v === '+' || t.v === '-')) {
      pos++;
      const f = parseFactor();
      if (f === null) return null;
      return t.v === '-' ? -f : f;
    }
    if (t.k === 'num') {
      pos++;
      return t.v;
    }
    if (t.k === 'lp') {
      pos++;
      const e = parseExpr();
      if (e === null) return null;
      if (peek()?.k !== 'rp') return null;
      pos++;
      return e;
    }
    return null;
  }

  // term = factor (('*'|'/') factor)*
  function parseTerm(): number | null {
    let acc = parseFactor();
    if (acc === null) return null;
    for (;;) {
      const t = peek();
      if (t?.k === 'op' && (t.v === '*' || t.v === '/')) {
        pos++;
        const rhs = parseFactor();
        if (rhs === null) return null;
        if (t.v === '/') {
          if (rhs === 0) return null; // div-by-zero → fall back to plain parse
          acc = acc / rhs;
        } else {
          acc = acc * rhs;
        }
      } else {
        break;
      }
    }
    return acc;
  }

  // expr = term (('+'|'-') term)*
  function parseExpr(): number | null {
    let acc = parseTerm();
    if (acc === null) return null;
    for (;;) {
      const t = peek();
      if (t?.k === 'op' && (t.v === '+' || t.v === '-')) {
        pos++;
        const rhs = parseTerm();
        if (rhs === null) return null;
        acc = t.v === '-' ? acc - rhs : acc + rhs;
      } else {
        break;
      }
    }
    return acc;
  }

  const result = parseExpr();
  if (result === null) return null;
  if (pos !== tokens.length) return null; // trailing garbage → not well-formed
  if (!Number.isFinite(result)) return null;
  return result;
}
