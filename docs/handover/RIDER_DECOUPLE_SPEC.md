# RIDER DECOUPLE + BUILDER — the agreed model and the remaining build

2026-08-05 · Adam's decisions are LOCKED (do not re-litigate):

1. **Documents + named versions.** Channel lists and stage plots are standalone
   documents (still stored as `rider_packs` kind rows). "Save as version"
   deep-copies into a named sibling (`version_of_pack_id` → root,
   `version_label`). **One version = one source of truth**: editing a version
   updates everywhere it's attached. No auto-forking, ever. Saturday differs?
   Save version "Saturday — with keys", attach it to Saturday.
2. **Attachments, not inheritance.** `rider_pack_attachments` links a document
   version to exactly one of: a rider pack (tech section presents it), a
   routing row (that show), or a tour (default). One per kind per target,
   replace-on-attach. Resolution: show → tour → legacy pack-scan fallback.
3. **Rider builder nav: FIXED groups + a curated add list.** Ships with
   Production / Technical / Hospitality / Travel. Offer ~6 optional groups to
   add (suggest: Security, Merch, Press & Promo, Parking & Access, Catering,
   Local Crew). NO freeform group creation — Adam: "the app is INCREDIBLY
   customisable at the minute and is verging on complicated. some confines are
   good." Sections within a group ARE customisable (add/remove/reorder).
4. **One show link.** A single venue-facing URL per show replaces the four
   token mechanisms (`rider_web_links`, `advance_packet_links`,
   `advance_intake_links`, HMAC advance share) over time: digital rider +
   channel list + stage plot + advance form + PDF downloads on one page.

## Shipped in phase A (this commit)

- Migration `256_document_versions_and_attachments.sql` — **Adam pastes by
  hand.** Idempotent. Lineage columns + `rider_pack_attachments` + RLS.
- `lib/rider-packs/saveVersion.ts` — deep copy incl. section `metadata`, pack
  `kind`, snakes/boxes/rows, and stage_plots+items (the clone route drops
  metadata + kind — pre-existing bugs, not replicated).
- `lib/rider-packs/attachments.ts` — list / resolveShowDocuments / attach
  (replace-same-kind). Fails soft pre-migration (empty results).
- APIs: `POST /api/rider-packs/[id]/save-version` {label}·
  `GET /api/rider-packs/[id]/versions` · `GET/POST/DELETE
  /api/rider-pack-attachments`.
- Consumers wired: `/operations/[tourId]/channel-list` is attachment-first
  (an attached doc is its OWN pack → the inherited CSS lock can never engage);
  `advance-packet/manifest.ts` is show-aware (attached version replaces the
  tour-wide channel_list scan; fallback = today's behaviour).

## Phase B — the rider builder UI (next session, in order)

1. **Version/attach UI** (unblocks Adam immediately):
   - `ChannelListTourEditor` header: version picker (GET versions) + "Save as
     version…" (POST save-version) + "Attach to…" (tour default / pick shows
     from routing). Same controls on the stage-plot surface.
   - Rider editor tech section: replace the owned channel_list section body
     with an ATTACH control (pick document version → POST attachment with
     rider_pack_id) + read-only preview + "Edit channel list ↗" (deep-link to
     the document). Keep rendering legacy owned-rows sections read-only with a
     one-click "Convert to attached document" (creates a doc pack via
     saveVersion of the section's pack, attaches it).
2. **Builder shell** — mirror the app shell's grammar (TopBarV3/NavRail
   styling, tokens, PendingNav): top tab bar = the four fixed groups (+ added
   ones, + a "+ Add group" menu limited to the curated list), left rail = the
   group's sections (drag to reorder, add from `rider_section_templates`
   filtered by group), canvas = the section editor (existing FieldEditors /
   RichText / advance_summary bodies). Store the group on
   `rider_sections.metadata.group` (no migration needed); ungrouped legacy
   sections land in Production.
   Base it on `RiderBuilderShellClient` 3-pane; retire the accordion canvas
   look. Reference mocks: docs/design/SHELL_CANONICAL_MOCK / GRADING_TOOL for
   token grammar.
3. **Venue-facing read view** — restyle `ReadOnlyPackView` with the same
   grouped nav (sticky top groups, left section list, print CSS intact);
   PDF export (`pdf-render.ts`) gets group headings. "Digital OR PDF" =
   the web link + the existing per-pack PDF route; no new mechanism.
4. **One show link** — new table `show_links` (token, routing_id,
   password_hash, revoked_at — mirror `advance_packet_links`), route
   `/s/[token]`: header (artist/show/date/venue) + tabs: Advance form (reuse
   intake surface) · Rider (grouped read view of attached/tour riders) ·
   Channel list · Stage plot · Downloads (existing PDF routes). Old four
   links keep working; packet/share surfaces grow a "Copy show link" that
   mints this. Needs migration 257 — write it idempotent, hand-paste.

## Known debts to carry (do not lose)

- Server-side write-guard on `channel_list_rows` for genuinely inherited
  rider-owned sections is still absent (was CSS-only before; standalone docs
  make it moot, but legacy sections remain until converted).
- `clone/route.ts` drops `kind` + section `metadata` — fix or fold into
  saveVersion.
- `stageplot-data.ts` + `channel-list-data.ts` duplicate resolution cascades;
  point both at `resolveShowDocuments` once attachments are the norm.
- Four share mechanisms until the show link lands.
