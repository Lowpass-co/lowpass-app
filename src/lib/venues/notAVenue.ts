/* ============================================
   LOWPASS — a city is not a venue (Nov 2026, Adam)

   Days off and travel days have a city, not a venue. Three ways a city kept
   ending up in routing.venue_name:
     · typing "London" into the Venue / Location box on a day off;
     · picking "London" from the Google suggestions there — which also made a
       canonical venue called "London" in the shared venue library;
     · tour books / Daysheets exports that repeat the city in the venue column.
   It then showed on the Advance board and Schedule as if it were a venue.

   The rule, everywhere a routing row is written:
     venueIsCity  — the venue text is the day's city ("London", "london",
                    "London, UK", "Zürich" vs "Zurich") → no venue.
     isCityPlace  — a Google pick that is a town / region / country rather
                    than a place (no establishment type) → it fills the city,
                    never the venue, and never makes a library venue.
   Migration 284 holds the same rule as a trigger on routing, so no writer —
   including one added later — can store it.
   ============================================ */

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/** The venue text names the city itself ("London", "London, UK"). */
export function venueIsCity(venue: string | null | undefined, city: string | null | undefined): boolean {
  const v = fold(venue ?? '');
  const c = fold(city ?? '');
  if (!v || !c) return false;
  return v === c || fold(v.split(',')[0]) === c;
}

/** Google place types that mean "somewhere", not "a place you play". */
const AREA_TYPES = new Set([
  'locality',
  'postal_town',
  'sublocality',
  'sublocality_level_1',
  'neighborhood',
  'administrative_area_level_1',
  'administrative_area_level_2',
  'administrative_area_level_3',
  'country',
  'colloquial_area',
  'political',
]);

/** A Google pick that is a town / region / country, not a venue. An
 *  establishment (or point of interest) always counts as a venue, even when
 *  it also carries area types. */
export function isCityPlace(types: readonly string[] | null | undefined): boolean {
  if (!types || types.length === 0) return false;
  if (types.includes('establishment') || types.includes('point_of_interest')) return false;
  return types.some((t) => AREA_TYPES.has(t));
}
