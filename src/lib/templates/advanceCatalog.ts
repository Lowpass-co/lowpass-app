/* ============================================
   LOWPASS — The advance question catalogue (Nov 2026, Adam: "drastically
   improve all templates … each useful and curated")

   ONE list of the questions an advance can ask, each in exactly one
   section. The starters (tourTemplates.ts ADVANCE_STARTERS) pick sections
   from here by name; migration 303 is GENERATED from this file
   (`advanceCatalogSql`) and a test fails if the two drift.

   Rules (Adam, Nov 2026):
   - Every question exists ONCE, in the section a venue person answers it in.
   - Lean: what matters on most days. Anything else is added on Templates.
   - Lowpass doesn't ask for what it already holds — venue name / address /
     website (venue library), hotel + flights (their own pages, shown read
     only), the deal and settlement money (Income), contacts (Key Contacts
     only; the database refuses a contact question anywhere else, 076).
   - Settlement is ONE contact in Key Contacts — no Settlement section.
   - No "Final confirmation" re-ask list; "Documents received" is a short
     tick-list only the tour sees (tm_only — never on a venue form).

   Answers are stored as data[section row id][question id], so a section that
   carries on keeps its database row (`from`: the old platform names whose row
   it takes over) and a question that keeps its meaning keeps its id.
   ============================================ */

export type AdvanceFieldType =
  | 'text' | 'textarea' | 'number' | 'currency' | 'time' | 'date' | 'boolean' | 'select' | 'url' | 'email' | 'contact' | 'file';

export interface CatalogField {
  id: string;
  label: string;
  type: AdvanceFieldType;
  options?: string[];
  placeholder?: string;
}

export interface CatalogSectionDef {
  /** Fixed id for a section that is NEW (inserted). Sections that take over
   *  an old row (`from`) keep that row's id. */
  id: string;
  name: string;
  description: string;
  icon: string;
  /** Old platform section names whose row this one takes over (first found
   *  wins; the others are deleted). Empty = a brand-new row with `id`. */
  from: string[];
  tmOnly?: boolean;
  /** Shown only when this question is answered with one of these (see
   *  lib/advance/sectionVisibility.ts). A starter can list the section in
   *  `always` to drop the condition (Festival days always ask about weather). */
  showWhen?: { field: string; in: string[] };
  fields: CatalogField[];
}

const t = (id: string, label: string, placeholder?: string): CatalogField => ({ id, label, type: 'text', ...(placeholder ? { placeholder } : {}) });
const long = (id: string, label: string, placeholder?: string): CatalogField => ({ id, label, type: 'textarea', ...(placeholder ? { placeholder } : {}) });
const time = (id: string, label: string): CatalogField => ({ id, label, type: 'time' });
const num = (id: string, label: string): CatalogField => ({ id, label, type: 'number' });
const yes = (id: string, label: string): CatalogField => ({ id, label, type: 'boolean' });
const money = (id: string, label: string): CatalogField => ({ id, label, type: 'currency' });
const pick = (id: string, label: string, options: string[]): CatalogField => ({ id, label, type: 'select', options });
const who = (id: string, label: string): CatalogField => ({ id, label, type: 'contact' });
const mail = (id: string, label: string): CatalogField => ({ id, label, type: 'email' });
const upload = (id: string, label: string, placeholder?: string): CatalogField => ({ id, label, type: 'file', ...(placeholder ? { placeholder } : {}) });

