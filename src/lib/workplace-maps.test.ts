import assert from "node:assert/strict";
import test from "node:test";
import { findWorkplacePlaces, googleMapsLink, isGeographicLocation, workplaceEmbedUrl } from "./workplace-maps";

test("non-geographic labels do not produce misleading map pins", () => {
  for (const location of ["", " ", "Remote", "Remote (US)", "WFH", "Hybrid", "N/A", "Unknown", "TBD"]) assert.equal(isGeographicLocation(location), false);
  for (const location of ["Phoenix, AZ", "Denver, CO", "Austin, TX", "Paris", "Remoteville"]) assert.equal(isGeographicLocation(location), true);
});

test("maps URLs safely preserve the workplace query and selected place", () => {
  const location = "London & Bristol / UK?";
  const link = new URL(googleMapsLink(location, "test_place"));
  assert.equal(link.origin, "https://www.google.com");
  assert.equal(link.searchParams.get("query"), location);
  assert.equal(link.searchParams.get("query_place_id"), "test_place");
  assert.equal(new URL(googleMapsLink(location)).searchParams.has("query_place_id"), false);
  const embed = new URL(workplaceEmbedUrl("test_place", "restricted-key"));
  assert.equal(embed.searchParams.get("q"), "place_id:test_place");
});

test("workplace lookup only sends the directory location and returns usable matches", async () => {
  const places = await findWorkplacePlaces("Phoenix, AZ", "server-key", async (url, init) => {
    assert.equal(url, "https://places.googleapis.com/v1/places:searchText");
    assert.deepEqual(JSON.parse(String(init?.body)), { textQuery: "Phoenix, AZ", pageSize: 5 });
    assert.equal(new Headers(init?.headers).get("X-Goog-FieldMask"), "places.id,places.formattedAddress");
    return Response.json({ places: [{ id: "phoenix", formattedAddress: "Phoenix, AZ, USA" }, { id: "incomplete" }] });
  });
  assert.deepEqual(places, [{ id: "phoenix", address: "Phoenix, AZ, USA" }]);
});

test("no matches and Google failures remain distinct from a resolved location", async () => {
  assert.deepEqual(await findWorkplacePlaces("unresolvable", "key", async () => Response.json({})), []);
  await assert.rejects(findWorkplacePlaces("Phoenix", "key", async () => new Response(null, { status: 403 })), /lookup is unavailable/);
});
