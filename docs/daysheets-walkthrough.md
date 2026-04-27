# Daysheets (daysheets.com) — product walk, unauthed
Date: 2026-04-20

Sources fetched (all live, 2026-04-20):
- https://www.daysheets.com/ (landing, HTTP 200)
- https://www.daysheets.com/pricing (HTTP 200)
- https://apps.apple.com/us/app/daysheets/id1579012240 (App Store, HTTP 200)
- https://play.google.com/store/apps/details?id=com.daysheets.daysheets.android (Play Store, HTTP 200)
- https://www.daysheets.com/features — **404, no such page**
- https://www.daysheets.com/product — **404, no such page**

The site has no dedicated `/features` or `/product` page. Product messaging all lives on the landing page, with pricing details on `/pricing`. There are also `/blog`, `/labs`, `/labs/stageplot`, `/labs/prototypes`, `/labs/ideas`, `/download`, `/docs` — not walked here.

---

## 1. Summary

Daysheets is a **modern tour management platform for artists, tour managers, and production teams** (landing meta description). It replaces legacy PDF-based day-sheet workflows and competes explicitly against Master Tour (named by reviewers, never by Daysheets itself). Platforms: native macOS app, native iOS app, Android (via PWA / limited native), plus a separate product `daysheets.travel` for travel-agent workflows. Positioning line: "The New Standard for Tour Management. Plan Tours. Book Travel. All in One Place."

Target users described on pricing: DIY bands (Free), club tours (Plus $39/mo), theatres+ (Pro $70/mo), global tours / multi-org (Teams $249/mo).

---

## 2. Core modules

Named on the landing page and/or pricing feature matrix:

- **Schedule** — tour-wide event schedule; headline module next to Personnel. "View and update your entire tour schedule from anywhere." Dark-mode screenshot called out as "Daysheets Schedule View - Dark Mode".
- **Personnel** — roster of people on the tour. Pricing tiers are gated by "personnel per tour" count (5 / 25 / 50 / 100+).
- **Flight Grid** — flights module. "See departure times, airports, airlines, and travelers in one clear view." Supports commercial flights and **charters** (with worldwide FBO search + timezone handling). Can export grids.
- **Import Flights** — "With Daysheets AI, upload dozens of travel reservations at once, we'll add everything and build a beautiful grid." (AI is a Pro+Teams gated feature per pricing matrix.)
- **Hotels** — "Book hotels … on the go." Recent release notes mention hotel reservation addresses and notes / confirmation numbers.
- **Ground Transfers** — listed as a pricing feature. Release notes: "Added support for bus, ferry and train transfers in the schedule."
- **Guest Lists** — "Manage venue access and passes right from your phone." Release notes reference pass types, per-guest pass types, and a guest list request form.
- **Notes** — "Add general notes to keep important travel details in one place." Also **Private Notes** as a paid-tier feature.
- **Travel Profiles** — per-person travel info including passports. "Never miss an expiring passport again. We'll remind you." Legal-name field added in release notes.
- **Personnel Groups + Group Tags** — "Group Tags … a brand new way to departmentalize your team, and personalize their itineraries." Groups gate visibility: "Admins see everything, but your A Party will just see what they need." Sub-groups within groups.
- **Visibility** (paid feature) — mechanism by which some personnel see only subsets of the schedule.
- **Calendar Feeds** — listed in pricing matrix. Interpreted as iCal/webcal subscriptions (not explicitly stated).
- **Import Personnel / Import Flights** — bulk import, gated by tier.
- **PDF Export** — listed in pricing matrix.
- **Notifications & Reminders** — "Schedule as many reminders as your team member needs." Push notifications for schedule changes.
- **Day View / Calendar View / Routing View / Map View** — four named **views** on mobile (single screenshot label strip, no further copy).
- **Multi-day** — "Introducing Multi day" — adds support for events spanning multiple days. Mobile tour creation supports multi-day (release notes).
- **Day Types** — colored day classifications on the monthly calendar. Release notes: "Support for custom colors on day types", "Support for individuals tagged on day types", "multiple day types on the same date".
- **Daysheets AI** — umbrella term for AI-assisted imports; gated to Pro+Teams.
- **Offline Editing** — native-app feature listed in pricing matrix for some tiers.
- **Calculated Drive Times** — routing feature in pricing matrix.
- **Live Sync** — "Real-time Sync. Changes sync instantly across all devices and team members." Release notes repeatedly reference Live Sync reliability.
- **Stage Plot Software** — under `/labs/stageplot`, surfaced as a separate Labs product, not integrated on the landing.

