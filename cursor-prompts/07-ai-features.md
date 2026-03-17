# Cursor Prompt 07: AI Features

## Prerequisites

- Prompts 01-06 completed
- ANTHROPIC_API_KEY is already in `.env.local`
- All budget views (Day, Spreadsheet, Summary, Tour-Wide) exist

## Context

**Stack**: Next.js 16 App Router, TypeScript, Tailwind CSS v4, Supabase.

**Anthropic API key**: Already in `.env.local` as `ANTHROPIC_API_KEY`

**Goal**: Four AI features: (1) Receipt OCR, (2) Smart budget templates from history, (3) Variance alerts, (4) AI line item suggestions.

## Feature 1: Receipt OCR

### API Route

Create `src/app/api/budget/receipts/ocr/route.ts`:

**POST** — Accept an image/PDF upload, send to Claude Vision, return structured receipt data.

```typescript
import Anthropic from '@anthropic-ai/sdk';

export async function POST(request: Request) {
  // 1. Get the uploaded file from FormData
  const formData = await request.formData();
  const file = formData.get('file') as File;
  const tourCurrency = formData.get('currency') as string || 'GBP';

  // 2. Convert file to base64
  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString('base64');
  const mediaType = file.type as 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';

  // 3. Call Anthropic API
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data: base64 }
        },
        {
          type: 'text',
          text: `Extract receipt data from this image. Return ONLY valid JSON with these fields:
{
  "vendor": "string - business name",
  "date": "string - YYYY-MM-DD format",
  "total_amount": number,
  "currency": "string - 3-letter code e.g. GBP, USD, EUR",
  "category": "string - one of: hotel, transport, production, catering, misc",
  "description": "string - brief description of what was purchased",
  "payment_method": "string - one of: card, cash, bank_transfer",
  "line_items": [{"description": "string", "amount": number}]
}
If any field is unclear, use null. Tour currency is ${tourCurrency}.`
        }
      ]
    }]
  });

  // 4. Parse the JSON from Claude's response
  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return NextResponse.json({ error: 'Could not parse receipt' }, { status: 422 });
  }

  const receiptData = JSON.parse(jsonMatch[0]);
  return NextResponse.json(receiptData);
}
```

### Install Anthropic SDK

Run: `npm install @anthropic-ai/sdk`

### Frontend: Receipt upload with OCR

Modify `src/components/spreadsheet-view/ReceiptsGrid.tsx` (or the existing `ReceiptsTab.tsx`):

Add a "Scan Receipt" button next to the "+ Add Receipt" button.

