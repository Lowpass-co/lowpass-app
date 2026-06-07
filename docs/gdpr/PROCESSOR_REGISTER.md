# Lowpass — Sub-processor / Records of Processing (Art. 30)

**Date:** 2026-06-07 · **Status:** draft — fields marked **VERIFY** need confirmation (I can't read your account settings / contracts).

GDPR Art. 30 requires a record of who processes personal data on your behalf,
for what, and where. This is that register, built from the integrations
evidenced in the codebase (`.env.local.example`, `package.json`, `vercel.json`,
`.mcp.json`). Confirm each DPA is signed and each region is correct.

| Sub-processor | Purpose in Lowpass | Personal data shared | Region / residency | DPA |
|---|---|---|---|---|
| **Supabase** | Primary datastore: Postgres (all tables), Auth (`auth.users`), Storage (personnel docs, avatars, receipts, rider/artist assets) | Everything — account, roster, contacts, venue-intake, files | **VERIFY** project region (EU vs US — material for transfers) | **VERIFY** signed DPA |
| **Vercel** | Hosting / serverless functions / cron | Transits all request data; logs may capture IP/headers | **VERIFY** function region | **VERIFY** DPA |
| **Anthropic (Claude API)** | AI: deal-memo extract, receipt OCR, budget suggestions, rider summary, stage-plot icons | Document/receipt/budget content sent to the model — may contain names, financial data | US (**VERIFY**) | **VERIFY** DPA + zero-retention/no-train terms |
| **Google — Maps/Places/Geocoding/Directions** | Venue/airport lookup, geocode, drive times | Venue names + addresses + coordinates (location data) | Global (**VERIFY**) | **VERIFY** Google Cloud DPA |
| **Google — Custom Search (CSE)** | Equipment "auto image" lookup | Equipment query strings (low personal data) | Global | covered by Google Cloud DPA (**VERIFY**) |
| **Google — Docs / Drive (service account)** | Rider-pack Google Doc export | Rider content + whatever the doc contains | **VERIFY** | **VERIFY** |
| **Google — Stitch / Generative AI** (keys in `.mcp.json`) | **VERIFY in use** — dev tooling? | **VERIFY** | — | rotate keys (audit M7) |
| **Resend** | Transactional email: notifications, intake alerts, invites | Recipient email + name + notification content | US (**VERIFY**) | **VERIFY** DPA |
| **Spotify** | Artist search + images | Artist names/queries (the controller's own catalogue data) | Global | public API — low personal data |
| **Backblaze** (if used for backups) | Off-site backups | Backup copies of the above | **VERIFY in use + region** | **VERIFY** — note: backups can't be selectively erased (DATA_MAP F5) |

## Notes
- **Transfers:** any US-region processor (Anthropic, Resend, possibly Supabase/Vercel) means personal data leaves the UK/EU. You need a transfer mechanism (SCCs / UK IDTA / adequacy) documented for each. **VERIFY.**
- **Anthropic specifically:** confirm the API terms include no-training-on-inputs and the retention window, since receipts/deal-memos with names and financial data are sent. The AI usage system already logs *that* a call happened (`ai_usage_events`); it does not store the content sent.
- **Controller vs processor:** for the artists/tours/personnel data, the workspace (the TM/company) is the controller and Lowpass-the-platform is likely the processor; for account data, Lowpass is the controller. This determines who answers DSARs. **Confirm with counsel.**

*This register is informational, not legal advice. The DPA/region/transfer-mechanism confirmations require your legal review.*
