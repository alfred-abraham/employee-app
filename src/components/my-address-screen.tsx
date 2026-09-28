"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { AppShell, type ShellUser } from "./app-shell";

type Address = { line1: string; line2: string; city: string; region: string; postalCode: string; country: string; placeId: string };
type Suggestion = { placeId: string; text: string };
type Component = { longText?: string; shortText?: string; types?: string[] };
const blank: Address = { line1: "", line2: "", city: "", region: "", postalCode: "", country: "", placeId: "" };

function addressFromPlace(place: { id?: string; addressComponents?: Component[] }, current: Address): Address {
  const get = (type: string, short = false) => {
    const component = place.addressComponents?.find((item) => item.types?.includes(type));
    return (short ? component?.shortText : component?.longText) ?? "";
  };
  const line1 = [get("street_number"), get("route")].filter(Boolean).join(" ");
  return { ...current, line1: line1 || current.line1, city: get("locality") || get("postal_town") || get("sublocality") || current.city,
    region: get("administrative_area_level_1", true) || current.region, postalCode: get("postal_code") || current.postalCode,
    country: get("country") || current.country, placeId: place.id ?? "" };
}

export function MyAddressScreen({ user }: { user: ShellUser }) {
  const [linked, setLinked] = useState<boolean | null>(null);
  const [employeeName, setEmployeeName] = useState("");
  const [address, setAddress] = useState<Address>(blank);
  const [embedKey, setEmbedKey] = useState("");
  const [suggestionsAvailable, setSuggestionsAvailable] = useState(false);
  const [lookup, setLookup] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const sessionToken = useRef(crypto.randomUUID());

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch("/api/me/address", { signal: controller.signal, cache: "no-store" }).then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error); return data; }),
      fetch("/api/maps/config", { signal: controller.signal, cache: "no-store" }).then((response) => response.json()),
    ]).then(([data, config]) => {
      if (controller.signal.aborted) return;
      setLinked(data.linked); setEmployeeName(data.employeeName ?? "");
      if (data.address) setAddress({ line1: data.address.line1, line2: data.address.line2 ?? "", city: data.address.city, region: data.address.region, postalCode: data.address.postalCode, country: data.address.country, placeId: data.address.placeId ?? "" });
      setEmbedKey(config.embedKey ?? ""); setSuggestionsAvailable(Boolean(config.suggestionsAvailable));
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load your address."); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!suggestionsAvailable || lookup.trim().length < 3) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ input: lookup.trim(), sessionToken: sessionToken.current });
      fetch(`/api/maps/autocomplete?${params}`, { signal: controller.signal })
        .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error); if (!controller.signal.aborted) { setSuggestions(data.suggestions); setNotice(""); } })
        .catch((cause: unknown) => { if (!controller.signal.aborted) { setSuggestions([]); setNotice(cause instanceof Error ? cause.message : "Suggestions unavailable. Enter your address manually."); } });
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [lookup, suggestionsAvailable]);

  async function selectSuggestion(suggestion: Suggestion) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/maps/place", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ placeId: suggestion.placeId, sessionToken: sessionToken.current }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setAddress((current) => addressFromPlace(data.place, current));
      setLookup(""); setSuggestions([]); sessionToken.current = crypto.randomUUID();
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : "Place details unavailable. Enter your address manually."); }
    finally { setBusy(false); }
  }

  function setField(field: keyof Address, value: string) { setAddress((current) => ({ ...current, [field]: value, placeId: "" })); }

  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/me/address", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(address) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setNotice("Home address saved.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save home address."); }
    finally { setBusy(false); }
  }

  const mapUrl = address.placeId && embedKey ? `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(embedKey)}&q=${encodeURIComponent(`place_id:${address.placeId}`)}` : "";
  return <AppShell user={user} section="address" title="My address"><div className="mx-auto max-w-4xl space-y-5 p-5 sm:p-8"><div className="rounded-2xl border border-[#dfe4e1] bg-white p-6 shadow-sm"><h2 className="text-lg font-semibold">Home address</h2><p className="mt-1 text-sm text-[#66736b]">Only your linked employee account can read or change this address. Your workplace location remains in the directory.</p>
    {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}{notice && <p role="status" className="mt-4 rounded-lg bg-[#edf4ef] p-3 text-sm text-[#24583d]">{notice}</p>}
    {linked === null ? <p className="mt-6 text-sm">Loading your profile…</p> : !linked ? <p className="mt-6 rounded-lg bg-amber-50 p-4 text-sm text-amber-800">No employee record is linked to your verified account. Contact the application owner to match your work email to an employee record.</p> : <><p className="mt-5 text-sm font-medium">Employee: {employeeName}</p><div className="relative mt-5"><label className="block text-sm font-medium">Find an address with Google Maps<input value={lookup} onChange={(event) => { setLookup(event.target.value); setSuggestions([]); }} disabled={!suggestionsAvailable} placeholder={suggestionsAvailable ? "Start typing a street address" : "Google Maps suggestions are unavailable; use the fields below"} className="mt-1 w-full rounded-lg border border-[#d6dcd8] px-3 py-2.5 disabled:bg-[#f3f5f4]"/></label>{suggestions.length > 0 && <div role="listbox" aria-label="Address suggestions" className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-[#d6dcd8] bg-white shadow-lg">{suggestions.map((item) => <button key={item.placeId} type="button" role="option" aria-selected={false} onClick={() => void selectSuggestion(item)} className="block w-full border-b border-[#edf0ee] px-3 py-2 text-left text-sm hover:bg-[#f3f5f4]">{item.text}</button>)}<p className="px-3 py-2 text-xs text-[#66736b]">Powered by Google</p></div>}</div>
      <form onSubmit={save} className="mt-5 grid gap-4 sm:grid-cols-2">{([['line1','Street address'],['line2','Apartment or unit (optional)'],['city','City'],['region','State or region'],['postalCode','Postal code'],['country','Country']] as const).map(([field,label]) => <label key={field} className="text-sm font-medium">{label}<input value={address[field]} onChange={(event) => setField(field, event.target.value)} maxLength={field === "postalCode" ? 30 : field === "line1" || field === "line2" ? 160 : 100} required={field !== "line2"} className="mt-1 block w-full rounded-lg border border-[#d6dcd8] px-3 py-2.5 font-normal"/></label>)}<div className="sm:col-span-2"><button disabled={busy} className="rounded-lg bg-[#173f2b] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Save address</button></div></form>
      {mapUrl && <div className="mt-6"><h3 className="mb-2 font-semibold">Map preview</h3><iframe title="Selected home address on Google Maps" src={mapUrl} referrerPolicy="no-referrer-when-downgrade" loading="lazy" className="h-72 w-full rounded-xl border border-[#d6dcd8]"/></div>}</>}
  </div></div></AppShell>;
}
