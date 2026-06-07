# Lowpass — GDPR Data Map (review draft)

**Date:** 2026-06-07
**Status:** ⚠️ DRAFT FOR ADAM TO CONFIRM. This is the foundation of the GDPR
tooling — export and erasure both iterate it. **No erasure code will touch
data until you sign off the classifications below**, especially the
`anonymize` vs `retain-legal` calls and the special-category flags.

Built from a parse of every `CREATE TABLE` / `ALTER TABLE ADD COLUMN` across
`database/migrations/` + `rental_setup.sql` (86 tables). Columns that looked
like PII but are not (budget figures, equipment names, audio channel names,
capacities) were reviewed and excluded — see §6.

---

## 1. Data-subject types

GDPR rights attach to a *person*. Lowpass processes four kinds, and they are
resolved differently:

| Type | Who | How we find their rows | Who files the request |
|---|---|---|---|
| **account** | A Lowpass login (`auth.users` + `profiles`) | `id` / `user_id` / `*_by` FKs | The user (self-service) or a site admin |
| **roster_person** | Band/crew the workspace manages (never log in) | `persons.id`, `personnel.id`, `canonical_person_id`, or **free-text `person_name`** | Workspace admin (the controller) |
| **external_contact** | Promoters, venue/hotel contacts, rental clients | `contacts.id`, email match, JSONB `contacts` | Workspace admin |
| **venue_intake** | Venue staff who fill public intake/advance forms | `submitted_by_email`, `recipient_email`, `last_viewer_ip` | Workspace admin |

The account case is clean. **The other three are the hard, high-risk part** —
they're people who never consented to an account, and some are identified only
by a free-text name (see §4 flag F2).

## 2. Erasure actions (the decision per column)

- **delete** — row exists only to hold this person's data, no legal/integrity reason to keep it → hard delete.
- **anonymize** — row must survive for tour/operational integrity → scrub identity columns to a tombstone (`Redacted#<erasure-id>`), null free-text, keep FKs + non-personal fields.
- **retain-legal** — financial/contractual record likely under statutory retention (UK tax/accounting ~6 yrs) → keep the figures, anonymize the person, do NOT delete until the retention window lapses. **Needs legal sign-off on periods/lawful basis (§5).**
- **nullify-author** — a `created_by`/`updated_by`/`actor_user_id` pointer to an account being erased → set null or point at a "deleted user" tombstone; the content row stays.

---

## 3. The map

### 3a. Account-user data

| Table | Personal columns | Action | Notes |
|---|---|---|---|
| `auth.users` (Supabase) | email, encrypted pw, phone, last sign-in | delete | via `auth.admin.deleteUser` — already wired in `/api/admin/users/[id]` |
| `profiles` | name, email, phone, avatar_url, **passport_encrypted** | delete (cascade) | passport encrypted at app layer ✅ |
| `workspace_members` | user_id | delete | cascade on user delete |
| `workspace_member_tags` | tag_name, member_id | delete | with member |
| `notifications` | user_id | delete | |
| `ai_usage_events` | user_id | nullify-author | keep cost row for workspace accounting, null the user |
| `ai_usage_user_overrides` | user_id, notes | delete | |
| `audit_log` | actor_user_id | **retain** + anonymize actor | this log is also breach-evidence (Art. 33) — keep the event, scrub identity after retention. ⚠️ tension, confirm |
| `*` authored content | `created_by` / `updated_by` / `last_updated_by_id` / `invited_by_user_id` / `scanned_by_user_id` | nullify-author | rider_*, stage_plot_*, advance_*, bug_reports, deal_memos, flights, persons, budget_* |

### 3b. Roster people (band/crew) — the sensitive core

| Table | Personal columns | Action | Notes |
|---|---|---|---|
| `persons` | full_name, preferred_name, email, phone, **date_of_birth, emergency_contact, dietary, passport_full_name, passport_number, passport_country, passport_expiry**, notes | anonymize (or delete if no FK refs) | **special-category risk (§4 F1) + plaintext passport (§4 F3)** |
| `canonical_persons` | display_name, email, phone | anonymize/delete | identity spine |
| `personnel` | name, email, phone, **dietary_needs, passport_info (jsonb)**, user_id | anonymize/delete | special-category + plaintext passport |
| `personnel_rates` | person_name (free-text), person_id, base_rate_note, commission_note | retain-legal | anonymize name, keep rate figures |
| `payroll_entries` | person_id, personnel_id, notes | retain-legal | keep amounts, scrub identity |
| `flights` | person_name, passenger_ids, pnr, notes | anonymize | PNR is travel PII; keep flight for ops |
| `flight_bookings` | person_name | anonymize | budget-side mirror |
| `hotel_room_assignments` | person_name, notes | anonymize | |
| `rooming_grid` | person_name, person_id | anonymize | |
| `room_assignments` | person_id, tour_personnel_id | delete | assignment link |
| `tour_personnel`, `personnel_tour_assignments` | person_id / personnel_id | delete | roster links |
| `personnel_intake_tokens` | personnel_id, notification_email_sent_to, invited_by_user_id | delete | |
| `expenses` | submitted_by, person_id, notes, receipt_url/filename, city, country | retain-legal | anonymize submitter, keep figures/receipts |

### 3c. External contacts (promoters, venues, clients)

| Table | Personal columns | Action | Notes |
|---|---|---|---|
| `contacts` | first_name, last_name, email, phone, notes, venue_name, person_id | delete | |
| `deal_memos` | promoter_name, promoter_email, promoter_phone, document_filename, notes | retain-legal | contract doc — keep terms, anonymize promoter |
| `venues` | `contacts` (**JSONB array** of people), notes | anonymize within JSONB | venue itself is business; the contacts blob is personal (§4 F4) |
| `routing` | venue_phone, notes, address, lat, lng | anonymize phone/notes | venue address is business; phone may be a person |
| `rental_jobs` | client_name, billing_email, billing_phone, billing_address, billing_tax_id, notes | retain-legal | invoicing law; anonymize client identity |
| `hotels`, `hotel_bookings` | hotel_name, phone, address | business (low) | review `phone`/notes for individuals |

