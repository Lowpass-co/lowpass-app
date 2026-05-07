-- ============================================
-- LOWPASS — Advance: Key Contacts consolidation
-- Migration 070
--
-- Sprint 8.6 §5 — Adam's call: "ALL contacts should live there
-- [Key Contacts], not within the other headers." Migrates
-- existing contact-type field values from non-Key-Contacts
-- sections into a Key Contacts section per advance_instance,
-- and strips contact-type fields from non-Key-Contacts platform
-- templates so future advances don't get contact fields injected
-- in the wrong place.
--
-- Sub-decisions per Adam's Sprint 8.6 §5 sign-off:
--   1. Don't de-dup. Preserve every existing contact entry.
--      User can clean up via the contacts UI if needed.
--   2. UI restriction + server CHECK constraint both. UI is the
--      nice path; the CHECK is belt-and-braces against direct DB
--      writes.
--   3. Skip empty contact values (don't add empty rows to Key
--      Contacts). Empty = no first_name AND no last_name AND no
--      phone AND no email.
--   4. Key Contacts section auto-pinned to index 0 in
--      advance_form_configs.sections JSONB. Already implemented
--      at the API layer (Sprint 8.6 §4 endpoint audit found
--      auto-pin at /api/tours/[id]/advance/route.ts:260-275);
--      this migration extends the same logic to historical rows
--      that pre-date the API enforcement.
--   5. Tag migrated contacts with source_section metadata
--      (`__migrated_from_section_id`, `__migrated_from_section_label`,
--      `__migrated_from_field_id`) for audit traceability.
--
-- Idempotent. Safe to re-run — Key Contacts template existence
-- check uses ON CONFLICT-style guards; data migration uses
-- field-presence checks before extracting.
--
-- Reversibility: NOT cleanly reversible. The contact field
-- VALUES will be merged into Key Contacts; the original
-- section→field→value mapping is preserved only via the
-- audit metadata (source_section). Cannot perfectly restore
-- the original placement.
-- ============================================

DO $$
DECLARE
  key_contacts_template_id uuid;
  config_row record;
  section_idx int;
  section jsonb;
  field jsonb;
  field_value jsonb;
  data_jsonb jsonb;
  section_template_id text;
  section_label text;
  contact_value jsonb;
  contact_array jsonb;
  contacts_to_add jsonb := '[]'::jsonb;
  remaining_fields jsonb := '[]'::jsonb;
  updated_sections jsonb := '[]'::jsonb;
  has_key_contacts boolean := false;
  key_contacts_idx int;
  cleared_data jsonb;
