/* ============================================
   LOWPASS — in-memory Supabase fake (tests only)

   Enough of the supabase-js query builder to run the money code end-to-end
   in vitest without a database: select / insert / update / upsert / delete,
   eq / neq / in / is / not / or / order / limit, single / maybeSingle, a
   one-level embedded select (`alias:fk_col(cols)`), rpc() handlers, unique
   constraints that return Postgres' 23505, ON DELETE CASCADE, and injected
   read failures.

   It returns whole rows regardless of the column list. That is deliberate:
   the code under test must not depend on a column it did not ask for, and
   tests assert on what was WRITTEN, which is exact.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';

type Row = Record<string, unknown>;
type PgError = { message: string; code?: string };
type Result<T = unknown> = { data: T | null; error: PgError | null; count?: number | null };

export interface FakeDbOptions {
  /** table → list of column sets that must be unique (rows where every column is non-null). */
  unique?: Record<string, string[][]>;
  /** child table → { column, parent } with ON DELETE CASCADE. */
  cascade?: Array<{ child: string; column: string; parent: string; onDelete: 'cascade' | 'set null' }>;
  rpc?: Record<string, (db: FakeDb, args: Record<string, unknown>) => Result>;
}

let idSeq = 0;
export const fakeId = (prefix = 'id'): string => `${prefix}-${(++idSeq).toString().padStart(4, '0')}`;

export class FakeDb {
  tables = new Map<string, Row[]>();
  failReads = new Set<string>();
  failWrites = new Map<string, PgError>();
  log: Array<{ op: string; table: string; detail?: unknown }> = [];
  clock = 0;

  constructor(public opts: FakeDbOptions = {}) {}

  t(name: string): Row[] {
    let rows = this.tables.get(name);
    if (!rows) {
      rows = [];
      this.tables.set(name, rows);
    }
    return rows;
  }

  seed(name: string, rows: Row[]): Row[] {
    const out = rows.map((r) => ({ id: r.id ?? fakeId(name), created_at: r.created_at ?? this.now(), ...r }));
    this.t(name).push(...out);
    return out;
  }

  now(): string {
    this.clock += 1;
    return new Date(Date.UTC(2026, 9, 7, 12, 0, 0, this.clock)).toISOString();
  }

  writes(table?: string): number {
    return this.log.filter((l) => l.op !== 'select' && (!table || l.table === table)).length;
  }

  violatesUnique(table: string, row: Row, ignoreId?: unknown): boolean {
    for (const cols of this.opts.unique?.[table] ?? []) {
      if (cols.some((c) => row[c] == null)) continue;
      if (this.t(table).some((r) => r.id !== ignoreId && cols.every((c) => r[c] === row[c]))) return true;
    }
    return false;
  }

  deleteRows(table: string, rows: Row[]): void {
    const ids = new Set(rows.map((r) => r.id));
    this.tables.set(table, this.t(table).filter((r) => !ids.has(r.id)));
    for (const c of this.opts.cascade ?? []) {
      if (c.parent !== table) continue;
      const kids = this.t(c.child).filter((k) => ids.has(k[c.column]));
      if (c.onDelete === 'cascade') this.deleteRows(c.child, kids);
      else for (const k of kids) k[c.column] = null;
    }
  }

  client(): SupabaseClient {
    const db: FakeDb = this; // eslint-disable-line @typescript-eslint/no-this-alias -- closures below need the instance
    return {
      from: (table: string) => new Query(db, table),
      rpc: async (name: string, args: Record<string, unknown>) => {
        const h = db.opts.rpc?.[name];
        if (!h) return { data: null, error: { message: `function ${name} not found`, code: 'PGRST202' } };
        db.log.push({ op: 'rpc', table: name, detail: args });
        return h(db, args);
      },
      storage: {
        from: () => ({
          upload: async (path: string) => ({ data: { path }, error: null }),
          remove: async () => ({ data: null, error: null }),
          createSignedUrl: async (path: string) => ({ data: { signedUrl: `signed://${path}` }, error: null }),
        }),
      },
    } as unknown as SupabaseClient;
  }
}

type Filter = (r: Row) => boolean;

function parseList(v: string): string[] {
  return v.replace(/^\(|\)$/g, '').split(',').map((s) => s.trim().replace(/^"|"$/g, ''));
}

class Query implements PromiseLike<Result> {
  private filters: Filter[] = [];
  private op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private payload: Row | Row[] | null = null;
  private onConflict: string | null = null;
  private returning = false;
  private orders: Array<{ col: string; asc: boolean }> = [];
  private lim: number | null = null;
  private mode: 'many' | 'single' | 'maybe' = 'many';
  private embeds: Array<{ alias: string; table: string; fk: string }> = [];

  constructor(private db: FakeDb, private table: string) {}