export const ADVANCE_CATALOG: CatalogSectionDef[] = [
  {
    id: '30300000-0000-4000-8000-000000000001',
    name: 'Key Contacts',
    description: 'Who to call, for what',
    icon: 'users',
    from: ['Key Contacts'],
    fields: [
      who('promoter_buyer', 'Promoter'),
      who('primary_advance_contact', 'Advance contact'),
      who('day_of_show_venue_contact', 'Day-of-show contact'),
      who('production_contact', 'Production'),
      who('hospitality_catering_contact', 'Hospitality / catering'),
      who('runner_contact', 'Runner'),
      who('security_lead', 'Security'),
      who('box_office_ticketing_contact', 'Box office'),
      who('merchandise_contact', 'Merch'),
      who('settlement_contact', 'Settlement'),
      who('artist_transport_contact', 'Artist transport'),
    ],
  },
  {
    id: '30300000-0000-4000-8000-000000000002',
    name: 'Show',
    description: 'Capacity, age limit, indoor or outdoor',
    icon: 'ticket',
    from: ['Event Basics'],
    fields: [
      num('capacity', 'Capacity'),
      num('sellable_capacity', 'Sellable capacity'),
      t('age_limit', 'Age limit'),
      pick('indoor_outdoor', 'Indoor / outdoor', ['Indoor', 'Outdoor', 'Covered']),
    ],
  },
  {
    id: '30300000-0000-4000-8000-000000000003',
    name: 'Schedule',
    description: 'Arrival, load in, soundchecks, doors, sets, curfews, load out',
    icon: 'clock',
    from: ['Schedule'],
    fields: [
      time('earliest_bus_arrival', 'Earliest bus arrival'),
      time('earliest_venue_access', 'Earliest access'),
      time('load_in', 'Load in'),
      time('headliner_soundcheck', 'Headliner soundcheck'),
      time('support_soundcheck', 'Support soundcheck'),
      time('security_brief', 'Security brief'),
      time('vip_meet_and_greet', 'VIP meet & greet'),
      time('doors_open', 'Doors'),
      time('support_set', 'Support set'),
      t('changeover', 'Changeover', 'e.g. 30 min'),
      time('headliner_set', 'Headliner set'),
      time('curfew', 'Curfew'),
      time('load_out', 'Load out'),
      time('backstage_curfew', 'Backstage curfew'),
      long('schedule_notes', 'Schedule notes', 'Noise limits, early load out, anything else'),
    ],
  },
  {
    id: '30300000-0000-4000-8000-000000000004',
    name: 'Arrival & Parking',
    description: 'Where vehicles go, when they must leave, power and limits',
    icon: 'truck',
    from: ['Bus and Trailer', 'Transport'],
    fields: [
      long('bus_parking', 'Where the bus / truck parks'),
      t('correct_entrance', 'Entrance for drivers', 'Address or gate to aim for'),
      time('latest_departure_time', 'Must leave by'),
      yes('overnight_parking_permitted', 'Overnight parking allowed'),
      t('shore_power_amperage_connection', 'Shore power', 'Amps and connector, or none'),
      long('low_branches_gates_weight_restrictions', 'Height, width or weight limits on the way in'),
      t('gate_code', 'Gate code'),
      t('personal_vehicle_parking_location', 'Cars and vans park at'),
    ],
  },
  {
    id: '30300000-0000-4000-8000-000000000005',
    name: 'Production',
    description: 'Stage, load-in access, power and the house systems',
    icon: 'speaker',
    from: ['Production'],
    fields: [
      t('stage_dimensions', 'Stage size', 'W × D × H'),
      t('load_in_access', 'Load-in access', 'Dock, push, stairs, lift'),
      long('power_details', 'Power', 'Amps, phase, where'),
      t('pa_system', 'PA'),
      t('foh_console', 'House FOH console'),
      t('monitor_system', 'Monitors'),
      t('mon_console', 'House monitor console'),
      t('lighting_console', 'Lighting rig and desk'),
      upload('lighting_patch', 'Lighting patch', 'Image or PDF'),
      long('backline_provided', 'Backline provided'),
      yes('haze_allowed', 'Haze allowed'),
      yes('hazer_supplied', 'Hazer supplied'),
      long('production_notes', 'Production notes'),
    ],
  },
  {
    id: '30300000-0000-4000-8000-000000000006',
    name: 'Dressing Rooms',
    description: 'Rooms, bathrooms, showers, towels, Wi-Fi, laundry, production office',
    icon: 'door-closed',
    from: ['Dressing Rooms'],
    fields: [
      num('num_dressing_rooms', 'Rooms available'),
      yes('lockable_access', 'Lockable'),
      t('backstage_bathrooms', 'Backstage bathrooms', 'How many, where'),
      t('showers_number_location', 'Showers', 'How many, where, hot water'),
      t('towel_cost', 'Towel cost', 'e.g. $1 per towel, or $10 per bundle'),
      t('production_office', 'Production office'),
      t('wifi_network_password', 'Wi-Fi network and password'),
      t('laundry_location_hours', 'Laundry', 'Washer / dryer, where, detergent provided?'),
    ],
  },
  {
    id: '30300000-0000-4000-8000-000000000007',
    name: 'Catering & Hospitality',
    description: 'Catering or buyout, budget, meal times',
    icon: 'utensils',
    from: ['Hospitality'],
    fields: [
      pick('catering_buyout', 'Catering or buyout', ['Catering', 'Buyout', 'Both']),
      money('catering_budget', 'Catering budget'),
      num('tour_party_count', 'Meals for (touring party)'),
      t('breakfast_time_details', 'Breakfast', 'Time and where'),
      t('lunch_time_details', 'Lunch', 'Time and where'),
      t('dinner_time_menu', 'Dinner', 'Time, where, menu'),

    ],
  },
  {
    id: '30300000-0000-4000-8000-000000000008',
    name: 'Runner',
    description: 'Whether there is one, hours, vehicle',
    icon: 'car',
    from: ['Runner'],
    fields: [
      yes('runner_available', 'Runner available'),
      time('runner_on_clock', 'From'),
      time('runner_off_clock', 'Until'),
      t('runner_vehicle', 'Vehicle and seats'),
      yes('airport_runs_permitted', 'Can do airport runs'),
      t('runner_breaks', 'Breaks'),
    ],
  },
  {
    id: '30300000-0000-4000-8000-000000000009',
    name: 'Merch',
    description: 'Concession, house fee, the split, the stand, counts',
    icon: 'shirt',
    from: ['Merch'],
    fields: [
      t('merch_concession', 'Concession'),
      num('merch_house_fee', 'House fee'),
      num('soft_goods_split', 'Soft goods — % to venue'),
      num('hard_goods_split', 'Hard goods — % to venue'),
      t('merch_location', 'Where merch is'),
      long('tables_chairs_grid_display', 'Tables, grid, lighting, power'),
      yes('venue_pos', 'Venue POS'),
      yes('venue_counts_in_out', 'Count in / count out'),
    ],
  },
  {
    id: '30300000-0000-4000-8000-00000000000a',
    name: 'Guests & Credentials',
    description: 'Guest list allocation, collection, passes',
    icon: 'id-card',
    from: ['Comps and Ticketing'],
    fields: [
      num('artist_comps', 'Guest list allocation'),
      t('support_guest_allocation', 'Shared with support? Their allocation'),
      t('digital_or_box_office', 'Guests collect from', 'Box office, digital, guest list window'),
      mail('send_guest_list_to', 'Send the guest list to'),
      t('credential_distribution_location', 'Passes picked up at'),
    ],
  },
  {
    id: '30300000-0000-4000-8000-00000000000b',
    name: 'Security & Safety',
    description: 'Barrier, entry screening, bags, re-entry, pit',
    icon: 'shield',
    from: ['Security'],
    fields: [
      t('barrier_setup', 'Barrier'),
      yes('walk_through_scanners', 'Walk-through scanners'),
      yes('wanding', 'Wanding'),
      yes('bag_check', 'Bag check'),
      t('bag_size_limit', 'Bag size limit'),
      yes('clear_bag_policy', 'Clear-bag policy'),
      yes('reentry_allowed', 'Re-entry allowed'),
      num('pit_security_count', 'Pit / stage-front security (how many)'),
    ],
  },
  {
    id: '30300000-0000-4000-8000-00000000000c',
    name: 'Weather & Outdoor',
    description: 'Shown when the show is outdoor or covered: cover, stop rules, ground',
    icon: 'cloud-rain',
    from: ['Outdoor Venue and Final Confirmation'],
    showWhen: { field: 'indoor_outdoor', in: ['Outdoor', 'Covered'] },
    fields: [
      long('rain_plan', 'Rain and cover plan'),
      long('lightning_protocol', 'Lightning / high-wind stop rules'),
      t('severe_weather_shelter', 'Shelter'),
      long('ground_conditions_towing_plan', 'Ground conditions', 'Trackway, towing'),
      t('cancellation_decision_authority', 'Weather show-stop contact'),
    ],
  },
  {
    id: '30300000-0000-4000-8000-00000000000f',
    name: 'Festival',
    description: 'Getting to stage, artist transport, the catering system',
    icon: 'tent',
    from: [],
    fields: [
      t('getting_to_stage', 'Getting to stage', 'Shuttle, golf cart, walk'),
      t('artist_transport_booked_through', 'Artist transport booked through'),
      pick('catering_system', 'Catering system', ['Tokens', 'Buffet', 'Buyout', 'Artist catering']),
      yes('meal_numbers_confirmed', 'Our meal numbers confirmed for every meal'),
    ],
  },
  {
    id: '30300000-0000-4000-8000-00000000000d',
    name: 'Local Info',
    description: 'Hospital, pharmacy, food, laundry, gym',
    icon: 'map-pin',
    from: ['Local Info'],
    fields: [
      t('nearest_hospital', 'Nearest hospital / A&E'),
      t('nearest_pharmacy', 'Nearest pharmacy'),
      t('nearest_grocery_store', 'Nearest supermarket'),
      long('local_restaurants', 'Food nearby'),
      t('laundromat', 'Laundrette'),
      t('gym_nearby', 'Gym'),
    ],
  },
  {
    id: '30300000-0000-4000-8000-00000000000e',
    name: 'Documents Received',
    description: 'What the venue has sent you',
    icon: 'file-check',
    from: ['Documents and Maps'],
    tmOnly: true,
    fields: [
      yes('venue_tech_pack_received', 'Tech pack'),
      yes('venue_map_received', 'Venue / site map'),
      yes('bus_trailer_parking_map_received', 'Parking map'),
      yes('hospitality_information_received', 'Hospitality info'),
      yes('house_security_protocol_received', 'House security info'),
      yes('final_run_of_show_received', 'Final run of show'),
    ],
  },
];

/** Old platform sections with no successor — deleted (with their workspace
 *  copies). Their stored answers stay in the JSON, unshown. */
export const RETIRED_ADVANCE_SECTIONS = [
  'Venue Info', 'Settlement', 'Deal Info', 'Hotel', 'Flights', 'Driver and Hotels',
  'Personal Vehicle Parking', 'Venue Amenities', 'Airport and Local Distances',
];

export const catalogSectionByName = (name: string): CatalogSectionDef | undefined =>
  ADVANCE_CATALOG.find((s) => s.name.toLowerCase() === name.trim().toLowerCase());