BEGIN
  -- 1. Confirm Key Contacts template exists. Migration 014
  -- created it; if it's missing, abort.
  SELECT id INTO key_contacts_template_id
  FROM public.advance_templates
  WHERE workspace_id IS NULL
    AND name = 'Key Contacts'
    AND template_type = 'section'
  LIMIT 1;

  IF key_contacts_template_id IS NULL THEN
    -- Belt-and-braces: re-create the platform Key Contacts
    -- template from migration 014 if somehow missing.
    INSERT INTO public.advance_templates
      (workspace_id, template_type, name, description, icon, fields, suggested_for_day_types)
    VALUES
      (NULL, 'section', 'Key Contacts',
       'Show contacts — promoter, venue rep, production',
       'users', '[]'::jsonb,
       ARRAY['show', 'festival', 'rehearsal'])
    RETURNING id INTO key_contacts_template_id;
    RAISE NOTICE 'Re-created platform Key Contacts template: %', key_contacts_template_id;
  END IF;

  -- 2. Walk every advance_form_configs row that has sections.
  -- For each non-Key-Contacts section, extract contact-type
  -- field values into the Key Contacts section's contacts list.
  FOR config_row IN
    SELECT id, sections
    FROM public.advance_form_configs
    WHERE sections IS NOT NULL
      AND jsonb_array_length(sections) > 0
  LOOP
    contacts_to_add := '[]'::jsonb;
    updated_sections := '[]'::jsonb;
    has_key_contacts := false;
    key_contacts_idx := -1;

    -- Pull the per-instance data for this config (via the
    -- advance_instances table that joins on form_config_id).
    -- The data lives there; the structure (sections) lives on
    -- the form_config. We'll need both to extract values.
    FOR data_jsonb IN
      SELECT data FROM public.advance_instances
      WHERE form_config_id = config_row.id
      LIMIT 1
    LOOP
      cleared_data := data_jsonb;

      -- Walk sections in this config.
      section_idx := 0;
      FOR section IN
        SELECT * FROM jsonb_array_elements(config_row.sections)
      LOOP
        section_label := section->>'label';
        section_template_id := section->>'template_id';

        IF section_label = 'Key Contacts' THEN
          has_key_contacts := true;
          key_contacts_idx := section_idx;
          updated_sections := updated_sections || section;
        ELSE
          -- Walk fields within this section.
          remaining_fields := '[]'::jsonb;
          FOR field IN
            SELECT * FROM jsonb_array_elements(COALESCE(section->'fields', '[]'::jsonb))
          LOOP
            IF field->>'type' = 'contact' THEN
              -- Extract value from data[template_id][field_id].
              field_value := cleared_data
                #> ARRAY[section_template_id, field->>'id'];

              IF field_value IS NOT NULL THEN
                -- Normalize to array. Single contact object or
                -- pre-existing array both end up as array.
                IF jsonb_typeof(field_value) = 'array' THEN
                  contact_array := field_value;
                ELSE
                  contact_array := jsonb_build_array(field_value);
                END IF;

                -- Walk each contact, skip empties, tag with
                -- audit metadata, append to migration buffer.
                FOR contact_value IN
                  SELECT * FROM jsonb_array_elements(contact_array)
                LOOP
                  IF jsonb_typeof(contact_value) = 'object' THEN
                    -- Skip empty contacts (no first_name, no
                    -- last_name, no phone, no email).
                    IF (contact_value->>'first_name' IS NOT NULL AND length(trim(contact_value->>'first_name')) > 0)
                       OR (contact_value->>'last_name' IS NOT NULL AND length(trim(contact_value->>'last_name')) > 0)
                       OR (contact_value->>'phone' IS NOT NULL AND length(trim(contact_value->>'phone')) > 0)
                       OR (contact_value->>'email' IS NOT NULL AND length(trim(contact_value->>'email')) > 0)
                    THEN
                      contacts_to_add := contacts_to_add || jsonb_build_object(
                        'first_name', contact_value->'first_name',
                        'last_name', contact_value->'last_name',
                        'phone', contact_value->'phone',
                        'email', contact_value->'email',
                        'role', contact_value->'role',
                        'venue_name', contact_value->'venue_name',
                        'notes', contact_value->'notes',
                        '__migrated_from_section_id', section_template_id,
                        '__migrated_from_section_label', section_label,
                        '__migrated_from_field_id', field->>'id',
                        '__migrated_at', to_jsonb(now()::text)
                      );
                    END IF;
                  END IF;
                END LOOP;

                -- Clear the orphaned value from data so the UI
                -- doesn't re-render it in the original section.
                cleared_data := cleared_data
                  #- ARRAY[section_template_id, field->>'id'];
              END IF;
              -- Don't include the contact field in remaining_fields.
            ELSE
              -- Non-contact field: keep as-is.
              remaining_fields := remaining_fields || field;
            END IF;
          END LOOP;

          -- Rebuild section with contact fields removed.
          updated_sections := updated_sections || jsonb_set(
            section,
            '{fields}',
            remaining_fields
          );
        END IF;

        section_idx := section_idx + 1;
      END LOOP;

      -- 3. Inject Key Contacts section if missing (auto-pin
      -- to index 0). Append migrated contacts to its data.
      IF NOT has_key_contacts THEN
        updated_sections := jsonb_build_array(
          jsonb_build_object(
            'template_id', key_contacts_template_id::text,
            'label', 'Key Contacts',
            'fields', '[]'::jsonb,
            'order', 0
          )
        ) || (
          SELECT jsonb_agg(
            jsonb_set(s, '{order}', to_jsonb((idx)::int))
          )
          FROM jsonb_array_elements(updated_sections) WITH ORDINALITY AS s(s, idx)
        );
        key_contacts_idx := 0;
      END IF;

      -- 4. Re-order so Key Contacts is at index 0 (already
      -- there if just inserted; move if not).
      IF key_contacts_idx > 0 THEN
        WITH reordered AS (
          SELECT
            jsonb_set(s.elem, '{order}', to_jsonb(0)) AS elem,
            0 AS sort_key
          FROM jsonb_array_elements(updated_sections) WITH ORDINALITY AS s(elem, ord)
          WHERE ord - 1 = key_contacts_idx
          UNION ALL
          SELECT
            jsonb_set(
              s.elem,
              '{order}',
              to_jsonb(
                CASE WHEN ord - 1 < key_contacts_idx THEN ord ELSE ord - 1 END
              )
            ),
            CASE WHEN ord - 1 < key_contacts_idx THEN ord ELSE ord - 1 END
          FROM jsonb_array_elements(updated_sections) WITH ORDINALITY AS s(elem, ord)
          WHERE ord - 1 <> key_contacts_idx
        )
        SELECT jsonb_agg(elem ORDER BY sort_key) INTO updated_sections FROM reordered;
      END IF;

      -- 5. Append the migrated contacts to Key Contacts'
      -- data.contacts array.
      IF jsonb_array_length(contacts_to_add) > 0 THEN
        cleared_data := jsonb_set(
          cleared_data,
          ARRAY[key_contacts_template_id::text, 'contacts'],
          COALESCE(cleared_data #> ARRAY[key_contacts_template_id::text, 'contacts'], '[]'::jsonb)
            || contacts_to_add,
          true
        );
      END IF;

      -- 6. Write back the updated config + data.
      UPDATE public.advance_form_configs
        SET sections = updated_sections, updated_at = NOW()
        WHERE id = config_row.id;

      UPDATE public.advance_instances
        SET data = cleared_data, last_updated_at = NOW()
        WHERE form_config_id = config_row.id;
    END LOOP;
  END LOOP;

  -- 7. Strip contact-type fields from non-Key-Contacts platform
  -- templates so future advances don't get contact fields
  -- injected in the wrong section.
  UPDATE public.advance_templates
  SET fields = (
    SELECT COALESCE(jsonb_agg(f), '[]'::jsonb)
    FROM jsonb_array_elements(fields) AS f
    WHERE f->>'type' <> 'contact'
  )
  WHERE workspace_id IS NULL
    AND name <> 'Key Contacts'
    AND template_type = 'section'
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(fields) AS f
      WHERE f->>'type' = 'contact'
    );

  RAISE NOTICE 'Sprint 8.6 §5 Key Contacts consolidation complete';
