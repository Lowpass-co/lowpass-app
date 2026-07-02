/* ============================================================
   LOWPASS — Place → English city/country (routing-city fix)

   A tiny server-side helper that fetches Google Place Details in ENGLISH
   (languageCode=en) and derives the metro city via the same robust fallback the
   /api/places/details route uses (locality → postal_town → sublocality →
   admin_area_2 → admin_area_1). Used by the canonical-venue city refresh + the
   admin city backfill so an English city can normalise a stored localized/blank
   one. NO rate guard here — the caller (the backfill) rides guardGoogleCall.
   ============================================================ */

interface AddressComponent {
  types?: string[];
  longText?: string;
  shortText?: string;
}

/** Metro city + country from Place Details addressComponents (English when the
 *  request asked for languageCode=en). Same precedence as the details route. */
export function extractCityCountry(components: AddressComponent[] | undefined): {
  inferredCity: string | null;
  country: string | null;
} {
  let locality: string | undefined;
  let postalTown: string | undefined;
  let sublocality: string | undefined;
  let adminArea2: string | undefined;
  let adminArea1: string | undefined;
  let country: string | undefined;
  for (const comp of components ?? []) {
    const types = comp.types ?? [];
    const text = comp.longText ?? comp.shortText ?? '';
    if (types.includes('locality')) locality = text;
    if (types.includes('postal_town')) postalTown = text;
    if (types.includes('sublocality') || types.includes('sublocality_level_1')) sublocality = text;
    if (types.includes('administrative_area_level_2')) adminArea2 = text;
    if (types.includes('administrative_area_level_1')) adminArea1 = text;
    if (types.includes('country')) country = text;
  }
  const inferredCity =
    locality?.trim() || postalTown?.trim() || sublocality?.trim() || adminArea2?.trim() || adminArea1?.trim() || null;
  return { inferredCity, country: country?.trim() || null };
}

/** Fetch the English metro city + country for a Google Place ID. Returns null when
 *  the key is missing / the call fails (caller treats null as "leave as-is"). */
export async function fetchPlaceCityCountry(
  placeId: string,
): Promise<{ inferredCity: string | null; country: string | null } | null> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  const pid = placeId?.trim();
  if (!key || !pid) return null;
  try {
    const res = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(pid)}?languageCode=en`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask': 'addressComponents',
        },
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { addressComponents?: AddressComponent[] };
    return extractCityCountry(data.addressComponents);
  } catch {
    return null;
  }
}
