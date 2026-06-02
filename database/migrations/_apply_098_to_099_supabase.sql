/* ============================================================
   APPLY 098 → 099 in Supabase SQL Editor (Sprint 12 §8a)

   Two migrations:
     098 — channel_list_rows: row_kind discriminator + output_*
           columns + cable_length
     099 — mic_library global seed expansion (~100 entries)

   Both idempotent. Re-runs are safe.
   ============================================================ */


/* ============================================================
   MIGRATION 098 — channel_list_rows outputs + cable_length
   ============================================================ */

ALTER TABLE public.channel_list_rows
  ADD COLUMN IF NOT EXISTS row_kind TEXT NOT NULL DEFAULT 'input',
  ADD COLUMN IF NOT EXISTS output_item TEXT,
  ADD COLUMN IF NOT EXISTS output_destination TEXT,
  ADD COLUMN IF NOT EXISTS output_qty INTEGER,
  ADD COLUMN IF NOT EXISTS output_notes TEXT,
  ADD COLUMN IF NOT EXISTS cable_length TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'channel_list_rows_row_kind_check'
      AND conrelid = 'public.channel_list_rows'::regclass
  ) THEN
    ALTER TABLE public.channel_list_rows
      ADD CONSTRAINT channel_list_rows_row_kind_check
      CHECK (row_kind IN ('input', 'output'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS channel_list_rows_section_kind_idx
  ON public.channel_list_rows (section_id, row_kind, row_index);


/* ============================================================
   MIGRATION 099 — mic_library global seed expansion
   ============================================================ */

INSERT INTO public.mic_library (workspace_id, name, type, default_phantom)
SELECT NULL::uuid AS workspace_id, v.name, v.type, v.default_phantom
FROM (
  VALUES
    -- Shure
    ('Shure SM58',                  'dynamic',    false),
    ('Shure SM57',                  'dynamic',    false),
    ('Shure SM7B',                  'dynamic',    false),
    ('Shure Beta 52A',              'dynamic',    false),
    ('Shure Beta 56A',              'dynamic',    false),
    ('Shure Beta 91A',              'condenser',  true),
    ('Shure Beta 87A',              'condenser',  true),
    ('Shure Beta 98H',              'condenser',  true),
    ('Shure KSM8',                  'dynamic',    false),
    ('Shure KSM9',                  'condenser',  true),
    ('Shure KSM137',                'condenser',  true),
    ('Shure KSM44A',                'condenser',  true),
    ('Shure ULXD2 (SM58)',          'dynamic',    false),
    ('Shure ULXD2 (KSM9)',          'condenser',  false),
    ('Shure Axient AD2',            'dynamic',    false),
    ('Shure Axient AD4Q',           'dynamic',    false),
    ('Shure MX392',                 'condenser',  true),
    ('Shure Nexadyne NX8',          'dynamic',    false),
    -- Sennheiser
    ('Sennheiser e904',             'dynamic',    false),
    ('Sennheiser e906',             'dynamic',    false),
    ('Sennheiser e914',             'condenser',  true),
    ('Sennheiser e935',             'dynamic',    false),
    ('Sennheiser e945',             'dynamic',    false),
    ('Sennheiser e835',             'dynamic',    false),
    ('Sennheiser e609',             'dynamic',    false),
    ('Sennheiser MD421',            'dynamic',    false),
    ('Sennheiser MD441',            'dynamic',    false),
    ('Sennheiser MD46',             'dynamic',    false),
    ('Sennheiser MKH416',           'condenser',  true),
    ('Sennheiser EW DM6',           'dynamic',    false),
    ('Sennheiser EW20',             'dynamic',    false),
    ('Sennheiser EW SR20SP',        'dynamic',    false),
    -- AKG
    ('AKG D112',                    'dynamic',    false),
    ('AKG D5',                      'dynamic',    false),
    ('AKG D7',                      'dynamic',    false),
    ('AKG C414',                    'condenser',  true),
    ('AKG C451',                    'condenser',  true),
    ('AKG C535',                    'condenser',  true),
    ('AKG C518',                    'condenser',  true),
    ('AKG C519',                    'condenser',  true),
    -- Audio-Technica
    ('Audio-Technica AT4050',       'condenser',  true),
    ('Audio-Technica AT4053',       'condenser',  true),
    ('Audio-Technica AT4081',       'ribbon',     false),
    ('Audio-Technica AT2020',       'condenser',  true),
    ('Audio-Technica AE2300',       'dynamic',    false),
    ('Audio-Technica ATM450',       'condenser',  true),
    -- Beyerdynamic
    ('Beyerdynamic M88',            'dynamic',    false),
    ('Beyerdynamic M201',           'dynamic',    false),
    ('Beyerdynamic M160',           'ribbon',     false),
    ('Beyerdynamic TG-X 50',        'dynamic',    false),
    -- Neumann
    ('Neumann KM184',               'condenser',  true),
    ('Neumann KMS105',              'condenser',  true),
    ('Neumann U87',                 'condenser',  true),
    ('Neumann TLM103',              'condenser',  true),
    -- Heil
    ('Heil PR40',                   'dynamic',    false),
    ('Heil PR30',                   'dynamic',    false),
    ('Heil PR22',                   'dynamic',    false),
    ('Heil RC35',                   'dynamic',    false),
    ('Heil RC22',                   'dynamic',    false),
    -- Earthworks
    ('Earthworks SR20',             'condenser',  true),
    ('Earthworks SR40',             'condenser',  true),
    ('Earthworks SR314',            'condenser',  true),
    ('Earthworks DK7',               'condenser',  true),
    -- DPA
    ('DPA 4099 (drum)',             'condenser',  true),
    ('DPA 4099 (string)',           'condenser',  true),
    ('DPA 4099 (wind)',             'condenser',  true),
    ('DPA 4011',                    'condenser',  true),
    ('DPA 4061',                    'condenser',  true),
    -- sE Electronics
    ('sE Electronics V7',           'dynamic',    false),
    ('sE Electronics V7 Black',     'dynamic',    false),
    ('sE Electronics V7 Switch',    'dynamic',    false),
    ('sE Electronics V3',           'dynamic',    false),
    ('sE Electronics sE2200',       'condenser',  true),
    ('sE Electronics X1',           'condenser',  true),
    -- Telefunken
    ('Telefunken M80',              'dynamic',    false),
    ('Telefunken M81',              'dynamic',    false),
    ('Telefunken M82',              'dynamic',    false),
    -- Royer
    ('Royer R-121',                 'ribbon',     false),
    ('Royer R-122',                 'ribbon',     true),
    -- Audix
    ('Audix D6',                    'dynamic',    false),
    ('Audix i5',                    'dynamic',    false),
    ('Audix OM6',                   'dynamic',    false),
    ('Audix SCX1',                  'condenser',  true),
    ('Audix ADX51',                 'condenser',  true),
    -- Crown / boundary
    ('Crown PCC160',                'condenser',  true),
    ('Crown PZM30D',                'condenser',  true),
    -- Countryman
    ('Countryman B3',               'condenser',  false),
    ('Countryman B6',               'condenser',  false),
    ('Countryman E6',               'condenser',  false),
    ('Countryman E7',               'condenser',  false),
    ('Countryman Type 85',          'di_active',  true),
    ('Countryman JDS',              'di_active',  true),
    -- Radial DI
    ('Radial J48',                  'di_active',  true),
    ('Radial JDI',                  'di_passive', false),
    ('Radial JDI Stereo',           'di_passive', false),
    ('Radial JCR',                  'di_passive', false),
    ('Radial Reamp',                'di_passive', false),
    ('Radial ProD2',                'di_passive', false),
    ('Radial ProDI',                'di_passive', false),
    ('Radial USB-Pro',              'di_active',  true),
    ('Radial EXTC',                 'di_passive', false),
    ('Radial BT-Pro',               'di_active',  true),
    -- Whirlwind DI
    ('Whirlwind IMP-2',             'di_passive', false),
    ('Whirlwind IMP-Pro',           'di_active',  true),
    ('Whirlwind pcDI',              'di_active',  true),
    ('Whirlwind MultiDI',           'di_passive', false),
    -- BSS / Avalon
    ('BSS AR-133',                  'di_active',  true),
    ('Avalon U5',                   'di_active',  true)
) AS v(name, type, default_phantom)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.mic_library m
  WHERE m.workspace_id IS NULL
    AND m.name = v.name
);


/* ============================================================
   Tracking inserts
   ============================================================ */

INSERT INTO public._lp_migrations (filename, checksum, applied_by)
VALUES
  ('098_channel_list_outputs_and_cable_length.sql', 'backfill', 'manual-supabase-editor'),
  ('099_mic_library_seed.sql',                       'backfill', 'manual-supabase-editor')
ON CONFLICT (filename) DO NOTHING;


/* ============================================================
   Post-apply verification — run separately after the block.

   1. row_kind column populated + no nulls
      SELECT count(*) AS total,
             count(*) FILTER (WHERE row_kind = 'input')  AS inputs,
             count(*) FILTER (WHERE row_kind = 'output') AS outputs
      FROM public.channel_list_rows;
      -- Expect: total = inputs, outputs = 0 (all existing rows
      -- default to 'input', no output rows yet)

   2. mic_library seed count
      SELECT count(*) FROM public.mic_library WHERE workspace_id IS NULL;
      -- Expect: ~100 + however many seed rows migration 040
      -- already added. The §8a report claims 102 new entries.

   3. Migration tracking rows recorded
      SELECT filename, applied_at FROM public._lp_migrations
      WHERE filename IN (
        '098_channel_list_outputs_and_cable_length.sql',
        '099_mic_library_seed.sql'
      )
      ORDER BY filename;
   ============================================================ */