When clicked:
1. Open file picker (accept: image/*, application/pdf)
2. Show loading spinner: "Scanning receipt..."
3. POST to `/api/budget/receipts/ocr` with the file
4. Pre-fill a new receipt row with the extracted data
5. Highlight pre-filled cells in orange tint so the user can review before saving
6. User adjusts any incorrect values, then Tab/blur saves as normal

## Feature 2: Smart Budget Templates

### API Route

Create `src/app/api/budget/ai/template/route.ts`:

**POST** — Given tour parameters, generate a budget template from historical data.

```typescript
export async function POST(request: Request) {
  const body = await request.json();
  // body: { tour_id, artist_id, workspace_id, cities: string[], show_count: number, crew_count: number }

  const supabase = await createServerSupabaseClient();

  // 1. Fetch completed tours for this artist (or workspace if no artist tours)
  const { data: pastTours } = await supabase
    .from('tours')
    .select('id, name, currency, start_date, end_date')
    .eq('artist_id', body.artist_id)
    .eq('status', 'completed')
    .order('end_date', { ascending: false })
    .limit(5);

  if (!pastTours?.length) {
    // Fall back to workspace-wide data
    // ... fetch from all workspace tours
  }

  // 2. For each past tour, fetch actual costs by category
  const tourIds = pastTours.map(t => t.id);
  const [lineItems, hotelCosts, flightCosts, personnelRates] = await Promise.all([
    supabase.from('budget_line_items').select('category, actual_cost, proposed_cost').in('tour_id', tourIds),
    supabase.from('hotel_room_assignments').select('rate_per_night, nights').in('hotel_booking_id',
      supabase.from('hotel_bookings').select('id').in('tour_id', tourIds)
    ),
    supabase.from('flight_bookings').select('actual_cost, proposed_cost, origin_code, destination_code').in('tour_id', tourIds),
    supabase.from('personnel_rates').select('show_rate, off_rate, per_diem, person_type').in('tour_id', tourIds),
  ]);

  // 3. Calculate averages per category
  // ... aggregate by category, compute mean actual_cost per show day

  // 4. Use Claude to generate a natural language summary + structured template
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: `Based on historical tour data for this artist, generate a budget template.

Historical averages per show day:
- Hotels: £${avgHotelPerDay}/night
- Flights: £${avgFlightPerPerson}/person
- Transport: £${avgTransportPerDay}/day
- Production: £${avgProductionPerDay}/day
- Per diem: £${avgPerDiem}/person/day

New tour parameters:
- ${body.show_count} shows across ${body.cities.join(', ')}
- ${body.crew_count} crew members

Return JSON with structure:
{
  "summary": "Brief natural language description of the budget estimate",
  "line_items": [
    { "category": "...", "label": "...", "proposed_cost": number, "routing_id": null, "reasoning": "..." }
  ],
  "estimated_total_expenses": number,
  "confidence": "low|medium|high",
  "warnings": ["any concerns or caveats"]
}`
    }]
  });

  // 5. Parse and return
  // ...
}
```

### Frontend: "Generate from history" button

Add a button on the Tour-Wide Costs page (`TourWideCosts.tsx`) or as a step when creating a new tour:
- Button text: "Auto-fill from past tours"
- On click: POST to `/api/budget/ai/template` with tour parameters
- Show results in a confirmation modal: "Based on 3 past tours, here's a suggested budget:"
- User can accept all, accept some, or dismiss
- Accepted items are created as budget_line_items

## Feature 3: Variance Alerts

### API Route

Create `src/app/api/budget/ai/alerts/route.ts`:

**GET** — Analyse current budget state and return AI-generated alerts.

```typescript
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tourId = searchParams.get('tour_id');

  const supabase = await createServerSupabaseClient();

  // Fetch all budget data in parallel
  const [summary, income, lineItems, flights, hotels, settings] = await Promise.all([
    fetch(`${BASE_URL}/api/budget/summary?tour_id=${tourId}`).then(r => r.json()),
    supabase.from('budget_income').select('*').eq('tour_id', tourId),
    supabase.from('budget_line_items').select('*').eq('tour_id', tourId),
    supabase.from('flight_bookings').select('*').eq('tour_id', tourId),
    supabase.from('hotel_bookings').select('*, hotel_room_assignments(*)').eq('tour_id', tourId),
    supabase.from('budget_settings').select('*').eq('tour_id', tourId).single(),
  ]);

  // Build context for Claude
  const budgetContext = `
Tour budget analysis needed. Data:
- Total income (proposed): £${summary.totalIncome?.proposed || 0}
- Total expenses (proposed): £${summary.totalExpenses?.proposed || 0}
- Categories with actuals entered: ${categoriesWithActuals.join(', ')}
- Variance by category: ${JSON.stringify(varianceByCategory)}
- Show days without transport costs: ${showDaysWithoutTransport.length}
- Flight cost range: £${minFlight} to £${maxFlight} per person
- Withholding taxes applied: ${withholdingInfo}
`;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `${budgetContext}

Analyse this tour budget and return a JSON array of alerts. Each alert:
{
  "severity": "info|warning|critical",
  "category": "hotels|flights|transport|production|income|overheads|general",
  "message": "Brief, specific, actionable message",
  "detail": "Optional longer explanation"
}

Focus on: cost anomalies, missing data, category imbalances, withholding tax issues, and anything a tour manager should know. Return 3-8 alerts, ordered by severity (critical first). Return ONLY the JSON array.`
    }]
  });

  // Parse and return alerts
  // ...
}
```

### Frontend: Alerts widget

Create `src/components/summary/BudgetAlerts.tsx`:
- Renders at the top of the Summary view
- Fetches alerts from `/api/budget/ai/alerts?tour_id={id}`
- Each alert is a small card with severity icon (⚠️ warning, 🔴 critical, ℹ️ info) + message
- Collapsible detail text
- "Refresh alerts" button to re-run analysis
- Alerts are cached in sessionStorage for 5 minutes to avoid repeated API calls

## Feature 4: AI Line Item Suggestions

### Integration in Detail Panel

Modify `src/components/detail-panel/LineItemDetailPanel.tsx`:

Add an "AI Suggestions" section at the bottom of the Overview tab:

```typescript
// When the detail panel opens for a line item, fetch suggestions
const fetchSuggestions = async () => {
  const res = await fetch('/api/budget/ai/suggest', {
    method: 'POST',
    body: JSON.stringify({
      tour_id: tourId,
      line_item: currentLineItem,
      context: { category, label, proposed_cost }
    })
  });
  return res.json();
};
```

### API Route

Create `src/app/api/budget/ai/suggest/route.ts`:

**POST** — Given a line item context, suggest related items or flag issues.

Returns 1-3 short suggestions like:
- "You usually budget £250/night for hotels in London — is £200 still right?"
- "This tour has 3 EU shows but no carnet budgeted."
- "Audio hire includes PA — have you budgeted for haulage?"

Display as small, dismissible info cards in the detail panel. Subtle, not intrusive.

## Files to create

1. `src/app/api/budget/receipts/ocr/route.ts`
2. `src/app/api/budget/ai/template/route.ts`
3. `src/app/api/budget/ai/alerts/route.ts`
4. `src/app/api/budget/ai/suggest/route.ts`
5. `src/components/summary/BudgetAlerts.tsx`

## Files to modify

1. `src/components/spreadsheet-view/ReceiptsGrid.tsx` — add "Scan Receipt" button
2. `src/components/tour-wide/TourWideCosts.tsx` — add "Auto-fill from past tours" button
3. `src/components/summary/SummaryView.tsx` — render BudgetAlerts at top
4. `src/components/detail-panel/LineItemDetailPanel.tsx` — add AI suggestions section

## NPM install required

```bash
npm install @anthropic-ai/sdk
```

## Do NOT

- Do NOT stream AI responses — simple request/response is fine for these use cases
- Do NOT store AI suggestions in the database — they're ephemeral
- Do NOT make AI calls on every page load — only on explicit user action (button click) or panel open
- Do NOT allow AI to directly modify budget data — always show suggestions that the user confirms
- Do NOT use GPT/OpenAI — use the Anthropic SDK with the key already in .env.local
