/* Small, pure formatting for the crew pages. */
export function todayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function dayLabel(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** An advance answer as text, or null when there's nothing to show. */
export function answerText(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'string') return v.trim() ? v.trim() : null;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) {
    const parts = v.map(answerText).filter((x): x is string => !!x);
    return parts.length ? parts.join(', ') : null;
  }
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    for (const k of ['label', 'name', 'value', 'text']) if (typeof o[k] === 'string' && (o[k] as string).trim()) return (o[k] as string).trim();
    const parts = Object.entries(o)
      .map(([k, x]) => {
        const t = answerText(x);
        return t ? `${k.replace(/_/g, ' ')}: ${t}` : null;
      })
      .filter((x): x is string => !!x);
    return parts.length ? parts.join('\n') : null;
  }
  return null;
}

/** First show on or after today, else the last one. */
export function nextDayIndex(dates: string[], today: string): number {
  const i = dates.findIndex((d) => d >= today);
  return i >= 0 ? i : dates.length - 1;
}
