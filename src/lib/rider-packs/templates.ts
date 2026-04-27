import type { Field } from '@/lib/rider-packs/types';

export type RiderPackTemplateSection = {
  /** Default key; may be suffixed if the pack already has this key. */
  section_key: string;
  title: string;
  fields: Field[];
};

export type RiderPackTemplate = {
  id: string;
  name: string;
  description: string;
  sections: RiderPackTemplateSection[];
};

function text(key: string, label: string, placeholder: string): Field {
  return { type: 'text', key, label, value: placeholder };
}

function timeK(key: string, label: string): Field {
  return { type: 'time', key, label, value: '', tz: '' };
}

function tableSimple(key: string, label: string, colLabels: string[]): Field {
  const columns = colLabels.map((l, i) => ({ key: `c${i}`, label: l }));
  return {
    type: 'table',
    key,
    label,
    columns,
    rows: [],
  };
}

/** Starter layouts — every field and section remains fully editable after apply. */
export const RIDER_PACK_TEMPLATES: RiderPackTemplate[] = [
  {
    id: 'full_production',
    name: 'Production & audio',
    description: 'Backline, FOH, monitors, power, and stage plot notes — typical touring tech rider.',
    sections: [
      {
        section_key: 'production',
        title: 'Production',
        fields: [
          text('f1', 'Backline / equipment', 'List backline, risers, ties, special kit…'),
          text('f2', 'Power & distro', 'Amps, sockets, phases, distro location…'),
          text('f3', 'Stage plot', 'Paste link to plot or describe stage layout…'),
          tableSimple('f4', 'Input list (optional)', ['Ch', 'Source', 'Mic/DI', 'Notes']),
        ],
      },
      {
        section_key: 'audio',
        title: 'FOH & monitors',
        fields: [
          text('f1', 'Console & engine', 'Model, surface location, drive lines…'),
          text('f2', 'PA & hangs', 'System, delays, subs, limitations…'),
          text('f3', 'Monitors / IEM', 'Wedges, side fills, RF, guest positions…'),
          timeK('f4', 'Soundcheck time'),
        ],
      },
      {
        section_key: 'lighting',
        title: 'Lighting & video',
        fields: [
          text('f1', 'LX plot & focus', 'Trim, specials, haze, crowd…'),
          text('f2', 'Video / LED', 'Content, IMAG, signal path…'),
        ],
      },
    ],
  },
  {
    id: 'hospitality_guests',
    name: 'Hospitality & guests',
    description: 'Catering, dressing rooms, guest list, and local contacts.',
    sections: [
      {
        section_key: 'hospitality',
        title: 'Hospitality',
        fields: [
          text('f1', 'Catering & dietary', 'Meal times, allergies, head count…'),
          text('f2', 'Dressing rooms', 'Assignments, showers, security…'),
          text('f3', 'Bar & rider buyout', 'Policy, buyout amount, what’s provided…'),
        ],
      },
      {
        section_key: 'guest_list',
        title: 'Guest list & holds',
        fields: [tableSimple('f1', 'Guest list', ['Name', '+1', 'Notes'])],
      },
      {
        section_key: 'local_contacts',
        title: 'Local contacts',
        fields: [
          text('f1', 'Promoter / TM', 'Name, phone, email…'),
          text('f2', 'Vendor contacts', 'Bus parking, local crew, runner…'),
        ],
      },
    ],
  },
  {
    id: 'travel_load',
    name: 'Travel, load & schedule',
    description: 'Load-in, bus/truck, parking, and day-of timeline.',
    sections: [
      {
        section_key: 'schedule',
        title: 'Day schedule',
        fields: [
          text('f1', 'Load-in & line check', 'Times, constraints…'),
          text('f2', 'Doors, show, curfew', 'Published vs actual…'),
          timeK('f3', 'Curfew (local)'),
        ],
      },
      {
        section_key: 'transport',
        title: 'Transport & parking',
        fields: [
          text('f1', 'Buses & trucks', 'Parking, unload, width limits…'),
          text('f2', 'Flights & baggage', 'If any — PNR, excess, carnet…'),
        ],
      },
      {
        section_key: 'safety',
        title: 'Safety & access',
        fields: [
          text('f1', 'Crew & venue safety', 'Briefing, PPE, pyro, crowd barriers…'),
          text('f2', 'Access & load dock', 'Dock height, lift, hours…'),
        ],
      },
    ],
  },
];

export function makeUniqueSectionKey(base: string, existing: Set<string>): string {
  if (!existing.has(base)) return base;
  let n = 2;
  while (existing.has(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}
