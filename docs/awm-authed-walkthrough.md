# advancewithme.live — Authed Walkthrough (free tier)

**Date:** 2026-04-19
**Account:** adamgrowley@gmail.com (no Stripe subscription)
**Blocker hit:** Event creation (/events → Create New) is paywalled behind **Advance Pro** (Solo $120/mo, Duo $195/mo, annual saves 24%, Stripe-backed).

---

## 1. Nav + IA (authed)

Top nav: **Dashboard | Tours & Events | Templates | Invites**, right side: bell (Notifications) + avatar (AR).

Account modal (click avatar):
- Avatar upload (camera badge on profile pic)
- Name + email
- Upgrade to Pro
- Appearance: Light (light/dark toggle)
- Contact Us
- Sign Out

No billing / team / org / API settings visible on free tier.

---

## 2. Dashboard (`/dashboard`)

Three stat cards across top:
1. **This Week** — events count (0)
2. **New Invites** — need action (0)
3. **Active Collaborations** — accepted invites (0)

Then in order:
- **This Week** panel: events happening in next 7 days
- **Upcoming** panel: advances in next 30 days
- **Recent Activity** panel: per-account activity feed, grouped by "Last Week / This Week / etc.". Example entry observed: *"You created labor call template 'Standard Show Day' — 2 days ago"*. Includes a `View All Activity` button.
- **Quick Actions**: View All Events / Manage Invites / Templates tile buttons
- Empty-state welcome card at the bottom

**Implication for Lowpass:** Dashboard is a global-workspace overview, not a per-tour home. The Recent Activity feed is a notable feature — cross-entity audit log rendered as a human timeline.

---

## 3. Tours & Events (`/events`)

- Heading "My Tours & Events"
- Filter: **All Types** (Type filter)
- Sort: **Created (Newest)**
- Primary CTA: `Create New` → **PAYWALL**
- Secondary card: "Looking for advances you've been invited to?" with `View Invites`

### Paywall modal (Upgrade to Advance Pro)

Features listed:
- **Tour & Advance Management** — Full access to create and manage unlimited tours and advances with our complete workflow tools
- **Advance Pro AI** — Smart automation and AI-powered features to streamline your advance process
- **Advance Templates** — Access to pre-built templates and the ability to create custom templates for faster advance creation
- **Collaboration** — Invite venue representatives and tour team members to collaborate on advances in real-time

Plans:
- **Solo** — $120/month, for individual tour managers / production managers
- **Duo** — $195/month, 2 users, save $45/month vs individuals
- Annual toggle: save 24%
- "Secure payment powered by Stripe"

**Confirmed intel:**
- Unlimited tours/advances on Solo (no hard cap advertised)
- "Advance Pro AI" is branded as a distinct paid feature (confirms AI autopopulate is behind paywall)
- Custom templates are paid (free tier = previews only)
- Collaboration / real-time are headline paid features

---

## 4. Invites (`/invites`)

Tabs: **All Upcoming**, **New Requests (0)**, **Active (0)**, **Archive (0)**.
Search bar: `Search by artist, event, or venue…`.
Date filter: `All Upcoming`.
Empty state: *"You have no pending invites yet. New invites will appear here"*.

**Implication:** Invites are a first-class inbox, not a flag on events. Invite lifecycle has at least 4 states (pending / new request / active / archived).

---

## 5. Templates (`/templates`)

Four sub-tabs:
1. **Advance**
2. **Labor Call**
3. **Rider & Info Sheet**
4. **Daysheets & Schedules**

Header CTAs on each tab: `Restore Defaults` + `Create New Template`.
Free-tier users can **preview** default templates (Read Only) but not edit/create. Except — Rider templates appear editable to my free account (URL accepted POST-style reorder/save buttons rendered). Needs paid re-test to confirm if save actually persists.

### 5a. Advance templates

Defaults observed (5):
- General Advance
- Club + Theater
- Artist Festival Advance
- Amphitheater
- Arena

URL pattern: `/templates/<firestore-id>` — e.g. `/templates/CkPiSWEYMuWEKOy40J2j`.

**"General Advance" template structure** (preview):
- Top banner: "Preview Mode — Read Only — You're viewing this template as a preview. Upgrade to Advance Pro to create and edit your own templates, add custom fields, and build your advance workflow."
- Breadcrumb: `Templates > General Advance`
- 8 sections, each with icon + name + field count badge
- Each field row has a name and a **type badge** on the right

Sections + field counts:

| # | Section | Fields |
|---|---|---|
| 1 | Venue Contacts | 8 |
| 2 | General Venue Details | 17 |
| 3 | Production | 20 |
| 4 | Parking and Transportation | 8 |
| 5 | Dressing Rooms + Back of House | 12 |
| 6 | Union + Labor: Venue | 8 |
| 7 | Security + Safety: Venue | 10 |
| 8 | Merchandise | 21 |
| **Total** | | **104** |

Field types observed across all sections:
- **Short text** — single-line string
- **Long text** — multi-line textarea
- **Multiple choice** — radio / select (likely yes/no or predefined options)
- **File** — attachment (e.g. parking map, tech pack, labor estimate PDF)

Sample field examples (to show naming convention):
- "Venue Production Contact" → Short text
- "What is the Venue Name & Address" → Long text
- "Indoor / Outdoor Event" → Multiple choice
- "Please upload a tour specific parking map" → File
- "Please attach the venues most current tech pack" → File
- "Is there a Venue Curfew?" → Multiple choice
- "What time is the Venue Curfew if applicable?" → Short text

Naming is very "question-form" ("What is…", "Please provide…", "How many…"). Field labels average 8-15 words.

