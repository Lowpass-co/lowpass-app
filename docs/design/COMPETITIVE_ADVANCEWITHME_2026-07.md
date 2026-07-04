# Competitive teardown — AdvanceWithMe (2026-07-04)

Two-agent web research pass (product teardown + market sentiment). Every claim sourced; confidence marked. Companion to `DESIGN_DIRECTION_2026-07.md` — the beat-list maps onto existing Lowpass specs.

## 1. What they are

Advance with Me, LLC (Delaware). Single-purpose SaaS for the show-advance workflow only — they explicitly disclaim tour logistics/travel scope (their FAQ) and position against Master Tour by narrowness. Core objects: Tours/Events → per-show Advances, plus Labor Calls, Daysheets, Riders, and 4 template types (advance / rider / labor / schedule). AI (OpenAI) extracts fields from uploaded tech packs/PDFs into advances with user review. Venue collaborators join via invite links **but must create accounts**; external perms are section-scoped. Pricing: **no free tier — Solo $120/mo**, Duo $195, Team $295–395+, contributors free.

**Maturity: early/thin.** No mobile app, no integrations, no help center, no blog/changelog, ONE public testimonial (Grand Ole Opry talent manager), no G2/Capterra listing, no press, no funding record, no discoverable team beyond one "Michael" (Calendly), and — decisive — **zero third-party sentiment anywhere on the indexed web**: no Reddit, Gearspace, ControlBooth, X, or YouTube mentions at all (confirmed across 6+ targeted searches, 2026-07-04). Either very new or very small.

## 2. The "great templates" — what the research actually found

**No field-level taxonomy is public.** No template gallery, no labeled screenshots, no docs. Confirmed section names only: venue information, production notes, hospitality, scheduling, labor call, daysheet, rider, documents/links, contacts, house rules/show notes. Confirmed field primitives: text, number, toggle, choice, link, file — **six generic types**. Their "templates" are, as far as the public web shows, a generic typed-field builder under named categories — structurally the same thing Lowpass already has, except **Lowpass ships twelve field types** (adds textarea, currency, date, time, contact, slider) plus purpose-built blocks (meal times, flights, personnel multi-select, deal-info AI upload).

Honest caveat: if Adam's "their templates are great" comes from seeing a demo or a real advance built in it, that private knowledge beats this public-web null result. Two cheap options: brain-dump what you saw into a note, or book their group demo (public Calendly) and screen-note the template contents. Until then, §6's catalog draft is built from their confirmed categories + industry-standard advance practice, for YOUR grading — you're the TM.

## 3. Head-to-head (Lowpass current/specced vs AWM confirmed)

| Dimension | AdvanceWithMe | Lowpass |
|---|---|---|
| Scope | Advance only (by design) | Routing spine + Advance + Budget/settlement/payroll + Production tools + Rooming |
| Field types | 6 generic | 12 + domain blocks |
| Templates | 4 types, reusable | Advance templates + apply-with-merge-modes + rider inheritance chain (artist→tour→show) |
| Venue input | Invite link → **account signup required**, section-scoped perms | Token intake form, **no signup**, tm_only exclusions, additive never-clobber merge |
| AI | OpenAI tech-pack → autopopulate w/ review | Claude deal-memo → review-before-write; receipts OCR; suggestions gate; RAG ⌘K |
| Labor calls | **First-class object + template type** | ❌ none — the one object they have that you don't |
| Daysheets | First-class + PDF | Day exports exist; day-sheet-as-object weaker |
| Real-time collab | "One working document" positioning | Autosave everywhere; no presence indicators (neither has real presence proof) |
| Notifications | None found | None — open lane for both |
| Mobile | None | `/m/*` PWA routes (today, deal memos, files, shows) |
| Roles | Owner/Admin/Editor/Viewer + scoped external | Workspace roles; per-artist grants pending (flagged decision) |
| Pricing | $120/mo floor, no free tier | Entitlements seam ready; pricing unset — strategic freedom |

## 4. The real war: venue compliance (sourced market insight)

The documented, vendor-independent pain in advancing is **venues not filling the forms**: techs rarely see riders, info lands 2–3 days out, venues skip forms they think their tech pack already answers (tourmanager.info; theefficienthustle.com 2020, directionally credible). AWM's answer adds friction — venue staff must create accounts. **Lowpass's no-signup token intake is structurally better positioned to win compliance.** The beat-move is to make venue-side completion nearly free:

- Pre-fill intake from `canonical_venues` + any past show at the same venue ("we played EXIT/IN in March — 9 of 12 answers carried over, confirm or correct").
- Accept the venue's OWN tech pack as the answer: intake page offers "upload your tech pack instead" → AI extraction → TM reviews via the existing accept/reject grammar. This directly dissolves the documented "my tech pack already covers this" refusal.
- Mobile-first intake rendering (venue reps answer from a phone side-stage).
- Nudges: scheduled reminder emails on unanswered intakes (needs the notification lane — see §5.3).

