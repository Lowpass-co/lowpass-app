# Lowpass — Sub-processor / Records of Processing (Art. 30)

**Date:** 2026-06-24 · **Status:** DPA links resolved (2026-06-24). Remaining **VERIFY** items are account-specific (regions, whether you've actually accepted each agreement) — I can't read your provider accounts, so those are yours to confirm. Not legal advice.

GDPR Art. 30 requires a record of who processes personal data on your behalf,
for what, and where. This is that register, built from the integrations
evidenced in the codebase (`.env.local.example`, `package.json`, `vercel.json`,
`.mcp.json`). Confirm each DPA is accepted and each region is correct.

| Sub-processor | Purpose in Lowpass | Personal data shared | Region / residency | DPA — how it's in force |
|---|---|---|---|---|
| **Supabase** | Primary datastore: Postgres (all tables), Auth (`auth.users`), Storage (personnel docs, avatars, receipts, rider/artist assets) | Everything — account, roster, contacts, venue-intake, files | **VERIFY** project region (EU vs US — material for transfers) | **Must actively sign.** PDF + PandaDoc at supabase.com/legal/dpa. Not automatic — action required. |
| **Vercel** | Hosting / serverless functions / cron | Transits all request data; logs may capture IP/headers | **VERIFY** function region | **VERIFY** — accept Vercel DPA (vercel.com/legal/dpa) |
| **Anthropic (Claude API)** | AI: deal-memo extract, receipt OCR, budget suggestions, rider summary, stage-plot icons | Document/receipt/budget content sent to the model — may contain names, dietary/passport data (riders), financial data | US (**VERIFY**) — SCCs included for UK/EU transfer | **Auto-incorporated** when you accepted the Commercial Terms of Service. Default: API logs auto-delete after 7 days, no opt-in, no training on inputs. View/request signed copy at privacy.claude.com. ZDR available for qualifying accounts. |
| **Google — Maps/Places/Geocoding/Directions** | Venue/airport lookup, geocode, drive times | Venue names + addresses + coordinates (location data) | Global (**VERIFY**) | **Accept once** via Cloud Console → IAM & Admin → Cloud Data Processing Addendum → Review and Accept (one project covers the account). |
| **Google — Custom Search (CSE)** | Equipment "auto image" lookup | Equipment query strings (low personal data) | Global | Covered by the same Cloud DPA accept above. |
| **Google — Gemini embeddings (Generative Language API)** | Per-workspace RAG index: embeds **PII-stripped** operational text from deal memos / venues / budget line items (model `gemini-embedding-001`) | **Non-personal by construction** — the ingestion allow-list (`src/lib/ai/rag/sources.ts`) excludes all DATA_MAP F1/F3 identity/special-category columns + free-text/JSONB blobs; only commercial figures + business venue facts are embedded | Global (**VERIFY**) | Covered by the same Cloud DPA accept above (one project covers all Google APIs). |
| **Google — Docs / Drive (service account)** | Rider-pack Google Doc export + file storage | Rider content + whatever the doc contains; **personnel docs/passport scans if STORAGE_PROVIDER=google_drive** | **VERIFY** | Cloud DPA above (Workspace: Admin console → Account settings → Legal & compliance). |
| **Google — Stitch / Generative AI** (keys in `.mcp.json`) | **VERIFY in use** — dev tooling? | **VERIFY** | — | Rotate keys (audit M7); remove from register if not a production processor. |
| **Resend** | Transactional email: notifications, intake alerts, invites | Recipient email + name + notification content | US — DPF-certified incl. UK extension; SCCs | **Auto-binding** on ToS acceptance. Full text resend.com/legal/dpa. Confirm your account accepted current ToS. |
| **Spotify** | Artist search + images | Artist names/queries (your own catalogue data) | Global | Public API — likely **not a processor** of your data subjects (you query it; it's a data source, arguably a controller in its own right). Note for counsel; probably drop from the Art. 30 processor list. |
| **Backblaze** (if used for backups) | Off-site backups | Backup copies of the above | **VERIFY in use + region** | **VERIFY** — backups can't be selectively erased (DATA_MAP F5); document an ageing-out schedule instead. |

## Your action checklist (what "in force" actually requires)

1. **Supabase — the one that needs real effort.** Go to supabase.com/legal/dpa, complete the PandaDoc, sign. Until you do, your *primary datastore* — where literally everything lives — has no DPA. This is the highest-priority gap.
2. **Google Cloud — one click, covers all Google APIs.** Cloud Console → IAM & Admin → "Cloud Data Processing Addendum" → Review and Accept. Confirm and note your function/storage region.
3. **Anthropic — likely already in force.** It came with the Commercial ToS you accepted to get the key. Confirm at privacy.claude.com; decide whether you want ZDR given riders carry passport/dietary data. If you want the formal signed PDF for your file, request it there.
4. **Resend — likely already in force.** Binding on ToS acceptance; confirm the account is on current terms.
5. **Vercel — accept its DPA** (vercel.com/legal/dpa) and record the function region.
6. **Confirm three regions** (Supabase project, Vercel functions, Google) — any US region means UK→US transfer, which the SCCs/DPF in each DPA above are designed to cover, but you must *document* the mechanism per processor.
7. **Spotify** — get counsel's read on whether it belongs here at all; I'd remove it from the processor list and note it as a third-party data source.
8. **Resolve the `.mcp.json` Google AI keys** (audit finding M7) — rotate, and either document the tool as a processor or confirm it's dev-only and out of scope.

## Notes
- **Transfers:** every US-region processor (Anthropic, Resend, possibly Supabase/Vercel) means personal data leaves the UK. Each DPA above includes SCCs / UK IDTA / DPF coverage — but the *mechanism per processor* must be written down here once regions are confirmed.
- **Anthropic specifically:** API logs auto-delete after 7 days by default with no training on inputs; the AI usage system logs only *that* a call happened (`ai_usage_events`), never the content sent. Riders/receipts with names + financial + special-category data are the payload, so this is the processor to be most deliberate about — ZDR is worth considering.
- **Controller vs processor:** for artists/tours/personnel data the workspace (the TM/company) is controller and Lowpass-the-platform is likely processor; for account data Lowpass is controller. This determines who answers DSARs. **Confirm with counsel.**

*This register is informational, not legal advice. Region, transfer-mechanism, and controller/processor confirmations require your legal review.*