---

## 3. Interaction patterns (their words)

Paraphrased unless in quotes. Attribution: (stated by product) = copy on daysheets.com or store listings; (observation) = inferred from screenshots / release notes.

- **Keyboard shortcuts** — "Keyboard shortcuts, imports and exports, all in a beautiful interface." (stated, landing)
- **"Shortcuts for speed"** — "Quick shortcuts let you add, edit, and find things in seconds." (stated, landing) — separate callout from keyboard shortcuts, implies in-app command palette or quick-add menu (observation).
- **Mobile-first editing parity** — "Changes big or small your tour shouldn't require you to pull out your laptop. Daysheets Mobile is built for immediate response." (stated)
- **Full Mobile Creation** — "Create new events, add personnel, and build itineraries anywhere." (stated) — i.e. mobile is not read-only.
- **"All / Me" filter toggle** — release note 2026-ish: "We've replaced the 'All Flights / My Flights' toggle with an 'All / Me' toggle, allowing users to filter out events, notes, hotels, and flights that don't pertain to their group or group tags." This is a **global per-user personalisation toggle across every module**, not per-screen.
- **Per-person personalised itineraries** — via Group Tags and Visibility. Admin sees full tour; a "B Party" member sees only their subset. (stated)
- **Party filter chips** — landing shows chips labelled "All Parties / A Party / B Party / C Party" above a schedule view. (observation from screenshot alt text + labels)
- **Offline-first caching** — "Key data is cached locally. You can view schedules without a connection and changes will sync when you're back online." (stated, pricing FAQ)
- **Mac-native speed claim** — "Download the native Mac app for speedy tour creation. Maintain details with keyboard shortcuts, imports and exports." (stated, pricing)
- **PWA on Android** — "Daysheets runs on modern browsers and is optimized for iOS and Android via the browser. A PWA can be installed for offline-like access." (stated, pricing FAQ) — confirms Android is PWA-first (this matches Android reviews complaining about parity gaps).
- **Push notifications** — "Stay informed with instant alerts for schedule changes." (stated)
- **Multi-tour / multi-org switching** — "You can switch contexts without logging out." (stated, pricing FAQ)
- **Multi-org collaboration** — "Collaborate on other tours" listed as a Plus+Pro+Teams feature — implies cross-org invite model.

---

## 4. Visual / design language

### Words Daysheets uses about itself (landing page):
- "Daysheets is designed for **speed and clarity**."
- "We're introducing a **modern** approach to keep your tours organized."
- "…all in a **beautiful** interface."
- "Build a **beautiful** grid." (re Flight Grid)
- "A mobile experience that your crew will thank you for."
- "**sleek and elegant** mobile experience" (App Store long description)
- Theme-color meta tag: `#0f172a` (slate-900 / very dark navy). Site emphasises **dark mode** — schedule screenshot alt text is literally "Daysheets Schedule View - Dark Mode".

### Words reviewers use (App Store):
- "sleek, intuitive interface and personalization options"
- "how pretty the interface is"
- "ease of use" vs competitor "clunky"

