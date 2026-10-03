export type WorkplacePlace = { id: string; address: string };

export function isGeographicLocation(location: string) {
  const value = location.trim();
  return value.length >= 2 && !/^(remote(?:\b.*)?|work from home|wfh|hybrid|virtual|anywhere|n\/?a|none|unknown|not specified|tbd|-)$/i.test(value);
}

export function googleMapsLink(location: string, placeId?: string) {
  const params = new URLSearchParams({ api: "1", query: location });
  if (placeId) params.set("query_place_id", placeId);
  return `https://www.google.com/maps/search/?${params}`;
}

export function workplaceEmbedUrl(placeId: string, key: string) {
  const params = new URLSearchParams({ key, q: `place_id:${placeId}` });
  return `https://www.google.com/maps/embed/v1/place?${params}`;
}

export async function findWorkplacePlaces(location: string, key: string, request = fetch): Promise<WorkplacePlace[]> {
  const response = await request("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "places.id,places.formattedAddress" },
    body: JSON.stringify({ textQuery: location, pageSize: 5 }),
    cache: "no-store", signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("Workplace location lookup is unavailable.");
  const data = await response.json();
  return (data.places ?? []).flatMap((place: { id?: string; formattedAddress?: string }) =>
    place.id && place.formattedAddress ? [{ id: place.id, address: place.formattedAddress }] : []);
}
