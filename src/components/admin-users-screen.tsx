"use client";

import { FormEvent, useEffect, useState } from "react";
import { AppShell, type ShellUser } from "./app-shell";
import { accessStatus, activeRoles, roles, type Role } from "@/lib/role-policy";

type Assignment = { role: Role; expiresAt: string | null };
type Account = { id: string; name: string; email: string; createdAt: string; firstSignInAt: string | null; lastSignInAt: string | null; assignments: Assignment[] };
type Result = { users: Account[]; pagination: { page: number; total: number; totalPages: number } };
const field = "rounded-lg border border-[#d6dcd8] px-3 py-2 text-sm";
const button = `${field} disabled:opacity-50`;
const date = (value: string | null) => value ? new Date(value).toLocaleString() : "Not recorded";
function localDate(value: string | null) {
  if (!value) return "";
  const at = new Date(value);
  return new Date(at.getTime() - at.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function AdminUsersScreen({ user }: { user: ShellUser }) {
  const [result, setResult] = useState<Result | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [role, setRole] = useState<Role>("viewer");
  const [expiry, setExpiry] = useState("");
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/users?${new URLSearchParams({ search, page: String(page) })}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (!controller.signal.aborted) { setResult(data); setLoading(false); }
      }).catch((cause: unknown) => {
        if (!controller.signal.aborted) { setError(cause instanceof Error ? cause.message : "Unable to load users."); setResult(null); setLoading(false); }
      });
    return () => controller.abort();
  }, [search, page, revision]);

  function choose(account: Account, selected: Role) {
    setEditing(account); setRole(selected); setExpiry(localDate(account.assignments.find((assignment) => assignment.role === selected)?.expiresAt ?? null)); setError(""); setMessage("");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    const expiresAt = expiry ? new Date(expiry).toISOString() : null;
    if (expiresAt && new Date(expiresAt) <= new Date()) { setError("Choose a future expiry date and time."); return; }
    await change(editing, role, expiresAt, false);
  }

  async function change(account: Account, selected: Role, expiresAt: string | null, revoke: boolean) {
    if (revoke && !window.confirm(`Revoke ${selected} access for ${account.email}?`)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(account.id)}/roles`, {
        method: revoke ? "DELETE" : "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(revoke ? { role: selected } : { role: selected, expiresAt }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setEditing(null); setMessage(`${selected} access ${revoke ? "revoked" : "saved"} for ${account.email}.`);
      setLoading(true); setRevision((value) => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update access."); }
    finally { setBusy(false); }
  }

  return <AppShell user={user} section="admin" title="User access"><div className="mx-auto max-w-7xl space-y-5 p-5 sm:p-8">
    <div><h2 className="text-2xl font-semibold">Manage access</h2><p className="mt-2 text-sm text-[#66736b]">Grant viewer, editor, or admin roles to accounts. Users wait for approval until they have an active role.</p><p className="mt-1 text-sm text-[#66736b]">Viewer: read employee information. Editor: manage employees, departments, and time away. Admin: manage records and user access.</p></div>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="rounded-lg bg-green-50 p-4 text-sm text-green-800">{message}</p>}
    {editing && <section className="rounded-2xl border border-[#dfe4e1] bg-white p-5"><h3 className="font-semibold">Access for {editing.name}</h3><p className="text-sm text-[#66736b]">{editing.email}</p><form onSubmit={save} className="mt-4 flex flex-wrap items-end gap-4">
      <label className="text-sm">Role<select value={role} disabled={busy} onChange={(event) => { const selected = event.target.value as Role; setRole(selected); setExpiry(localDate(editing.assignments.find((grant) => grant.role === selected)?.expiresAt ?? null)); }} className={`${field} mt-1 block`}>{roles.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <label className="text-sm">Expiry date and time (optional)<input type="datetime-local" value={expiry} disabled={busy} onInput={(event) => setExpiry(event.currentTarget.value)} className={`${field} mt-1 block`}/></label>
      <button type="button" onClick={() => setExpiry("")} disabled={busy || !expiry} className={button}>Clear expiry</button>
      <button disabled={busy} className="rounded-lg bg-[#173f2b] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Save role"}</button>
      <button type="button" onClick={() => setEditing(null)} disabled={busy} className={button}>Cancel</button>
    </form><p className="mt-3 text-xs text-[#66736b]">Dates use your browser&apos;s local timezone. Empty expiry grants permanent access until revoked. At least one admin must retain permanent access.</p></section>}
    <section className="overflow-hidden rounded-2xl border border-[#dfe4e1] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e6eae7] p-5"><h3 className="font-semibold">Accounts</h3><form onSubmit={(event) => { event.preventDefault(); setSearch(searchInput.trim()); setPage(1); setError(""); setLoading(true); setRevision((value) => value + 1); }} className="flex flex-wrap gap-2"><input aria-label="Search users by name or email" placeholder="Name or email" maxLength={100} value={searchInput} onChange={(event) => setSearchInput(event.target.value)} className={field}/><button className={button}>Search</button><button type="button" onClick={() => { setError(""); setLoading(true); setRevision((value) => value + 1); }} className={button}>Refresh</button></form></div>
      {loading ? <p className="p-6 text-sm" role="status">Loading users…</p> : !result ? <p className="p-6 text-sm">Unable to display accounts. Try Refresh.</p> : !result.users.length ? <p className="p-6 text-sm">No users match this search.</p> : <div className="divide-y divide-[#edf0ee]">{result.users.map((account) => <article key={account.id} className="flex flex-col gap-4 p-5 lg:flex-row lg:justify-between"><div><h4 className="font-semibold">{account.name} <span className="ml-2 rounded bg-[#edf2ef] px-2 py-1 text-xs font-normal">{accessStatus(account.assignments, clock)}</span></h4><p className="mt-1 text-sm">{account.email}</p><p className="mt-2 text-xs text-[#66736b]">First sign-in: {date(account.firstSignInAt)}<br/>Last sign-in: {date(account.lastSignInAt)}</p><button type="button" disabled={busy} onClick={() => choose(account, "viewer")} className={`${button} mt-3`}>Grant role</button></div><div className="space-y-2 lg:min-w-96">{account.assignments.length === 0 && <p className="text-sm text-[#66736b]">No roles assigned</p>}{account.assignments.map((assignment) => <div key={assignment.role} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[#f7f9f8] p-3"><div><p className="text-sm font-semibold capitalize">{assignment.role} {!activeRoles([assignment], clock).length && <span className="text-red-700">· Expired</span>}</p><p className="text-xs text-[#66736b]">{assignment.expiresAt ? `Expires ${date(assignment.expiresAt)}` : "No expiry"}</p></div><div className="flex gap-2"><button type="button" disabled={busy} onClick={() => choose(account, assignment.role)} className={button}>Edit</button><button type="button" disabled={busy} onClick={() => void change(account, assignment.role, null, true)} className={`${button} text-red-700`}>Revoke</button></div></div>)}</div></article>)}</div>}
      {!loading && result && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e6eae7] p-5 text-sm"><span>{result.pagination.total} accounts · Page {page} of {result.pagination.totalPages}</span><div className="flex gap-2"><button type="button" disabled={page <= 1 || busy} onClick={() => { setPage((value) => value - 1); setLoading(true); }} className={button}>Previous</button><button type="button" disabled={page >= result.pagination.totalPages || busy} onClick={() => { setPage((value) => value + 1); setLoading(true); }} className={button}>Next</button></div></div>}
    </section>
  </div></AppShell>;
}