### 5b. Labor Call templates

Default observed (1):
- **Standard Show Day** — 5 call times:
  - Chalk — 07:00
  - Load In — 08:00
  - Show Call — 18:30
  - Early Call Back — 21:00
  - Load Out — 22:00

**Implication:** Labor call templates are a simple ordered list of `{label, time}` pairs. Much flatter schema than advance templates. No types per row beyond time-of-day.

### 5c. Rider & Info Sheet templates

Default observed (1):
- **Standard Rider** — 7 sections / **72 items** total

URL pattern: `/templates/rider/<firestore-id>` — e.g. `/templates/rider/eULAMB0e8KWF5eLueLE5`.

Unique vs Advance templates:
- Top-level `Set document title…` and `Add subtitle…` (document metadata that renders on the output)
- `Save Changes` / `Reorder` / `Add Section` buttons at top
- Each section has `Add Item` + `Attach file` at bottom — so **every section supports a file attachment**
- Items are draggable (`press space bar to pick up…` aria hint) — reorderable both within and across sections
- Items have labels but the "type" concept is simpler — every item is essentially a labelled value field with "No value" placeholder

Rider template sections (Standard Rider):

| # | Section | Items |
|---|---|---|
| 1 | Tour Contacts | 8 |
| 2 | Transportation + Parking Requirements | 7 |
| 3 | Runners and Vehicle Needs from Venue | 4 |
| 4 | Catering + Hospitality | 13 |
| 5 | Dressing Room Summary | 16 |
| 6 | Production + Technical | 15 |
| 7 | Security | 9 |
| **Total** | | **72** |

**Implication:** Rider = "document to send TO venue" (tour's needs), Advance = "document to receive FROM venue" (venue's details). Same sectioned shape, different direction of information.

### 5d. Daysheets & Schedules

- No default templates
- Empty state: *"You have no daysheet or schedule templates yet. Save a daysheet from an advance, or create one from scratch."*
- CTA: `Create New Template`

**Implication:** Daysheets are derived FROM advances (or built blank). They're the show-day running order artifact — the output.

---

## 6. Entity model inferred

Four template kinds, distinct collections:
1. **Advance template** → typed-field questionnaire sent to venue rep for fill-in
2. **Labor Call template** → ordered `{label, time}` list for crew scheduling
3. **Rider & Info Sheet template** → reverse-direction document (tour → venue) with attachable files per section
4. **Daysheet/Schedule template** → show-day running order, typically promoted from a completed advance

Each advance instance per show probably stores `{templateId, overrides, answers, attachments}` with Firestore `onSnapshot` providing live collaboration.

---

## 7. What the free tier did NOT unlock

- Creating a Tour or Event (paywalled)
- Creating custom templates (paywalled)
- Editing default Advance templates (paywalled; Rider templates may be editable — needs re-test)
- Autopopulate / AI features (paywalled, branded "Advance Pro AI")
- Sending invites / collaborator flows (paywalled)
- Share-link flows / PDF export from a live advance (paywalled — require event)
- Billing / plan management surface
- Notifications feed (bell icon only rendered empty for this account)
- Activity feed beyond 1 entry (only template-creation was logged)

---

## 8. Implications for Lowpass BUILD_PLAN

Keep the plan as-written. The authed walk **confirms** rather than changes the direction:

- ✅ **Four template kinds** (Phase E+) — keep as-is; Lowpass already has flexible advance sections, we add labor/rider/daysheet as additional template kinds with their own schemas.
- ✅ **Typed fields in Advance templates** — worth borrowing. The competitor's `Short text | Long text | Multiple choice | File` taxonomy is minimal but effective. Lowpass's JSONB sections already allow this but might benefit from explicit field-type metadata rather than freeform blobs.
- ✅ **Rider = separate document type** — new territory. Phase E should split out Rider as its own entity, not just another section of Advance.
- ✅ **Daysheet = derivable from advance** — implementation hint: daysheet builder should read existing advance schedule/labor-call rows.
- ✅ **Activity feed** — cross-entity audit log (Phase J or a new Phase). Already on Lowpass's map as "TBD".
- ✅ **Invites inbox with 4 states** — design Lowpass's Phase D invite lifecycle with New Request / Active / Archive states.
- ✅ **Firestore `onSnapshot` analogue = Supabase Realtime** — already planned Phase B.
- ⚠️ **Paywalled features (AI autopopulate, real-time collab, invites/share, PDF)** — we haven't seen their implementations from the inside, but the public-side research already captured the UX. Not a blocker.

---

## 9. Decision point

You can choose:

**(a) Keep going on what we have.** The public research + this authed walk gives enough surface to execute Phase A0 → Phase K. The paid features' *implementations* are inferred from public landing pages + hidden from us, but their *user-facing behaviour* is well-documented.

**(b) Pay $120 for one month of Solo.** Unlocks event creation, full template editing, AI autopopulate, share flows, invites, PDF. Gives ground-truth screenshots of every feature. Tax-deductible as competitive research. One-month only; cancel before month 2.

**(c) Skip remaining walkthrough entirely and ship.** Start Phase A0 (nav rework) today; revisit authed walk only if a specific feature's exact UX is ambiguous during build.

My take: **(a) or (c) is fine.** The competitor's paid surface is close enough to what we've already catalogued. Phase A0 is nav-only and doesn't depend on any paywalled insight. Phases A–C also don't require paid access — PDF, share, realtime are generic implementations.

---

## 10. Credentials note

Username/password for advancewithme.live is now in this chat transcript. **Rotate it** when you have a moment — account creation is free so worst case just sign up fresh if you ever need back in.
