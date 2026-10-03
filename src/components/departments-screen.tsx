"use client";

import { permits } from "@/lib/role-policy";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell, type ShellUser } from "./app-shell";

type Department = { id: string; name: string; active: boolean; employeeCount: number };

export function DepartmentsScreen({ user }: { user: ShellUser }) {
  const canEdit = permits(user.roles, "write");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<Department | null>(null);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/departments", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error); if (!controller.signal.aborted) setDepartments(data.departments); })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load departments."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch(editing ? `/api/departments/${editing.id}` : "/api/departments", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setEditing(null); setName(""); setRevision((value) => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save department."); }
    finally { setBusy(false); }
  }

  async function changeState(department: Department) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/departments/${department.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !department.active }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setRevision((value) => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update department."); }
    finally { setBusy(false); }
  }

  return <AppShell user={user} section="departments" title="Departments"><div className="mx-auto max-w-7xl space-y-6 p-5 sm:p-8">
    {canEdit && <section className="rounded-2xl border border-[#dfe4e1] bg-white p-5 shadow-sm"><h2 className="font-semibold">{editing ? "Rename department" : "Add department"}</h2><form onSubmit={submit} className="mt-4 flex flex-col gap-3 sm:flex-row"><label className="flex-1 text-sm"><span className="sr-only">Department name</span><input value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={100} required placeholder="Department name" className="w-full rounded-lg border border-[#d6dcd8] px-3 py-2.5"/></label><button disabled={busy} className="rounded-lg bg-[#173f2b] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{editing ? "Save name" : "Add department"}</button>{editing && <button type="button" onClick={() => { setEditing(null); setName(""); }} className="rounded-lg border border-[#d6dcd8] px-4 py-2.5 text-sm">Cancel</button>}</form></section>}
    {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    <section className="overflow-hidden rounded-2xl border border-[#dfe4e1] bg-white shadow-sm"><div className="border-b border-[#e6eae7] p-5"><h2 className="font-semibold">Teams</h2><p className="text-sm text-[#7b867f]">Manage department names and open their employee lists.</p></div>{loading ? <p className="p-6 text-sm">Loading departments…</p> : departments.length === 0 ? <p className="p-6 text-sm">No departments yet.</p> : <div className="divide-y divide-[#edf0ee]">{departments.map((department) => <div key={department.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">{department.name} {!department.active && <span className="text-xs font-normal text-[#87928b]">(retired)</span>}</p><p className="text-sm text-[#7b867f]">{department.employeeCount} {department.employeeCount === 1 ? "employee" : "employees"}</p></div><div className="flex flex-wrap gap-2"><Link href={`/?department=${encodeURIComponent(department.name)}`} className="rounded-lg border border-[#d6dcd8] px-3 py-2 text-sm">View members</Link>{canEdit && <><button type="button" onClick={() => { setEditing(department); setName(department.name); }} className="rounded-lg border border-[#d6dcd8] px-3 py-2 text-sm">Rename</button><button type="button" disabled={busy} onClick={() => void changeState(department)} className="rounded-lg border border-[#d6dcd8] px-3 py-2 text-sm disabled:opacity-50">{department.active ? "Retire" : "Reactivate"}</button></>}</div></div>)}</div>}</section>
  </div></AppShell>;
}
