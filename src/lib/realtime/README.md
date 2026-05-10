# Realtime sync (Sprint 9 §4)

Foundation hook for live collaborator updates via Supabase
Realtime. Keep the integration pattern uniform across surfaces
so future pages don't reinvent debouncing, channel cleanup, or
the connected/offline indicator.

## When to use

Add realtime to a page when **two collaborators editing the
same tour or workspace need to see each other's changes within
~1s without refreshing**. Routing rows, advance form data,
personnel assignments, and budget line items all qualify.

Do NOT use it for:

- Single-user surfaces (settings, profile editor — no
  cross-tab benefit).
- Append-only logs (audit_log, notifications — they're
  read elsewhere).
- High-frequency typing-style edits where the server is the
  source of truth and the client already debounces saves
  (channel-list cell edits — too noisy without coalescing).

## Pattern

```tsx
import { useRealtimeRows } from '@/lib/realtime/useRealtimeRows';

function TourRoutingEditor({ tourId }: { tourId: string }) {
  const [rows, setRows] = useState<RoutingRow[]>([]);
  const refetch = useCallback(async () => {
    const res = await fetch(`/api/tours/${tourId}/routing`);
    if (res.ok) {
      setRows(await res.json());
    }
  }, [tourId]);

  // Initial fetch
  useEffect(() => { void refetch(); }, [refetch]);

  // Subscribe to live changes from other collaborators
  const { connected } = useRealtimeRows({
    table: 'routing',
    filterColumn: 'tour_id',
    filterValue: tourId,
    onChange: () => { void refetch(); },
  });

  return (
    <>
      <RealtimeIndicator connected={connected} />
      <RoutingGrid rows={rows} ... />
    </>
  );
}
```

The hook subscribes once per (table, filter) combination,
re-subscribes if the filter changes, and unsubscribes on
unmount.

## Required server-side setup

Tables that the client subscribes to must have Realtime
enabled in Supabase. Check via:

```sql
SELECT n.nspname AS schema, c.relname AS table
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime';
```

Tables without a row in `supabase_realtime` publication will
silently emit no events. Add via:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.routing;
```

For Sprint 9 the demonstrative integration is `routing`.
Add others (advance_instances, personnel_tour_assignments,
tour_personnel, budget_line_items) when the consuming page
ships.

## RLS implications

Realtime uses the caller's RLS — events are filtered to rows
the caller can SELECT. A reader who can't see a row won't get
its UPDATE event. This means crew read-only users (Phase 6
my_schedule) only get realtime events for their own
assignments, not other crew's — which is the right boundary.

## Debounce for noisy tables

If `onChange` triggers an expensive refetch and the table is
mutation-heavy (Channel List, Spreadsheet Grid), coalesce
calls into a single debounced fetch:

```ts
const debouncedRefetch = useMemo(() => debounce(refetch, 250), [refetch]);
useRealtimeRows({ ..., onChange: debouncedRefetch });
```

For Sprint 9 routing, the immediate refetch is fine — RowingGrid
edits are infrequent enough that 1-per-event refetch isn't
costly.

## Connected indicator UX

The hook returns `{ connected: boolean }`. Surfaces should
render a small "Live" pill near the page header when connected
and a dimmed "Offline" pill when not. Don't gate edits on
disconnect — the user should keep working; the next save
flushes their changes regardless.