### Concrete visual affordances visible from screenshot alt text:
- **Dark mode is the marketed default** (landing's featured screenshots are dark).
- **Flight Grid** is a single dense tabular view ("one clear view", "grid", "dashboard").
- **Monthly calendar with coloured Day Types** — cells tinted by event type, with custom colors per tour.
- **Party chips** above schedule lists (All Parties / A Party / B Party / C Party).
- **Four mobile views** explicitly offered as tabs/modes: Day, Calendar, Routing, Map.
- **An "Add menu dropdown" screenshot** is called out on mobile — implies a global `+` add menu as a primary affordance.

### What I could NOT determine from unauthed landing / store pages:
- Exact font family / type stack.
- Colour tokens beyond the `#0f172a` theme color.
- Row height, padding, or density of the schedule.
- Whether day-view events are laid out as a **time column + rows** (classic daysheet) vs a **card stack**. The only schedule screenshot is described as "Schedule View" without structural detail.
- Whether editing is **inline** on rows vs a **side panel** or **modal**. No copy confirms.
- Context-menu / right-click behaviour — not mentioned.
- Exact keyboard shortcut list — claimed but not enumerated publicly.
- Hover states, focus states, selection model for bulk operations.
- How the "filter to A Party" control actually looks up close (chip vs segmented vs dropdown).

---

## 5. Pricing & gating

Four tiers (monthly/annual toggle exists; prices below are annual-billed monthly equivalents):

| Tier | Price | Personnel/tour | Audience | Key gates |
|---|---|---|---|---|
| Free | $0 | up to 5 | "DIY bands" | Baseline features only |
| Plus | $39/mo | up to 25 | "club tours" | Adds: Collaborate on other tours |
| Pro | $70/mo | up to 50 | "theaters and up" | Adds: Groups & Visibility, Daysheets AI |
| Teams | $249/mo per org | 100+ | "global tours" | Unlimited editors per org, Onboarding & priority support |

Feature matrix rows (all four tiers share unless noted):
- Create tours on MacOS / iOS
- Edit tours on iOS
- Offline Editing
- Calculated Drive Times
- Add Flights / Add Hotels / Guest Lists / Ground Transfers
- Create Notes
- Maintain Travel Profiles
- Export PDFs
- Create **Private Notes** (paid only — exact tier not grep-confirmed but implied Pro+)
- Create Personnel Groups
- **Create Group Tags** — Pro+
- **Visibility** — Pro+
- Calendar Feeds
- Import Personnel / Import Flights — AI-powered, Pro+
- Support ladder: Email & Text → Phone → Priority → Dedicated Slack Channel (Teams only)
- Onboarding (Teams only)

**Gating implications for our product positioning:**
- Table-stakes they charge for at the bottom tier: Flights, Hotels, Guest Lists, Ground, Notes, Travel Profiles, PDF export, Drive Times, Personnel Groups.
- Premium (Pro+): **Visibility / Group Tags / AI import**. These are the differentiators Daysheets monetizes.
- Enterprise (Teams): multi-org, multi-tour, priority support.

---

## 6. Gaps — what I couldn't determine without an authed walk

Concrete things I cannot cite from the fetches:

1. **Day-sheet page layout** — is it a time-column timetable? A grouped list of events by slot? A kanban? None of the fetched copy or screenshot alt text says.
2. **Row structure of a schedule entry** — does each row have a dedicated time column, an icon column, a title, a sublabel, a party chip, or an assignee avatar stack? Not determinable from marketing copy.
3. **Inline edit vs modal** — no copy confirms.
4. **Context menu / right-click** — not mentioned.
5. **Drag-and-drop reordering** of schedule entries — not mentioned.
6. **Selection / bulk actions** — only confirmed for flights ("select the ones you want and save the grid"). Unknown in schedule / guest list.
7. **Exact colour palette** beyond the `#0f172a` theme-color.
8. **Typography** — no font disclosed.
9. **Specific keyboard shortcuts** — list not published.
10. **Empty-state copy**, **loading states**, **error states** — none visible.
11. **How Group Tags visually chip up** on a row — are they a colored dot, a label, a badge stack?
12. **What Routing View and Map View actually contain** — only names, no captions.
13. **How the "Add menu dropdown" is structured** — screenshot alt text exists, content unknown.
14. **Calendar Feeds** — webcal? token-authed? per-person? unclear.
15. **Guest list request form** — referenced in release notes only, UX unknown.
16. **Private Notes permission model** — unknown.
17. **App Store screenshot captions** — Apple's page loads them via JS; curl-scraped HTML does not contain them. Would need a headless browser to capture.
18. **Play Store screenshot captions** — likewise not in the static HTML; only alt="Screenshot image" placeholders.

---

## 7. Implications for Lowpass prompts

Confident design choices we can cite in Cursor prompts, each traceable to a specific quote:

1. **Dark mode is the hero state, not an afterthought.** Daysheets' marketed schedule screenshot is "Schedule View - Dark Mode"; theme-color is `#0f172a`. Lowpass should nail dark-mode parity, and hero/marketing screenshots should be dark.
2. **One universal "All / Me" toggle across every module** (schedule, notes, hotels, flights). Daysheets explicitly consolidated to a single toggle. Lowpass's advance/daysheet views should have one global personal-filter control, not per-module toggles.
3. **Party chips are the primary schedule filter** — "All Parties / A Party / B Party / C Party" visible as a chip row. Lowpass schedule header should use chip-row filtering over dropdowns for crew groups.
4. **Mobile reaches parity, not a subset.** "Full Mobile Creation … Create new events, add personnel, and build itineraries anywhere." Lowpass mobile should not be a read-only companion — daysheet editing must work on mobile.
5. **Flight data presents as a single dense grid.** Daysheets calls it "Flight Grid" and markets "one clear view" + export. Lowpass's flights view should be a sortable grid, not a card list.
6. **Group Tags = sub-groups that personalise per-person itineraries.** Our Personnel/Group model should support nested tags and a visibility layer where non-admins see only their group's schedule. This is what Daysheets charges Pro for — it's the main moat.
7. **Speed/clarity/beauty is the stated vocabulary** — when writing UI copy or acceptance criteria, prefer "beautiful", "clear", "modern", "speedy", "immediate response" over generic "clean and spacious".
8. **Day Types with custom colours** on the monthly calendar — Lowpass show types (show/off/travel/press) should render as coloured cells on the month view, with configurable per-tour colours.
9. **A global `+` add menu on mobile** is an explicit screenshot callout ("Add menu dropdown") — Lowpass mobile should have a persistent FAB / add-menu, not per-screen add buttons.
10. **Four mobile views: Day, Calendar, Routing, Map.** Lowpass mobile navigation for a tour should offer these four pivots by default.

---

## Appendix: Useful verbatim quotes (for future prompt attribution)

All from https://www.daysheets.com/ unless noted.

- "The New Standard for Tour Management. Plan Tours. Book Travel. All in One Place."
- "Daysheets is designed for speed and clarity."
- "Keyboard shortcuts, imports and exports, all in a beautiful interface."
- "See departure times, airports, airlines, and travelers in one clear view."
- "The Flight Grid keeps every leg of your tour running on time."
- "With Daysheets AI, upload dozens of travel reservations at once, we'll add everything and build a beautiful grid."
- "Search FBOs worldwide, we'll handle timezones."
- "Changes big or small your tour shouldn't require you to pull out your laptop."
- "Daysheets Mobile is built for immediate response."
- "Admins see everything, but your A Party will just see what they need."
- "Group Tags … a brand new way to departmentalize your team, and personalize their itineraries."
- "A mobile experience that your crew will thank you for."
- "Day View / Calendar View / Routing View / Map View" (mobile-view label strip).
- "Notifications & Reminders — Schedule as many reminders as your team member needs."
- "Travel Profiles — Never miss an expiring passport again. We'll remind you."
- [App Store long description] "Designed by tour and production managers at every level of touring, Daysheets is the best in class tour management software. Bands and their teams can stay up to speed with a sleek and elegant mobile experience, while their tour and production managers use an efficient app to enter the details in record time."
- [App Store release notes, recent] "replaced the 'All Flights / My Flights' toggle with an 'All / Me' toggle, allowing users to filter out events, notes, hotels, and flights that don't pertain to their group or group tags."
- [App Store release notes] "Added support for bus, ferry and train transfers in the schedule."
- [App Store release notes] "Support for custom colors on day types" / "Support for individuals tagged on day types" / "multiple day types on the same date".
- [Pricing FAQ] "Daysheets runs on modern browsers and is optimized for iOS and Android via the browser. A PWA can be installed for offline-like access."
- [Pricing FAQ] "Key data is cached locally. You can view schedules without a connection and changes will sync when you're back online."
