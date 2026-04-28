/** Map edited column to budget_line_items PATCH body fields. Unknown columns no-op for API. */
export function patchFieldsFromUx14Cell(columnId: string, raw: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  switch (columnId) {
    case 'label':
      out.label = typeof raw === 'string' ? raw : String(raw ?? '');
      break;
    case 'quantity':
      out.quantity = typeof raw === 'number' ? raw : Math.max(1, Number.parseInt(String(raw ?? '0'), 10) || 1);
      break;
    case 'proposed_cost':
      out.proposed_cost = typeof raw === 'number' ? raw : Number(raw);
      break;
    case 'actual_cost':
      out.actual_cost = typeof raw === 'number' ? raw : Number(raw);
      break;
    case 'currency':
      out.currency = typeof raw === 'string' ? raw.trim().toUpperCase().slice(0, 8) || null : null;
      break;
    case 'status':
      out.status = typeof raw === 'string' ? raw : String(raw ?? 'draft');
      break;
    case 'routing_id':
      out.routing_id =
        typeof raw === 'string' && raw.trim() === '' ? null : typeof raw === 'string' ? raw : String(raw ?? '');
      break;
    default:
      break;
  }
  return out;
}

/** Skip saves for synthetic / non-patchable columns (including notes handled in SlideOver). */
export function ux14ColumnIsPersisted(columnId: string): boolean {
  return !['flight_link', '__notes'].includes(columnId) && !columnId.startsWith('__');
}
