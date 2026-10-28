/* A venue request can ask only some questions (advance_intake_links.ask_fields,
   "<section>:<field>"; null = all). Applied to the venue form's schema on
   every public read and on submit, so a venue can't answer what it wasn't
   asked and the form never shows it. */

import type { IntakeFormSchema } from './intake';

export function limitSchemaToAsked(schema: IntakeFormSchema, askFields: string[] | null | undefined): IntakeFormSchema {
  if (!askFields || askFields.length === 0) return schema;
  const asked = new Set(askFields);
  return {
    sections: schema.sections
      .map((s) => ({ ...s, fields: s.fields.filter((f) => asked.has(`${s.template_id}:${f.id}`)) }))
      .filter((s) => s.fields.length > 0),
  };
}
