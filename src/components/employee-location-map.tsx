"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, MapPin, X } from "lucide-react";
import { googleMapsLink, workplaceEmbedUrl, type WorkplacePlace } from "@/lib/workplace-maps";

export function EmployeeLocationMap({ name, location, onClose }: { name: string; location: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [result, setResult] = useState<{ places: WorkplacePlace[]; embedKey: string } | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState("");
  const [mapFailed, setMapFailed] = useState(false);
  const selected = result?.places.find((place) => place.id === selectedId);
  const mapUrl = selected && result?.embedKey ? workplaceEmbedUrl(selected.id, result.embedKey) : "";

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/maps/workplace?${new URLSearchParams({ location })}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]), cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "The map preview is unavailable.");
        if (controller.signal.aborted) return;
        setResult(data);
        if (data.places.length === 1) setSelectedId(data.places[0].id);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error && cause.name !== "TimeoutError" ? cause.message : "The map preview timed out. Open Google Maps instead.");
      });
    return () => controller.abort();
  }, [location]);

  return <dialog ref={dialogRef} onClose={onClose} aria-labelledby="employee-map-title" aria-describedby="employee-map-description" className="fixed inset-0 m-auto max-h-[92dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-2xl bg-white p-0 text-[#17221c] shadow-2xl backdrop:bg-[#0b1e14]/60" onClick={(event) => { if (event.target === event.currentTarget) dialogRef.current?.close(); }}>
    <div className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4"><div><h2 id="employee-map-title" className="text-xl font-semibold">{name}</h2><p id="employee-map-description" className="mt-1 flex items-center gap-2 text-sm text-[#66736b]"><MapPin size={16}/>{location}</p></div><button type="button" autoFocus onClick={() => dialogRef.current?.close()} aria-label="Close employee map" className="rounded-lg p-2 hover:bg-[#edf2ef]"><X size={20}/></button></div>
      <p className="mt-3 text-sm text-[#66736b]">Workplace location from the employee directory.</p>
      {!result && !error && <p role="status" className="mt-5 rounded-lg bg-[#edf2ef] p-4 text-sm">Finding location…</p>}
      {error && <p role="status" className="mt-5 rounded-lg bg-[#edf2ef] p-4 text-sm">{error}</p>}
      {result?.places.length === 0 && <p role="status" className="mt-5 rounded-lg bg-[#edf2ef] p-4 text-sm">No matching location was found. Open Google Maps to search for this location.</p>}
      {result && result.places.length > 1 && <label className="mt-5 block text-sm font-medium">Choose the matching location<select value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setMapFailed(false); }} className="mt-2 w-full rounded-lg border border-[#d6dcd8] bg-white p-3"><option value="">Select a location</option>{result.places.map((place) => <option key={place.id} value={place.id}>{place.address}</option>)}</select></label>}
      {mapUrl && !mapFailed && <><p className="mt-4 text-sm text-[#66736b]">{selected?.address}</p><iframe title={`Google Maps workplace location for ${name}: ${location}`} src={mapUrl} width="600" height="360" className="mt-3 h-80 w-full rounded-xl border-0 sm:h-96" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" onError={() => setMapFailed(true)}/><p className="mt-2 text-xs text-[#66736b]">If the map does not load or the match looks incorrect, open Google Maps to search.</p></>}
      {mapFailed && <p role="status" className="mt-5 text-sm">The map could not load. Open Google Maps instead.</p>}
      <a href={googleMapsLink(location, selected?.id)} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#173f2b] px-4 py-2.5 text-sm font-semibold text-white">Open in Google Maps<ExternalLink size={16}/><span className="sr-only"> (opens in a new tab)</span></a>
    </div>
  </dialog>;
}
