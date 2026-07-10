# Intake smoke tests

> **Last bulk verification**: pending — to be filled after Adam's first run on Vercel preview post-merge.

Venue-facing advance intake (P7 Intake Upgrade). Walk these after any
change to the public intake page, the submit/pending path, tech-pack
extraction, the mobile form, or the reminder cron. ID prefix is `INTK`.

Related harnesses (run locally, all green):
`src/lib/advance/intake.test.ts` (29), `intake-pending.test.ts` (9),
`intake-prefill.test.ts` (10), `intake-techpack.test.ts` (7),
`src/lib/intake/reminders.test.ts` (7).

## Store-pending + review

#### INTK-01 — Venue submit lands as PENDING, never auto-merges

**Do**: Open a venue intake link, answer a couple of fields, click
"I'm done — notify my TM". As the TM, open the advance builder for that
show and look at the intake review panel.

**Expect**: The venue's answers appear in the ChangeReviewQueue as
pending rows — they are NOT already written into the advance. Accepting
a row merges it (never clobbering a value the TM already set); rejecting
leaves the advance untouched.

**Last verified**:

## Prefill

#### INTK-02 — Proposals prefill from canonical + prior same-venue advance

**Do**: Create an intake link for a show at a venue you've advanced
before. Open the venue link.

**Expect**: Some fields show greyed proposal values with a provenance
chip (e.g. "from a previous show at this venue" / canonical venue data).
Proposals never overwrite fields the venue has already answered. An
un-edited accepted proposal submits as `source='prefill'` carrying its
provenance; edited/new answers submit as `source='venue'`.

**Last verified**:

## Tech-pack extraction

#### INTK-03 — Tech-pack upload → metered extraction → pending

**Do**: On the venue intake page, upload a tech-pack PDF via the
tech-pack panel.

**Expect**: Fields are extracted and land as pending rows
(`source='tech_pack'`) for TM review — same never-clobber merge on
accept. The call is metered (`ai_usage_events` row, endpoint
`advance.intake.tech-pack`, `user_id` NULL — workspace-capped). A parse
failure returns HTTP 200 with a message and the form still works
(degrade, don't block).

**Last verified**:

## Mobile

#### INTK-04 — Mobile-first form: accordion, progress, autosave

**Do**: Open a venue intake link on a phone-width viewport.

**Expect**: Single-column layout, 16px inputs, sections in a `<details>`
accordion showing answered/total, a sticky "N of M answered" progress
bar. Editing a field autosaves as a draft ("Saving… / ✓ Saved") WITHOUT
marking the link submitted or notifying the TM. Prefill proposals,
tech-pack panel, and labor-call rows all render. Expiry/revoked links
still show the 410/not-found state.

**Last verified**:

## Reminders

#### INTK-05 — Reminder cron sends once, per the sent_at guard

**Do**: Create an intake link for a show ≥15 days out (seeds t14/t7/t3
in `intake_reminders`). In dev, hit `GET /api/cron/intake-reminders`
twice (with `Authorization: Bearer $CRON_SECRET` in prod; bare in dev).

**Expect**:
- Link creation seeds t14/t7/t3 rows (future `send_at` only; a link
  created inside the window skips overdue reminders).
- First cron run, once a row is due, emails the venue contact **only if**
  the intake is < 100% answered AND the link is not revoked/expired, and
  stamps `sent_at`. Summary shows `sent: N`.
- **Second run sends nothing** — every due row is already `sent_at`-stamped
  (`UPDATE … WHERE sent_at IS NULL` wins the race). Summary `sent: 0`.
  This is the no-double-send guarantee.
- Final (non-draft) venue submit queues one `tm_completed` row → the cron
  emails the TM once.
- The per-link opt-out link in the email
  (`/api/public/intake-reminders/[token]/opt-out`) deletes the link's
  remaining unsent t14/t7/t3 rows; no further venue reminders fire.

**Last verified**:
