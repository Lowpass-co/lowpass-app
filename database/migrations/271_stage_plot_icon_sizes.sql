-- ============================================
-- LOWPASS — stage plot icon sizes: power drops, mic stands, guitars
-- Migration 271
-- ============================================
--
-- Paste into the Supabase SQL Editor and Run. Safe to paste twice: each
-- UPDATE only touches rows still at the OLD default size, so a second run
-- (or a row already resized) is a no-op.
--
-- WHY (Oct 2026, Adam):
--   - power drops were 1.65–2.85 ft wide, bigger than a wedge — now 1.3 ft
--     wide, shape kept;
--   - mic stands were side views on a top-down plot — now drawn from above,
--     so their footprint changed;
--   - guitars were full-length front views (≈1.1 × 3.4 ft, "tall, narrow and
--     janky") — now compact ≈1.2 × 2 ft.
-- The icon footprints already default to the new sizes, but every placed
-- item stores its own size, so items already on plots keep the old one (the
-- new drawing would sit small in an over-sized box) until this runs.
--
-- WHAT. Only items still at their old default footprint are resized. An item
-- someone sized by hand (any other width/depth) is left alone. Applies to
-- every stage plot, including named versions (editable siblings, not frozen
-- snapshots — see src/lib/rider-packs/saveVersion.ts).
--
--   icon                     old W × D        new W × D
--   infra-power-1            1.65 × 1.65  →  1.30 × 1.30
--   infra-power-2            2.40 × 1.50  →  1.30 × 0.81
--   infra-power-4            2.10 × 2.10  →  1.30 × 1.30
--   infra-power-8            2.85 × 1.80  →  1.30 × 0.82
--   stand-mic-boom           4.00 × 2.40  →  3.60 × 2.00
--   stand-mic-straight       1.70 × 3.00  →  1.00 × 1.00
--   stand-mic-short          1.50 × 1.40  →  1.70 × 1.10
--   string-electric-guitar   1.10 × 3.30  →  1.20 × 2.00
--   string-bass-guitar       1.10 × 3.80  →  1.20 × 2.24
--   string-acoustic-guitar   1.30 × 3.40  →  1.30 × 2.00
--   string-classical-guitar  1.30 × 3.30  →  1.30 × 2.00
--   string-12-string         1.35 × 3.50  →  1.30 × 2.00
--   string-resonator         1.30 × 3.30  →  1.30 × 2.00
-- ============================================

UPDATE public.stage_plot_items SET width_ft = 1.30, depth_ft = 1.30
WHERE icon_name = 'infra-power-1' AND width_ft = 1.65 AND depth_ft = 1.65;

UPDATE public.stage_plot_items SET width_ft = 1.30, depth_ft = 0.81
WHERE icon_name = 'infra-power-2' AND width_ft = 2.40 AND depth_ft = 1.50;

UPDATE public.stage_plot_items SET width_ft = 1.30, depth_ft = 1.30
WHERE icon_name = 'infra-power-4' AND width_ft = 2.10 AND depth_ft = 2.10;

UPDATE public.stage_plot_items SET width_ft = 1.30, depth_ft = 0.82
WHERE icon_name = 'infra-power-8' AND width_ft = 2.85 AND depth_ft = 1.80;

UPDATE public.stage_plot_items SET width_ft = 3.60, depth_ft = 2.00
WHERE icon_name = 'stand-mic-boom' AND width_ft = 4.00 AND depth_ft = 2.40;

UPDATE public.stage_plot_items SET width_ft = 1.00, depth_ft = 1.00
WHERE icon_name = 'stand-mic-straight' AND width_ft = 1.70 AND depth_ft = 3.00;

UPDATE public.stage_plot_items SET width_ft = 1.70, depth_ft = 1.10
WHERE icon_name = 'stand-mic-short' AND width_ft = 1.50 AND depth_ft = 1.40;

UPDATE public.stage_plot_items SET width_ft = 1.20, depth_ft = 2.00
WHERE icon_name = 'string-electric-guitar' AND width_ft = 1.10 AND depth_ft = 3.30;

UPDATE public.stage_plot_items SET width_ft = 1.20, depth_ft = 2.24
WHERE icon_name = 'string-bass-guitar' AND width_ft = 1.10 AND depth_ft = 3.80;

UPDATE public.stage_plot_items SET width_ft = 1.30, depth_ft = 2.00
WHERE icon_name = 'string-acoustic-guitar' AND width_ft = 1.30 AND depth_ft = 3.40;

UPDATE public.stage_plot_items SET width_ft = 1.30, depth_ft = 2.00
WHERE icon_name = 'string-classical-guitar' AND width_ft = 1.30 AND depth_ft = 3.30;

UPDATE public.stage_plot_items SET width_ft = 1.30, depth_ft = 2.00
WHERE icon_name = 'string-12-string' AND width_ft = 1.35 AND depth_ft = 3.50;

UPDATE public.stage_plot_items SET width_ft = 1.30, depth_ft = 2.00
WHERE icon_name = 'string-resonator' AND width_ft = 1.30 AND depth_ft = 3.30;

-- ============================================
-- DOWN (manual, only if reverting the icon footprints too):
-- UPDATE public.stage_plot_items SET width_ft = 1.65, depth_ft = 1.65 WHERE icon_name = 'infra-power-1' AND width_ft = 1.30 AND depth_ft = 1.30;
-- UPDATE public.stage_plot_items SET width_ft = 2.40, depth_ft = 1.50 WHERE icon_name = 'infra-power-2' AND width_ft = 1.30 AND depth_ft = 0.81;
-- UPDATE public.stage_plot_items SET width_ft = 2.10, depth_ft = 2.10 WHERE icon_name = 'infra-power-4' AND width_ft = 1.30 AND depth_ft = 1.30;
-- UPDATE public.stage_plot_items SET width_ft = 2.85, depth_ft = 1.80 WHERE icon_name = 'infra-power-8' AND width_ft = 1.30 AND depth_ft = 0.82;
-- UPDATE public.stage_plot_items SET width_ft = 4.00, depth_ft = 2.40 WHERE icon_name = 'stand-mic-boom' AND width_ft = 3.60 AND depth_ft = 2.00;
-- UPDATE public.stage_plot_items SET width_ft = 1.70, depth_ft = 3.00 WHERE icon_name = 'stand-mic-straight' AND width_ft = 1.00 AND depth_ft = 1.00;
-- UPDATE public.stage_plot_items SET width_ft = 1.50, depth_ft = 1.40 WHERE icon_name = 'stand-mic-short' AND width_ft = 1.70 AND depth_ft = 1.10;
-- UPDATE public.stage_plot_items SET width_ft = 1.10, depth_ft = 3.30 WHERE icon_name = 'string-electric-guitar' AND width_ft = 1.20 AND depth_ft = 2.00;
-- UPDATE public.stage_plot_items SET width_ft = 1.10, depth_ft = 3.80 WHERE icon_name = 'string-bass-guitar' AND width_ft = 1.20 AND depth_ft = 2.24;
-- UPDATE public.stage_plot_items SET width_ft = 1.30, depth_ft = 3.40 WHERE icon_name = 'string-acoustic-guitar' AND width_ft = 1.30 AND depth_ft = 2.00;
-- UPDATE public.stage_plot_items SET width_ft = 1.30, depth_ft = 3.30 WHERE icon_name = 'string-classical-guitar' AND width_ft = 1.30 AND depth_ft = 2.00;
-- UPDATE public.stage_plot_items SET width_ft = 1.35, depth_ft = 3.50 WHERE icon_name = 'string-12-string' AND width_ft = 1.30 AND depth_ft = 2.00;
-- UPDATE public.stage_plot_items SET width_ft = 1.30, depth_ft = 3.30 WHERE icon_name = 'string-resonator' AND width_ft = 1.30 AND depth_ft = 2.00;
-- ============================================