END
$$;

-- 8. Server-side CHECK constraint: prevent contact-type fields
-- in non-Key-Contacts templates going forward. Belt-and-braces
-- against direct DB writes (the UI restriction handles the user
-- path; this catches imports / scripted inserts / future bugs).
--
-- Drop existing constraint if present (idempotent re-run guard),
-- then re-add.
ALTER TABLE public.advance_templates
  DROP CONSTRAINT IF EXISTS advance_templates_contact_only_in_key_contacts;

ALTER TABLE public.advance_templates
  ADD CONSTRAINT advance_templates_contact_only_in_key_contacts
  CHECK (
    name = 'Key Contacts'
    OR NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(fields, '[]'::jsonb)) AS f
      WHERE f->>'type' = 'contact'
    )
  );

COMMENT ON CONSTRAINT advance_templates_contact_only_in_key_contacts ON public.advance_templates IS
  'Sprint 8.6 §5 — contact-type fields are restricted to the Key '
  'Contacts section. UI prevents user-driven violations; this CHECK '
  'catches direct DB writes / imports / scripted inserts.';

-- ============================================
-- Down migration (manual)
-- ============================================
-- This migration is not cleanly reversible — contact field
-- values are merged into Key Contacts arrays with audit metadata
-- but the original section→field→value mapping is lost. To
-- approximately restore:
--
--   1. ALTER TABLE public.advance_templates DROP CONSTRAINT
--      advance_templates_contact_only_in_key_contacts;
--   2. For each contact in Key Contacts data with
--      __migrated_from_section_id metadata, write back to the
--      original section's data[section_template_id][field_id].
--      Re-add the contact field to the original section's
--      fields JSONB.
--   3. Remove the migrated contact entry from Key Contacts.
-- The migrated contacts WITHOUT __migrated_from_* metadata
-- stay in Key Contacts (they were native there or added
-- post-migration).