## 5. Beat-list (ranked, mapped to existing plans)

1. **Weaponize no-signup intake + tech-pack-upload answer path** (§4) — extends Advance Share/intake (CC_DESIGN_PASS Stage 2) + a new extraction endpoint reusing the deal-memo pattern. Highest strategic value; attacks the market's real pain at their weakest point (forced signup).
2. **Labor calls as a first-class object** — crew call times per day (department, call, location, contact), template-able, on the day export and `/m/today`. Fits Operations/Crew; new spec needed. Closes their only object-level advantage.
3. **Day sheet as a designed artifact** — already in CC_DESIGN_PASS Stage 7 (export shell); elevate: one-tap "Send day sheet" per day, beautiful, consistent. Their daysheet is a PDF; yours rides the routing spine with live data.
4. **Notification lane** — neither product has one. Intake nudges, advance-status digests, "venue answered" pings. Small scoped spec (email first); big perceived-quality jump.
5. **Suite gravity as positioning** — every AWM customer still needs a routing/budget/settlement tool; you ARE that tool with advancing built in. Marketing line practically writes itself: their $120/mo buys one workflow; Lowpass covers the tour.
6. **Pricing attack** — their floor is $120/mo, no free tier; Master Tour anchors at $49.99 + free mobile. A Lowpass free-or-cheap solo tier with paid product unlocks (the entitlements seam) undercuts both. Decision for Adam, not a spec.
7. **Section-scoped external permissions** (their genuinely good idea worth matching): today Lowpass intake is binary (tm_only or fillable). Add per-counterparty scoping later — venue vs promoter vs local production each see their sections. Roadmap after the multi-user/RLS decision (do NOT build before that flag is resolved).

## 6. Advance/rider field catalog — DRAFT for Adam's grading (unblocks VIS-RB-05)

Built from AWM's confirmed categories ∪ industry-standard advance practice ∪ Lowpass's existing blocks. Sections marked ● exist in Lowpass today, ○ new. Fields are the target superset; grade like a smoke list — strike what a TM never needs, add what's missing.

- ● **Venue info** — name, address, capacity, stage dims, power (type/amps/location), rigging points, loading dock/ramp, truck/bus parking, shore power, curfew, noise limits, wifi (prod), production office.
- ● **Key contacts** — promoter rep, production manager, FOH/MON house techs, hospitality, security lead, local runner (name/phone/email each).
- ● **Schedule** — access, load-in, rigging, backline, soundcheck(s), support check, doors, sets, changeover, curfew, load-out, bus call.
- ○ **Labor call** — per department (steel/audio/lights/video/backline/loaders): headcount, call time, meal break rules, union notes, local company + contact.
- ● **Production/Technical** — PA spec, console(s), monitors/IEM count, mic package source, lighting rig summary, video/LED, spots, haze policy, stage risers, barricades — plus "from Production" links (channel list, stage plot, rider) when integration lands.
- ○ **Backline** — provided-by matrix per item (tour/venue/hire — mirrors owned/rented/venue-supplies), spec per item.
- ● **Hospitality/Catering** — rider version link, meals (count/times/dietary), buyout amounts, dressing rooms (count/keys/showers/towels), laundry, coffee/after-show.
- ● **Parking & access** — vehicle list (type/size/plates), passes, load-in route notes, security check requirements.
- ○ **Security & credentials** — pass sheet (AAA/photo/guest), barricade, escort needs, meet & greet plan.
- ○ **Merch** — seller (venue/tour), rate/split %, location, table/lighting notes, settle time.
- ○ **Guest list & ticketing** — allocation, cutoff time, comps handling, ticket counts feed (ties to income actuals).
- ● **Travel & hotels** — from Rooming/Flights (derived, read-only).
- ○ **Settlement** — settle time/place, who settles, deal recap link (from Deal Info), tax/withholding notes.
- ● **Documents** — deal memo, insurance certs (from artist Business vault), tech pack uploads, misc files.
- ● **Local info** — hospital/pharmacy/gym (existing Places lookup), runner radius notes.

## 7. Sources

Primary fetches: advancewithme.com (/, /features, /for-venues, /for-tour-managers, /pricing, /faq, ToS), advancewithme.live/demo, their Calendly. Market: eventric.com (+clients, support docs), daysheets.com, prism.fm, lasso.io, muzeek.com (secondary), crewflow.io (low conf.), loadinsuite.com (low conf.), tourmanager.info/advancing-shows, theefficienthustle.com advancing post (2020). Null-result searches: Reddit/Gearspace/ControlBooth/G2/Capterra/X/YouTube for "AdvanceWithMe" — zero hits, 2026-07-04. Wayback blocked (403) — history unverified.
