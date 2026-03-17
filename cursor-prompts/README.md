# Cursor Prompts — Lowpass Budget Redesign

Run these in order. Each builds on the previous. Feed the full .md file to Cursor as a prompt.

## Order

| # | File | What it does | Est. complexity |
|---|------|-------------|-----------------|
| 00 | `00-FIX-advance-file-saving.md` | Fix the broken file saving in advance sections | Small (2 files) |
| 01 | `01-artist-first-navigation.md` | Artist selector in header, tour context provider, simplified sidebar | Medium (5 files) |
| 02 | `02-day-view-and-routing-spine.md` | New /tours/[id]/day page — vertical timeline, day cards with advance + budget panels | Large (5 new files) |
| 03 | `03-spreadsheet-view-inline-editing.md` | New /tours/[id]/sheet page — category grids with inline editable cells | Large (11 new files) |
| 04 | `04-rich-line-items-detail-panel.md` | Notion-style slide-over panel for line items — notes, files, links, history | Large (6 new files + 1 migration) |
| 05 | `05-payroll-and-rooming.md` | Weekly payroll sheets + rooming master grid matching Google Sheets format | Large (8 new files) |
| 06 | `06-summary-pl-and-tour-wide.md` | P&L summary view + tour-wide costs section | Medium (4 new files) |
| 07 | `07-ai-features.md` | Receipt OCR, smart templates, variance alerts, line item suggestions | Medium (5 new files + npm install) |

## How to use

1. Open the .md file for the prompt you want to run
2. Copy the entire contents
3. Paste into Cursor as a prompt
4. Let Cursor implement it
5. Test in browser
6. If Cursor makes errors, paste the error message back to it along with "Refer to the original prompt in cursor-prompts/0X-*.md for the exact specification"
7. Move to the next prompt

## Important

- Each prompt specifies exact file paths, exact API endpoints, exact component props
- Each prompt has a "Do NOT" section — Cursor should not deviate from this
- No prompt modifies existing working features — they add new routes and components alongside existing code
- The existing `/budget` and `/rooming` pages continue to work as-is throughout
