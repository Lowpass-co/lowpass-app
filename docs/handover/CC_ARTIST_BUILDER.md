# CC — ARTIST BUILDER REBUILD. Adam graded the POC: PASS with one change. SINGLE OWNER.

Reference implementation: the Cowork POC (played + graded 2026-07-18). Build this behaviour; don't reinterpret it.

## Why (Adam's report on the current builder)
"It doesn't work right now. You have to switch the selected artist to have the Next button work, you can't search Spotify. It looks old and dated."

Three defects: (1) **Next depends on stale context** — it only enables after the user switches the selected artist, meaning the button reads some ambient selection rather than "has the user chosen someone in this flow"; (2) **no Spotify search** — the artwork/genre data the app already syncs elsewhere is not reachable at create time; (3) flat dated form asking for everything before giving anything.

## The flow — three steps

**Step 1 · Find** (primary path = Spotify search)
- Single search input, autofocus. Typing ≥1 char triggers a **debounced 250–280ms** search against Spotify — no Enter, no button.
- While in flight: a quiet "Searching…" affordance. Never show create-manually before results have had their chance (same rule as the venue autocomplete fix).
- Results are rows: artwork thumb (46px) · name (14.5px) · genres (11.5px muted) · follower count (mono, right). Hover brightens border. **Click a row = selection.**
- No matches → an inline card offering "Add '<query>' manually →".
- Escape hatch always visible under the intro line: "Not on Spotify? Add manually →" jumps straight to Step 3 with a blank record.
- **THE FIX: `Next` enables the instant a result is clicked** — its enabled state derives ONLY from local `selected !== null` in this flow's own state. It must NOT read `ArtistTourContext`, the selected-artist pill, or any ambient/global selection. That coupling is the reported bug; assert it in the smoke.

**Step 2 · Confirm** (proves the right artist before committing)
- Large artwork (132px), name in the condensed display face, genre chips, and mono stats: FOLLOWERS · POPULARITY · SPOTIFY ID (truncated).
- Reassurance line: artwork/genres/release history sync automatically, changeable later.
- "Wrong artist? Search again →" returns to Step 1 and CLEARS the selection.

**Step 3 · Details** (optional, skippable)
- Mini artwork + name + "Linked on Spotify".
- Two fields: **Display name** (prefilled from Spotify) and **Default currency**.
- Copy: "Everything here is optional — you can start a tour right away and fill this in later."
- Primary button becomes **"Create artist"**.

**Chrome:** workspace crumb / "NEW ARTIST" in condensed caps / "STEP N OF 3" mono / step tabs (Find · Confirm · Details) with completed steps readable and future steps muted / Back from step 2+.

## THE ONE CHANGE ADAM FLAGGED
The POC's currency control was a raw native `<select>` — browser chevron, wrong look, and the label read "USD $". **Use the app's StyledSelect component** (the F2 conversion target — if it doesn't exist yet, this is where it gets created, and it becomes the canonical control for the rest of the F2 sweep). **Currency labels are symbol-first, matching the budget page's existing convention: `$ USD`, `£ GBP`, `€ EUR`** — not `USD $`. Grep the budget currency selector and reuse its exact formatter rather than writing a second one.

## Wiring notes
- **Verify Spotify credentials server-side FIRST.** The app already syncs artist artwork, so a server-side Spotify client and token flow very likely exist (`resolveArtistLogoUrl` and related). Reuse it — do NOT add a second credential path or call Spotify from the client. If search needs a new endpoint, it's a thin server route wrapping the existing auth.
- Rate-limit/meter the search endpoint consistently with the other external-API proxies (see `lib/external/googleUsage.ts` pattern).
- On create: persist the Spotify id so downstream artwork/release sync keeps working; manual-path artists save with a null id and must degrade gracefully everywhere (no broken artwork).
- Replace the existing create-artist surface entirely; delete the old component rather than leaving two builders.

## Smokes AB-01..07
AB-01 search-as-you-type returns results without Enter · AB-02 **Next enables on selection alone, with no ambient artist selected** (the reported bug — test it with the artist pill empty) · AB-03 confirm step renders real pulled artwork/genres/followers · AB-04 manual escape hatch reaches step 3 and creates a null-Spotify-id artist · AB-05 details are skippable; created artist opens its page · AB-06 back navigation clears selection correctly from step 2 · AB-07 currency control is StyledSelect with `$ USD` formatting, no native chevron.

Gates: floor green, no money paths, git evidence per the hard rule. Cowork walks after deploy.
