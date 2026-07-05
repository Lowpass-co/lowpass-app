# CC — Intake upgrade: win venue compliance. SINGLE OWNER.

> **RUN ORDER 5 of 6 — see `ROADMAP_2026-07.md`. Requires venue SSOT (order 2, for prefill) and the design pass's Share stage (order 3).**

Source: `docs/design/COMPETITIVE_ADVANCEWITHME_2026-07.md` §4 + beat-list #1/#4 — the documented industry pain is venues NOT filling forms; AdvanceWithMe answers with forced signup (friction). Lowpass answers by making completion nearly free.

## 1. Prefill from what we already know
When an intake link renders: pre-populate answers from (a) `canonical_venues` (via the venue resolver) and (b) the most recent completed advance at the SAME venue, any tour, this workspace. Prefilled answers render as proposals — "From your March show — confirm or correct" — venue taps confirm per section or edits. Confirmed-prefill counts as venue-submitted (same additive merge + TM review queue). Measure: fields-prefilled ratio in the report.

## 2. "Upload your tech pack instead" — the compliance dissolver
The intake page's header offers an alternative to form-filling: upload your venue tech pack (PDF/images). New endpoint reusing the deal-memo extraction pattern (Claude, `withAiUsage()` metering): extraction targets the intake's fillable fields for that advance; results land as venue-submitted answers in the TM's Review queue (accept/reject per field — nothing auto-writes). Venue sees "we'll pull the answers from your pack — you're done." This directly answers the documented refusal ("my tech pack already covers this"). Guard: size/type limits mirror receipts; extraction failure degrades to "we couldn't read this — the form's still here," never a dead end.

## 3. Mobile-first intake
Venue reps answer from phones side-stage. Single-column thumb-sized pass (public page, no app chrome): section accordion, big inputs, sticky progress ("4 of 12 answered"), per-field autosave surfaced ("saved" per answer — no submit anxiety). Keep the existing expiry/410 behavior.

## 4. Nudges (notification lane, minimal v1)
`intake_reminders (link_id, send_at, sent_at, kind)` + a scheduled job (Supabase cron/edge function — say what you chose): reminder emails to the intake contact at T-14d/T-7d/T-3d before the show if the intake is <100% and not revoked; one "venue completed intake" email to the TM. Plain-text copy, one link, per-link opt-out. Deliberately the SMALLEST possible notification system — do not generalize it yet.

## Gates
Floor green · scripted proofs: prefill from a prior same-venue advance; tech-pack upload → extraction → review-accept lands the answer; reminder rows created + one send exercised in dev · INTK-01..05 smoke IDs same PR · migration SQL posted for Adam first · AI endpoints metered via `ai_usage_events`.

## Out of scope
Venue accounts/portals (never — the no-signup model IS the moat) · SMS · the general notification lane · per-counterparty section scoping (parked with the permissions model).
