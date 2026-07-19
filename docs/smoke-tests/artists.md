# Smoke — Artists (create flow)

The three-step Artist Builder (`<ArtistCreateSlideOver>`, `src/components/shell-v2/`)
— the ONE create-artist surface, reached from the workspace `/artists` page
("New artist" button), the artist/tour switcher's "+ Create new artist" CTA, and
the `/dashboard` pick-artist gate. Spotify search runs server-side via
`/api/spotify/search`; create posts to `/api/artists`.

Format + conventions: see [README.md](README.md).

---

#### AB-01 — Search-as-you-type returns results without Enter
**Do**: Open the builder (New artist). Type an artist name into the Find input.
**Expect**: after ~250–280ms of no typing, Spotify result rows appear with **no
Enter and no button press** — each row shows a 46px artwork thumb, name, genres
(muted), and follower count (mono, right). While the request is in flight a quiet
"Searching…" line shows; "add manually" never flashes before results have had
their chance. **Needs-live** (Spotify creds).

#### AB-02 — Next enables on selection alone, no ambient artist selected
**Do**: Ensure NO artist is selected in the app (empty artist pill / fresh
workspace context). Open the builder, search, and **click a result row**.
**Expect**: the row shows a selected state (orange border + check) and the
footer **Next** enables the instant the row is clicked. Its enabled state derives
ONLY from the flow's local `selected !== null` — it does **not** read
`ArtistTourContext`, the selected-artist pill, or any ambient selection. (This is
the reported bug: previously you had to switch the selected artist to enable
progress.) **Code-verified** (`Next` `disabled={!selected}`); **Needs-live**.

#### AB-03 — Confirm step renders artwork + name + available metadata
**Do**: From AB-02, click Next to reach **Confirm**.
**Expect**: large 132px artwork, name in the condensed display face, **SPOTIFY ID**
(mono, truncated) confirming the link, and a reassurance line. Genre chips +
FOLLOWERS/POPULARITY stats render **only when Spotify actually returns them** and
are cleanly hidden otherwise (no empty "—" placeholders).

> ⚠️ **Spotify app access dependency (verified 2026-07):** our current Spotify
> credentials are NOT in extended-access mode, so every catalog endpoint
> (`/v1/search`, `/v1/artists/{id}`, `/v1/artists?ids=`) returns a **stripped
> artist object** — only `external_urls/href/id/images/name/type/uri`. `genres`,
> `followers`, and `popularity` are **withheld at the source**, so they show empty
> until the Spotify app is granted extended quota mode in the Spotify developer
> dashboard. The route mapping + UI are already wired to light them up the moment
> access is granted — this is an OPS action, not a code change. Artwork + name +
> Spotify ID work today. **Needs-live** (full metadata blocked on Spotify access).

#### AB-04 — Manual escape hatch → step 3 → null-Spotify-id artist
**Do**: On Find, click "Not on Spotify? Add manually →" (or, after a no-match
search, the "Add '<query>' manually →" card). Fill Display name, click
**Create artist**.
**Expect**: the manual link jumps straight to **Details** (step 3) with a blank
Spotify link; creating posts to `/api/artists` with **no `spotify_id`**; the
artist saves and its artwork degrades gracefully (initials tile, no broken image).
**Needs-live**.

#### AB-05 — Details are skippable; created artist opens its page
**Do**: Reach Details via the Spotify path. Leave the prefilled Display name /
default currency as-is and click **Create artist**.
**Expect**: creation succeeds with the Spotify id persisted; the workspace/switcher
entry point navigates to `/artists/[new-id]` (the dashboard gate selects the new
artist). Nothing on Details is required beyond a non-empty name. **Needs-live**.

#### AB-06 — Back navigation clears selection correctly from step 2
**Do**: On **Confirm**, click "Wrong artist? Search again →".
**Expect**: returns to **Find** and CLEARS the selection (Next is disabled again
until a new row is picked). Plain **Back** from Confirm returns to Find keeping the
typed query; Back from Details returns to Confirm (Spotify path) or Find (manual
path). **Needs-live**.

#### AB-07 — Currency control is StyledSelect with `$ USD`, no native chevron
**Do**: On **Details**, open the Default currency control.
**Expect**: it is the app's `<StyledSelect>` (custom button + listbox, **no native
browser chevron**), options labelled **symbol-first** — `£ GBP`, `$ USD`, `€ EUR`,
`A$ AUD` (from `TOUR_CURRENCIES`), NOT `USD $`. Default is GBP. The chosen currency
persists onto the artist (`branding.default_currency`). **Code-verified**
(`StyledSelect` + `TOUR_CURRENCIES`); **Needs-live**.
