# Stage Plot — icon audit (§SP-FIX-1a)

153 built-in icons across 14 source files. Adam's review: "icons in
three mixed visual languages — inconsistent." This audit names the
three languages objectively (from authoring signals), then sets the
regeneration queue. The 8 canonical anchors in
`src/lib/stage-plot/icons/canonical.ts` define the target language;
everything below is measured against them.

Review side-by-side at `/stage-plot-icons` (dev only).

## The three languages (the problem)

| # | Language | Signal | Files | Verdict |
|---|----------|--------|-------|---------|
| 1 | **Filled schematic** (TARGET) | closed footprint shape + `.lp-ico-detail` strokes, no text | drums, amps, keys, monitors, signal, infrastructure, lighting, stands | Closest to canonical. **Refine**, don't replace. |
| 2 | **Outline line-art** | `outline: true`, unfilled, currentColor stroke | mics (16), strings (1 flag + line-art guitars) | Reads as a different family next to filled icons. **Regenerate to filled.** |
| 3 | **Text-in-icon** | `.lp-ico-label` letters carry the meaning ("Twin", "Modeller", "SVT") | amps (8), signal (5), utility (4), infrastructure (3), + scattered | Violates canonical rule 6 (no in-icon text). **Strip text, encode by shape.** |

Plus two non-language outliers:
- **musicians** — head+shoulders portrait silhouettes (not top-down). → replaced by position-dot pattern in §SP-FIX-4.
- **drums-composites** — 8 overlapping circles + drummer marker (unreadable). → redesigned in §SP-FIX-3.

## Per-file disposition

| File | Icons | Lang | Disposition |
|------|------:|------|-------------|
| drums | 12 | 1 | **Refine.** Kick → rounded-rect (canonical), not circle. Drop snare "S" text. Toms/cymbals adopt canonical hoop/bell vocabulary. |
| drums-aux | 7 | 1 | Refine to canonical detail vocabulary. Drop 1 text label. |
| drums-composites | 5 | outlier | **Redesign in §SP-FIX-3** (composite/individual toggle). Not part of FIX-1b. |
| mics | 15 | 2 | **Regenerate** to filled top-down (capsule + grille + base), anchored on `mic-stand-round`. |
| musicians | 2 | outlier | **Replace in §SP-FIX-4** with position dots. |
| amps | 14 | 1+3 | **Refine + strip text** (8 labels). Footprints to real cab sizes (§SP-FIX-2). Anchor on `amp-combo-1x12`. |
| keys | 12 | 1 | Refine. Strip 1 text label. |
| strings | 17 | 2 | **Regenerate** (Adam's repeatedly-flagged guitars). Electric guitar artwork is Adam-supplied — wire when received; do not author. |
| monitors | 7 | 1 | Refine. Strip 1 text label. |
| signal | 13 | 1+3 | Refine + strip text (5). DI + rack already have canonical anchors. |
| infrastructure | 18 | 1+3 | Refine + strip text (3). Power drop has canonical anchor. |
| lighting | 9 | 1 | Refine. Strip 2 text labels. |
| stands | 12 | 1 | Refine. Anchor on `mic-stand-round`. |
| utility | 10 | 3 | Annotations (text/arrow/callout) legitimately carry text — exempt from rule 6. Generic shapes refine. |

## §SP-FIX-1b hand-author queue (~30 most-used non-canonical)

Highest on-canvas frequency, hand-authored to the canonical grammar:

1. **Drums (10):** kick★, snare★, rack tom hi, rack tom mid, floor tom, hi-hat, crash★, ride, splash, throne
2. **Amps (6):** Fender Twin, 4×12 cab, amp head, combo 2×12, bass head, Kemper/modeller
3. **Monitors (4):** wedge, side-fill, IEM pack, IEM rack (→ `rack-4u`★ grammar)
4. **Mics (6):** SM58 vocal, D6 kick, pencil condenser, large-diaphragm, clip/tom mic, wireless
5. **Signal/infra (4):** DI★, stage rack★, power drop★, analog stage box

★ = already authored as a canonical anchor; §SP-FIX-1b just moves it into the category file (replacing the legacy entry of the same `name`).

The remaining ~115 (less-frequent gear, lighting, full mic range, all keys/strings variants) queue for the **Claude API generator** (§SP-FIX-1b part 2 / §SP11), seeded with the 8 canonical SVGs + the grammar in `canonical.ts`.

## Naming collisions to expect in §SP-FIX-1b

Canonical names that already exist and will be **replaced** in-place:
`drum-kick`, `drum-snare`, `drum-crash` (drums.ts); `amp-combo-1x12`
(amps.ts). DI / rack / power-drop / mic-stand are new-or-rename — verify
against `signal.ts` / `infrastructure.ts` / `stands.ts` at swap time.
