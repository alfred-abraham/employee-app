"use client";

import { FormEvent, useEffect, useState } from "react";
import { AppShell, type ShellUser } from "./app-shell";

type Entry = { id: string; employeeId: string; employeeName: string; department: string; type: string; startDate: string; endDate: string; status: string; note: string | null };
type EmployeeChoice = { id: string; firstName: string; lastName: string; department: string };
type Form = { employeeId: string; type: "vacation" | "sick" | "personal" | "other"; startDate: string; endDate: string; note: string };
const blank = (): Form => ({ employeeId: "", type: "vacation", startDate: new Date().toISOString().slice(0, 10), endDate: new Date().toISOString().slice(0, 10), note: "" });
const labels: Record<string, string> = { vacation: "Vacation", sick: "Sick leave", personal: "Personal", other: "Other" };

export function TimeAwayScreen({ user }: { user: ShellUser }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1 });
  const [scope, setScope] = useState("current");
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<Form>(blank);
  const [selectedName, setSelectedName] = useState("");
  const [lookupInput, setLookupInput] = useState("");
  const [choices, setChoices] = useState<EmployeeChoice[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ scope, page: String(page) });
    if (employeeSearch) params.set("employeeSearch", employeeSearch);
    fetch(`/api/time-away?${params}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error); if (!controller.signal.aborted) { setEntries(data.entries); setPagination(data.pagination); setLoading(false); } })
      .catch((cause: unknown) => { if (!controller.signal.aborted) { setError(cause instanceof Error ? cause.message : "Unable to load time away."); setLoading(false); } });
    return () => controller.abort();
  }, [scope, page, employeeSearch, revision]);

  function openCreate() { setEditing(null); setForm(blank()); setSelectedName(""); setLookupInput(""); setChoices([]); setModalOpen(true); }
  function openEdit(entry: Entry) { setEditing(entry); setForm({ employeeId: entry.employeeId, type: entry.type as Form["type"], startDate: entry.startDate, endDate: entry.endDate, note: entry.note ?? "" }); setSelectedName(entry.employeeName); setLookupInput(""); setChoices([]); setModalOpen(true); }

  async function lookupEmployee() {
    if (lookupInput.trim().length < 2) { setError("Enter at least two characters of an employee name."); return; }
    setError("");
    try {
      const response = await fetch(`/api/employees?search=${encodeURIComponent(lookupInput.trim())}&pageSize=20`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setChoices(data.employees);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to find employees."); }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form.employeeId) { setError("Choose an employee from search results."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch(editing ? `/api/time-away/${editing.id}` : "/api/time-away", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setModalOpen(false); setLoading(true); setRevision((value) => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save time away."); }
    finally { setBusy(false); }
  }

  async function cancel(entry: Entry) {
    if (!window.confirm(`Cancel time away for ${entry.employeeName}?`)) return;
    setError("");
    try {
      const response = await fetch(`/api/time-away/${entry.id}`, { method: "DELETE" });
      if (!response.ok) { const data = await response.json(); throw new Error(data.error); }
      setLoading(true); setRevision((value) => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to cancel time away."); }
  }

  return <AppShell user={user} section="time-away" title="Time away" action={<button type="button" onClick={openCreate} className="rounded-lg bg-[#173f2b] px-4 py-2.5 text-sm font-semibold text-white">Add time away</button>}><div className="mx-auto max-w-7xl p-5 sm:p-8">
    {error && <p role="alert" className="mb-5 rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    <section className="overflow-hidden rounded-2xl border border-[#dfe4e1] bg-white shadow-sm"><div className="flex flex-col gap-4 border-b border-[#e6eae7] p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold">Employee leave</h2><p className="text-sm text-[#7b867f]">Confirmed records are classified by UTC date. Cancelled records remain in history.</p></div><div className="flex flex-wrap gap-2"><label><span className="sr-only">Date group</span><select value={scope} onChange={(event) => { setScope(event.target.value); setPage(1); setLoading(true); }} className="rounded-lg border border-[#d6dcd8] bg-white px-3 py-2 text-sm"><option value="current">Current</option><option value="upcoming">Upcoming</option><option value="past">Past</option><option value="all">All</option><option value="cancelled">Cancelled</option></select></label><form onSubmit={(event) => { event.preventDefault(); setEmployeeSearch(searchInput.trim()); setPage(1); setLoading(true); }} className="flex gap-2"><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} maxLength={100} placeholder="Employee name" aria-label="Filter by employee name" className="rounded-lg border border-[#d6dcd8] px-3 py-2 text-sm"/><button className="rounded-lg border border-[#d6dcd8] px-3 py-2 text-sm">Filter</button></form></div></div>
      {loading ? <p className="p-6 text-sm" role="status">Loading time away…</p> : entries.length === 0 ? <p className="p-6 text-sm text-[#7b867f]">No time-away entries match these filters.</p> : <div className="divide-y divide-[#edf0ee]">{entries.map((entry) => <div key={entry.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">{entry.employeeName} <span className="text-sm font-normal text-[#7b867f]">· {entry.department}</span></p><p className="mt-1 text-sm text-[#536058]">{labels[entry.type]} · {entry.startDate} to {entry.endDate} {entry.status === "cancelled" && "· Cancelled"}</p>{entry.note && <p className="mt-1 text-xs text-[#7b867f]">{entry.note}</p>}</div>{entry.status === "confirmed" && <div className="flex gap-2"><button type="button" onClick={() => openEdit(entry)} className="rounded-lg border border-[#d6dcd8] px-3 py-2 text-sm">Edit</button><button type="button" onClick={() => void cancel(entry)} className="rounded-lg border border-[#d6dcd8] px-3 py-2 text-sm text-red-700">Cancel entry</button></div>}</div>)}</div>}
      {!loading && <div className="flex items-center justify-between border-t border-[#e6eae7] p-5 text-sm"><span>{pagination.total} entries · Page {pagination.page} of {pagination.totalPages}</span><div className="flex gap-2"><button type="button" onClick={() => { setPage((value) => value - 1); setLoading(true); }} disabled={page <= 1} className="rounded-lg border border-[#d6dcd8] px-3 py-2 disabled:opacity-50">Previous</button><button type="button" onClick={() => { setPage((value) => value + 1); setLoading(true); }} disabled={page >= pagination.totalPages} className="rounded-lg border border-[#d6dcd8] px-3 py-2 disabled:opacity-50">Next</button></div></div>}
    </section>
  </div>
  {modalOpen && <div className="fixed inset-0 z-40 grid place-items-center bg-[#0b1e14]/60 p-4"><form onSubmit={save} className="max-h-[92vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-center justify-between"><h2 className="text-xl font-semibold">{editing ? "Edit time away" : "Add time away"}</h2><button type="button" onClick={() => setModalOpen(false)} aria-label="Close">✕</button></div>{error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}<p className="text-sm">Employee: <strong>{selectedName || "Choose an employee below"}</strong></p><div><div className="flex gap-2"><input value={lookupInput} onChange={(event) => setLookupInput(event.target.value)} placeholder="Search employee by name" aria-label="Search employee by name" className="min-w-0 flex-1 rounded-lg border border-[#d6dcd8] px-3 py-2 text-sm"/><button type="button" onClick={() => void lookupEmployee()} className="rounded-lg border border-[#d6dcd8] px-3 py-2 text-sm">Find</button></div>{choices.length > 0 && <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-[#d6dcd8]">{choices.map((choice) => <button key={choice.id} type="button" onClick={() => { setForm((value) => ({ ...value, employeeId: choice.id })); setSelectedName(`${choice.firstName} ${choice.lastName}`); setChoices([]); }} className="block w-full border-b border-[#edf0ee] px-3 py-2 text-left text-sm hover:bg-[#f3f5f4]">{choice.firstName} {choice.lastName} · {choice.department}</button>)}</div>}</div><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm">Type<select value={form.type} onChange={(event) => setForm((value) => ({ ...value, type: event.target.value as Form["type"] }))} className="mt-1 block w-full rounded-lg border border-[#d6dcd8] px-3 py-2"><option value="vacation">Vacation</option><option value="sick">Sick leave</option><option value="personal">Personal</option><option value="other">Other</option></select></label><div/><label className="text-sm">Start date<input type="date" required value={form.startDate} onChange={(event) => setForm((value) => ({ ...value, startDate: event.target.value }))} className="mt-1 block w-full rounded-lg border border-[#d6dcd8] px-3 py-2"/></label><label className="text-sm">End date<input type="date" required min={form.startDate} value={form.endDate} onChange={(event) => setForm((value) => ({ ...value, endDate: event.target.value }))} className="mt-1 block w-full rounded-lg border border-[#d6dcd8] px-3 py-2"/></label></div><label className="block text-sm">Note (optional)<textarea value={form.note} onChange={(event) => setForm((value) => ({ ...value, note: event.target.value }))} maxLength={500} className="mt-1 block w-full rounded-lg border border-[#d6dcd8] px-3 py-2"/></label><div className="flex justify-end gap-2"><button type="button" onClick={() => setModalOpen(false)} className="rounded-lg border border-[#d6dcd8] px-4 py-2 text-sm">Close</button><button disabled={busy} className="rounded-lg bg-[#173f2b] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Save</button></div></form></div>}
  </AppShell>;
}