  select(cols = '*') {
    if (this.op === 'select') this.op = 'select';
    else this.returning = true;
    for (const m of cols.matchAll(/(\w+):(\w+)\(/g)) {
      // alias:fk_col(...) → the table named by alias, joined on row[fk_col] = id
      this.embeds.push({ alias: m[1], table: m[1], fk: m[2] });
    }
    return this;
  }
  insert(rows: Row | Row[]) { this.op = 'insert'; this.payload = rows; return this; }
  upsert(rows: Row | Row[], o?: { onConflict?: string }) { this.op = 'upsert'; this.payload = rows; this.onConflict = o?.onConflict ?? 'id'; return this; }
  update(patch: Row) { this.op = 'update'; this.payload = patch; return this; }
  delete() { this.op = 'delete'; return this; }

  eq(c: string, v: unknown) { this.filters.push((r) => r[c] === v); return this; }
  neq(c: string, v: unknown) { this.filters.push((r) => r[c] !== v); return this; }
  in(c: string, vs: unknown[]) { const s = new Set(vs); this.filters.push((r) => s.has(r[c])); return this; }
  is(c: string, v: unknown) { this.filters.push((r) => (r[c] ?? null) === v); return this; }
  gte(c: string, v: unknown) { this.filters.push((r) => String(r[c] ?? '') >= String(v)); return this; }
  lte(c: string, v: unknown) { this.filters.push((r) => String(r[c] ?? '') <= String(v)); return this; }
  not(c: string, op: string, v: unknown) {
    if (op === 'is') this.filters.push((r) => (r[c] ?? null) !== v);
    else if (op === 'in') { const s = new Set(parseList(String(v))); this.filters.push((r) => !s.has(String(r[c]))); }
    else if (op === 'eq') this.filters.push((r) => r[c] !== v);
    return this;
  }
  or(expr: string) {
    const parts = expr.split(',').map((p) => p.split('.'));
    this.filters.push((r) => parts.some(([c, op, ...rest]) => {
      const v = rest.join('.');
      if (op === 'is') return (r[c] ?? null) === (v === 'null' ? null : v);
      if (op === 'eq') return String(r[c]) === v;
      return false;
    }));
    return this;
  }
  order(col: string, o?: { ascending?: boolean }) {
    if (!col.includes('(')) this.orders.push({ col, asc: o?.ascending !== false });
    return this;
  }
  limit(n: number) { this.lim = n; return this; }
  single() { this.mode = 'single'; return this; }
  maybeSingle() { this.mode = 'maybe'; return this; }

  then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null): Promise<A | B> {
    return Promise.resolve(this.run()).then(ok, bad);
  }

  private matches(): Row[] {
    return this.db.t(this.table).filter((r) => this.filters.every((f) => f(r)));
  }

  private shape(rows: Row[]): Result {
    let out = rows.map((r) => {
      const copy: Row = { ...r };
      for (const e of this.embeds) copy[e.alias] = this.db.t(e.table).find((x) => x.id === r[e.fk]) ?? null;
      return copy;
    });
    for (const o of [...this.orders].reverse()) {
      out = [...out].sort((a, b) => {
        const x = a[o.col] as string | number | null;
        const y = b[o.col] as string | number | null;
        if (x === y) return 0;
        if (x == null) return 1;
        if (y == null) return -1;
        return (x < y ? -1 : 1) * (o.asc ? 1 : -1);
      });
    }
    if (this.lim != null) out = out.slice(0, this.lim);
    if (this.mode === 'single') {
      return out.length === 1 ? { data: out[0], error: null } : { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' } };
    }
    if (this.mode === 'maybe') {
      return out.length <= 1 ? { data: out[0] ?? null, error: null } : { data: null, error: { message: 'multiple rows', code: 'PGRST116' } };
    }
    return { data: out, error: null };
  }

  private run(): Result {
    const db = this.db;
    if (this.op === 'select') {
      db.log.push({ op: 'select', table: this.table });
      if (db.failReads.has(this.table)) return { data: null, error: { message: `read of ${this.table} failed`, code: 'XX000' } };
      return this.shape(this.matches());
    }
    const wErr = db.failWrites.get(this.table);
    if (wErr) return { data: null, error: wErr };

    if (this.op === 'insert' || this.op === 'upsert') {
      const rows = (Array.isArray(this.payload) ? this.payload : [this.payload]) as Row[];
      const written: Row[] = [];
      for (const raw of rows) {
        if (this.op === 'upsert') {
          const keys = (this.onConflict ?? 'id').split(',').map((k) => k.trim());
          const hit = db.t(this.table).find((r) => keys.every((k) => r[k] === raw[k]));
          if (hit) {
            Object.assign(hit, raw);
            written.push(hit);
            db.log.push({ op: 'upsert', table: this.table, detail: raw });
            continue;
          }
        }
        const row: Row = { id: raw.id ?? fakeId(this.table), created_at: raw.created_at ?? db.now(), updated_at: db.now(), ...raw };
        if (db.violatesUnique(this.table, row)) {
          return { data: null, error: { message: 'duplicate key value violates unique constraint', code: '23505' } };
        }
        db.t(this.table).push(row);
        written.push(row);
        db.log.push({ op: this.op, table: this.table, detail: raw });
      }
      return this.returning || this.mode !== 'many' ? this.shape(written) : { data: null, error: null };
    }

    if (this.op === 'update') {
      const hits = this.matches();
      for (const r of hits) {
        const next = { ...r, ...(this.payload as Row) };
        if (db.violatesUnique(this.table, next, r.id)) {
          return { data: null, error: { message: 'duplicate key value violates unique constraint', code: '23505' } };
        }
      }
      for (const r of hits) Object.assign(r, this.payload as Row);
      db.log.push({ op: 'update', table: this.table, detail: { patch: this.payload, n: hits.length } });
      return this.returning || this.mode !== 'many' ? this.shape(hits) : { data: null, error: null };
    }

    // delete
    const hits = this.matches();
    db.deleteRows(this.table, hits);
    db.log.push({ op: 'delete', table: this.table, detail: { n: hits.length } });
    return this.returning ? this.shape(hits) : { data: null, error: null };
  }
}