### 3d. Venue-intake people (forms / public links)

| Table | Personal columns | Action | Notes |
|---|---|---|---|
| `advance_intake_links` | recipient_name, recipient_email, submitted_by_name, submitted_by_email, **last_viewer_ip**, notification_email_sent_to, **submitted_data (jsonb)** | delete after retention | the M6 core; IP + submitter PII, no expiry today |
| `advance_packet_links` | last_viewer_ip, created_by | purge IP on schedule | |
| `stage_plot_share_links` | last_viewer_ip, created_by | purge IP on schedule | |
| `stage_plots` | show_tm_name, show_tm_email, show_tm_phone, notes | anonymize (TM's own erasure) | TM contact printed on plot |

### 3e. Free-form / file reservoirs (column scan can't see these)

| Location | Risk | Handling |
|---|---|---|
| `advance_instances.data` (jsonb) | venue contacts, names, phones entered free-form | export: include; erasure: targeted key-scrub |
| `advance_intake_links.submitted_data` (jsonb) | venue's submitted answers | delete with link |
| `venues.contacts` (jsonb array) | promoter/venue staff | anonymize matching entries |
| `*.metadata`, `*.notes` (free text) | anything a user typed | export: include; erasure: flag for manual redaction |
| **Storage bucket `personnel`** | **uploaded personnel documents — likely passport/visa scans** | erasure MUST delete the person's objects |
| Storage `profiles` (avatars), `artist-assets`, `rider-assets`, budget receipts | photos, receipts with names | delete/anonymize objects on erasure |

---

## 4. Flags that change the design (need your call)

- **F1 — Special-category data (Art. 9).** `dietary`/`dietary_needs` can reveal religion or health; `emergency_contact`, `date_of_birth`, passport data are sensitive identity data. Art. 9 requires an *explicit* lawful basis and stronger safeguards. Confirm what you actually need to store — every special-category field you can drop is risk removed.
- **F2 — Free-text `person_name` blocks reliable erasure.** `payroll_entries`, `flights`, `flight_bookings`, `hotel_room_assignments`, `rooming_grid` identify a person by a typed string. You cannot deterministically erase "John Smith" across these. **Your in-flight personnel-unification work (migration 204) is exactly the fix** — GDPR erasure should land after it, or depend on it. Until then, erasure of roster people is best-effort + manual review.
- **F3 — Plaintext passport/DOB in `persons` + `personnel`.** `profiles.passport_encrypted` is encrypted at the app layer, but `persons.passport_number`/`passport_full_name` are plain `text` and `personnel.passport_info` is plain JSONB. Inconsistent and a real exposure for the most sensitive data you hold. Recommend encrypting at rest (or not storing passport numbers at all).
- **F4 — JSONB blobs are hidden PII.** `venues.contacts`, `advance_instances.data`, `submitted_data`, and `metadata` fields hold personal data the schema can't enumerate. Export/erasure need bespoke handling per blob, not a generic column sweep.
- **F5 — Backups.** Deleting from Postgres does not erase Supabase PITR or Backblaze backups. GDPR permits backups to age out on a *documented* schedule — we must write that schedule down; we can't selectively erase a backup.
- **F6 — `artists.name`.** A solo artist's name can be personal data. Usually the controller's own business data, but note it.

## 5. Legal sign-off needed (I am not a lawyer — these are not legal advice)

The mechanism is mine to build; these inputs are not mine to invent:

1. **Retention periods** for every `retain-legal` row (payroll, settlement, deal memos, expenses, rental billing). UK tax/accounting commonly cited as ~6 years — confirm with your accountant/counsel; I'll wire whatever numbers you give as config.
2. **Lawful basis** for processing roster + venue-intake personal data (likely legitimate interest or contract), and **explicit basis** for the Art. 9 special-category fields (F1).
3. **Controller/processor** roles — confirms whether self-service erasure is ever appropriate for roster/venue people, or always admin-mediated.

## 6. Considered and excluded (not personal data)

`budget_income` (guarantee/overage/VIP figures — commercial, not personal), `budget_commissions/settings` amounts, `gear`/`rental_inventory` equipment names + `country_of_origin`, `channel_list_rows`/`stage_boxes`/`sub_snakes` (audio), `mic_library`, `roles`/`permission_grants` (authz), `tours.name`/`principal_count`, `budget_sections`/`templates` names, `stage_plot_items.icon_name`, capacities. (`workspaces.name` = org, not personal.)

---

## 7. What gets built once this map is signed off

1. `src/lib/gdpr/registry.ts` — this map as code (drafted alongside this doc).
2. Migration `207` — `gdpr_requests` table (request audit + erasure certificates), workspace-scoped RLS, admin-only.
3. **Export / DSAR** endpoint (Art. 15+20) — walks the registry, returns a ZIP (JSON + readable summary), includes JSONB blobs + storage objects.
4. **Erasure** endpoint (Art. 17) — two-step request→confirm, transactional, applies per-row action, emits an erasure certificate.
5. **Retention cron** — purges expired `last_viewer_ip` + intake submitter PII on the configured schedule (closes audit finding M6).
6. **Intake consent notice** — privacy notice + lawful-basis stamp on public forms.
7. **Processor register** (Art. 30) — Supabase, Google, Anthropic, Resend, Spotify: purpose, data shared, region, DPA link.
