"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, CalendarDays, ChevronDown, CircleAlert, Edit3, LayoutDashboard, LoaderCircle, LogOut, Mail, MapPin, MoreHorizontal, Plus, Search, Trash2, Users, X } from "lucide-react";
import { authClient } from "@/lib/auth-client";

type Employee = {
  id: string; employeeNumber: string; firstName: string; lastName: string; email: string; phone: string | null;
  company: string; jobTitle: string; department: string; location: string; status: "active" | "on_leave" | "inactive";
  startDate: string; manager: string | null; createdAt: string; updatedAt: string;
};
type Stats = { total: number; departments: number; onLeave: number };
type Pagination = { page: number; pageSize: number; total: number; totalPages: number; hasPrevious: boolean; hasNext: boolean };
type DirectoryResponse = { employees: Employee[]; stats: Stats; pagination: Pagination; departments: string[] };
type FormState = Omit<Employee, "id" | "createdAt" | "updatedAt">;

const emptyForm: FormState = { employeeNumber: "", firstName: "", lastName: "", email: "", phone: "", company: "", jobTitle: "", department: "", location: "", status: "active", startDate: new Date().toISOString().slice(0, 10), manager: "" };
const statusLabels = { active: "Active", on_leave: "On leave", inactive: "Inactive" };
const initials = (employee: Employee) => `${employee.firstName[0]}${employee.lastName[0]}`;

export function EmployeeDirectory({ user }: { user: { name: string; email: string } }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.get("search") ?? "";
  const department = searchParams.get("department") ?? "all";
  const page = Number(searchParams.get("page") ?? "1");
  const [result, setResult] = useState<{ key: string; data?: DirectoryResponse; error?: string } | null>(null);
  const [error, setError] = useState("");
  const [searchDraft, setSearchDraft] = useState({ query, value: query });
  const [revision, setRevision] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const requestKey = JSON.stringify([query, department, page, revision]);
  const current = result?.key === requestKey ? result : null;
  const loading = !current;
  const employees = current?.data?.employees ?? [];
  const stats = current?.data?.stats ?? { total: 0, departments: 0, onLeave: 0 };
  const pagination = current?.data?.pagination ?? { page: 1, pageSize: 25, total: 0, totalPages: 1, hasPrevious: false, hasNext: false };
  const departments = current?.data?.departments ?? [];
  const search = searchDraft.query === query ? searchDraft.value : query;
  const displayError = error || current?.error;

  async function signOut() {
    setSigningOut(true);
    await authClient.signOut();
    router.replace("/login");
    router.refresh();
  }

  function navigate(changes: { search?: string; department?: string; page?: number }) {
    setError("");
    const params = new URLSearchParams(searchParams.toString());
    if (changes.search !== undefined) {
      if (changes.search) params.set("search", changes.search); else params.delete("search");
    }
    if (changes.department !== undefined) {
      if (changes.department !== "all") params.set("department", changes.department); else params.delete("department");
    }
    if (changes.page !== undefined) {
      if (changes.page > 1) params.set("page", String(changes.page)); else params.delete("page");
    }
    const next = params.toString();
    router.push(next ? `/?${next}` : "/", { scroll: false });
  }

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (query) params.set("search", query);
    if (department !== "all") params.set("department", department);
    params.set("page", String(page));
    fetch(`/api/employees?${params}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (controller.signal.aborted) return;
        if (page > data.pagination.totalPages) {
          params.set("page", String(data.pagination.totalPages));
          router.replace(`/?${params}`, { scroll: false });
          return;
        }
        setResult({ key: requestKey, data });
      })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setResult({ key: requestKey, error: cause instanceof Error ? cause.message : "Unable to load employees." }); });
    return () => controller.abort();
  }, [query, department, page, requestKey, router]);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    const value = search.trim();
    if (value.length === 1) { setError("Enter at least two characters to search."); return; }
    setError("");
    navigate({ search: value, page: 1 });
  }

  function openCreate() { setEditing(null); setForm(emptyForm); setModalOpen(true); }
  function openEdit(employee: Employee) {
    setEditing(employee);
    setForm({ employeeNumber: employee.employeeNumber, firstName: employee.firstName, lastName: employee.lastName, email: employee.email, phone: employee.phone ?? "", company: employee.company, jobTitle: employee.jobTitle, department: employee.department, location: employee.location, status: employee.status, startDate: employee.startDate, manager: employee.manager ?? "" });
    setModalOpen(true);
  }

  async function saveEmployee(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const response = await fetch(editing ? `/api/employees/${editing.id}` : "/api/employees", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setModalOpen(false); setRevision((value) => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save employee."); }
    finally { setSaving(false); }
  }

  async function removeEmployee(employee: Employee) {
    if (!window.confirm(`Remove ${employee.firstName} ${employee.lastName} from the directory?`)) return;
    const response = await fetch(`/api/employees/${employee.id}`, { method: "DELETE" });
    if (response.ok) {
      if (employees.length === 1 && page > 1) navigate({ page: page - 1 });
      else setRevision((value) => value + 1);
    } else setError("Unable to remove employee.");
  }

  const setField = (field: keyof FormState, value: string) => setForm((current) => ({ ...current, [field]: value }));

  return (
    <div className="min-h-screen bg-[#f3f5f4] text-[#17221c] lg:grid lg:grid-cols-[228px_1fr]">
      <aside className="hidden border-r border-[#dfe4e1] bg-[#153d2a] p-5 text-white lg:flex lg:flex-col">
        <div className="flex items-center gap-3 border-b border-white/10 pb-6"><div className="grid size-10 place-items-center rounded-xl bg-[#d7f06b] text-[#153d2a]"><Users size={21} strokeWidth={2.5} /></div><div><p className="font-semibold tracking-tight">PeopleCore</p><p className="text-xs text-white/55">Employee operations</p></div></div>
        <nav className="mt-6 space-y-1 text-sm"><a className="flex items-center gap-3 rounded-lg bg-white/10 px-3 py-2.5 font-medium" href="#"><LayoutDashboard size={17}/>Directory</a><span className="flex items-center gap-3 px-3 py-2.5 text-white/55"><Building2 size={17}/>Departments</span><span className="flex items-center gap-3 px-3 py-2.5 text-white/55"><CalendarDays size={17}/>Time away</span></nav>
        <div className="mt-auto rounded-xl border border-white/10 bg-white/5 p-3"><p className="text-xs font-semibold">System status</p><p className="mt-1 flex items-center gap-2 text-xs text-white/55"><span className="size-2 rounded-full bg-[#d7f06b]"/>Connected to PostgreSQL</p></div>
      </aside>

      <main className="min-w-0">
        <header className="border-b border-[#dfe4e1] bg-white px-5 py-4 sm:px-8"><div className="mx-auto flex max-w-7xl items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#568067]">People operations</p><h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">Employee directory</h1></div><div className="flex items-center gap-2 sm:gap-3"><div className="hidden text-right md:block"><p className="text-sm font-semibold">{user.name}</p><p className="text-xs text-[#7a857e]">{user.email}</p></div><button type="button" onClick={() => void signOut()} disabled={signingOut} aria-label="Log out" className="rounded-lg border border-[#d6dcd8] bg-white p-2.5 text-[#536058] transition hover:bg-[#f2f5f3] disabled:opacity-50"><LogOut size={17}/></button><button onClick={openCreate} className="inline-flex items-center gap-2 rounded-lg bg-[#173f2b] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#24583d]"><Plus size={17}/> <span className="hidden sm:inline">Add employee</span></button></div></div></header>
        <div className="mx-auto max-w-7xl p-5 sm:p-8">
          {displayError && <div className="mb-5 flex items-center justify-between rounded-xl border border-[#efc9c5] bg-[#fff5f3] px-4 py-3 text-sm text-[#9c3028]" role="alert"><span className="flex items-center gap-2"><CircleAlert size={17}/>{displayError}</span>{current?.error ? <button type="button" onClick={() => setRevision((value) => value + 1)} className="font-semibold underline">Try again</button> : <button type="button" aria-label="Dismiss error" onClick={() => setError("")}><X size={17}/></button>}</div>}
          <section className="grid gap-4 sm:grid-cols-3">
            {[{ label: "Total employees", value: stats.total, note: "Across the organization", icon: Users }, { label: "Departments", value: stats.departments, note: "Active teams", icon: Building2 }, { label: "On leave", value: stats.onLeave, note: "Currently away", icon: CalendarDays }].map((item) => <article key={item.label} className="rounded-2xl border border-[#dfe4e1] bg-white p-5 shadow-[0_1px_3px_rgba(16,35,23,.04)]"><div className="flex items-start justify-between"><div><p className="text-sm font-medium text-[#66736b]">{item.label}</p><p className="mt-2 text-3xl font-semibold tracking-[-0.04em]">{item.value}</p><p className="mt-1 text-xs text-[#8a958e]">{item.note}</p></div><div className="rounded-xl bg-[#edf4ef] p-2.5 text-[#356448]"><item.icon size={19}/></div></div></article>)}
          </section>
          <section className="mt-6 overflow-hidden rounded-2xl border border-[#dfe4e1] bg-white shadow-[0_1px_3px_rgba(16,35,23,.04)]">
            <div className="flex flex-col gap-4 border-b border-[#e6eae7] p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold">Team members</h2><p className="mt-0.5 text-sm text-[#7b867f]">Employee profiles and work information</p></div><div className="flex flex-col gap-2 sm:flex-row"><form onSubmit={submitSearch} role="search" className="flex gap-2"><label className="relative flex-1"><span className="sr-only">Search people</span><Search className="absolute left-3 top-2.5 text-[#87928b]" size={16}/><input value={search} onChange={(event) => setSearchDraft({ query, value: event.target.value })} maxLength={120} className="w-full rounded-lg border border-[#d6dcd8] py-2 pl-9 pr-3 text-sm outline-none transition focus:border-[#4c7f60] focus:ring-2 focus:ring-[#4c7f60]/15" placeholder="Search people"/></label><button type="submit" className="rounded-lg bg-[#173f2b] px-3 py-2 text-sm font-semibold text-white">Search</button>{query && <button type="button" onClick={() => { setSearchDraft({ query: "", value: "" }); navigate({ search: "", page: 1 }); }} className="rounded-lg border border-[#d6dcd8] px-3 py-2 text-sm">Clear</button>}</form><label className="relative"><select value={department} onChange={(event) => navigate({ department: event.target.value, page: 1 })} aria-label="Filter by department" className="w-full appearance-none rounded-lg border border-[#d6dcd8] bg-white py-2 pl-3 pr-8 text-sm outline-none"><option value="all">All departments</option>{departments.map((name) => <option key={name}>{name}</option>)}</select><ChevronDown className="pointer-events-none absolute right-2.5 top-2.5" size={15}/></label></div></div>
            {loading ? <div className="grid min-h-64 place-items-center text-[#6c7870]" role="status"><LoaderCircle className="animate-spin"/><span className="sr-only">Loading employees</span></div> : current?.error ? <div className="grid min-h-64 place-items-center px-6 text-center text-sm text-[#78847c]">Employee results could not be loaded.</div> : employees.length === 0 ? <div className="grid min-h-64 place-items-center px-6 text-center"><div><Users className="mx-auto text-[#95a099]"/><p className="mt-3 font-medium">No employees found</p><p className="mt-1 text-sm text-[#78847c]">{query || department !== "all" ? "Try another search or clear your filters." : "Add a person to get started."}</p></div></div> : <div className="overflow-x-auto"><table className="w-full min-w-[960px] text-left text-sm"><thead className="bg-[#f7f9f8] text-xs uppercase tracking-[0.08em] text-[#758078]"><tr><th className="px-5 py-3 font-semibold">Employee</th><th className="px-5 py-3 font-semibold">Company</th><th className="px-5 py-3 font-semibold">Role</th><th className="px-5 py-3 font-semibold">Department</th><th className="px-5 py-3 font-semibold">Location</th><th className="px-5 py-3 font-semibold">Status</th><th className="px-5 py-3"><span className="sr-only">Actions</span></th></tr></thead><tbody>{employees.map((employee) => <tr key={employee.id} className="border-t border-[#edf0ee] transition hover:bg-[#fafcfb]"><td className="px-5 py-4"><div className="flex items-center gap-3"><div className="grid size-9 place-items-center rounded-full bg-[#e4efe7] text-xs font-bold text-[#315f43]">{initials(employee)}</div><div><p className="font-semibold">{employee.firstName} {employee.lastName}</p><p className="mt-0.5 flex items-center gap-1 text-xs text-[#7a857e]"><Mail size={11}/>{employee.email}</p></div></div></td><td className="px-5 py-4 text-[#536058]">{employee.company}</td><td className="px-5 py-4 text-[#536058]">{employee.jobTitle}</td><td className="px-5 py-4"><span className="rounded-md bg-[#f0f3f1] px-2 py-1 text-xs font-medium">{employee.department}</span></td><td className="px-5 py-4 text-[#68746c]"><span className="flex items-center gap-1.5"><MapPin size={14}/>{employee.location}</span></td><td className="px-5 py-4"><span className={`status status-${employee.status}`}><span/>{statusLabels[employee.status]}</span></td><td className="px-5 py-4"><div className="flex justify-end gap-1"><button aria-label={`Edit ${employee.firstName}`} onClick={() => openEdit(employee)} className="rounded-md p-2 text-[#627067] hover:bg-[#edf2ef] hover:text-[#173f2b]"><Edit3 size={16}/></button><button aria-label={`Remove ${employee.firstName}`} onClick={() => void removeEmployee(employee)} className="rounded-md p-2 text-[#87928b] hover:bg-[#fff0ee] hover:text-[#b13c32]"><Trash2 size={16}/></button><MoreHorizontal className="hidden"/></div></td></tr>)}</tbody></table></div>}
            {!loading && !displayError && <div className="flex flex-col gap-3 border-t border-[#e6eae7] px-5 py-4 text-sm text-[#66736b] sm:flex-row sm:items-center sm:justify-between"><p aria-live="polite">{pagination.total === 0 ? "0 results" : `${(pagination.page - 1) * pagination.pageSize + 1}–${Math.min(pagination.page * pagination.pageSize, pagination.total)} of ${pagination.total} results`}</p><div className="flex items-center gap-2"><button type="button" onClick={() => navigate({ page: page - 1 })} disabled={!pagination.hasPrevious} className="rounded-lg border border-[#d6dcd8] px-3 py-2 disabled:opacity-50">Previous</button><span>Page {pagination.page} of {pagination.totalPages}</span><button type="button" onClick={() => navigate({ page: page + 1 })} disabled={!pagination.hasNext} className="rounded-lg border border-[#d6dcd8] px-3 py-2 disabled:opacity-50">Next</button></div></div>}
          </section>
        </div>
      </main>

      {modalOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-[#0b1e14]/50 p-4 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) setModalOpen(false); }}><form onSubmit={saveEmployee} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl"><div className="sticky top-0 z-10 flex items-start justify-between border-b border-[#e2e7e3] bg-white px-6 py-5"><div><h2 className="text-xl font-semibold tracking-tight">{editing ? "Edit employee" : "Add employee"}</h2><p className="mt-1 text-sm text-[#748078]">Keep the organization directory up to date.</p></div><button type="button" aria-label="Close" onClick={() => setModalOpen(false)} className="rounded-lg p-2 hover:bg-[#f0f3f1]"><X size={18}/></button></div><div className="grid gap-4 p-6 sm:grid-cols-2">
        <Field label="First name" value={form.firstName} onChange={(v) => setField("firstName", v)} required/><Field label="Last name" value={form.lastName} onChange={(v) => setField("lastName", v)} required/><Field label="Employee number" value={form.employeeNumber} onChange={(v) => setField("employeeNumber", v)} required/><Field label="Work email" type="email" value={form.email} onChange={(v) => setField("email", v)} required/><Field label="Company" value={form.company} onChange={(v) => setField("company", v)} required/><Field label="Job title" value={form.jobTitle} onChange={(v) => setField("jobTitle", v)} required/><Field label="Department" value={form.department} onChange={(v) => setField("department", v)} required/><Field label="Location" value={form.location} onChange={(v) => setField("location", v)} required/><Field label="Start date" type="date" value={form.startDate} onChange={(v) => setField("startDate", v)} required/><Field label="Phone" value={form.phone ?? ""} onChange={(v) => setField("phone", v)}/><Field label="Manager" value={form.manager ?? ""} onChange={(v) => setField("manager", v)}/><label className="text-sm font-medium text-[#435047]">Status<select value={form.status} onChange={(e) => setField("status", e.target.value)} className="mt-1.5 w-full rounded-lg border border-[#d5dcd7] bg-white px-3 py-2.5 font-normal outline-none focus:border-[#4c7f60] focus:ring-2 focus:ring-[#4c7f60]/15"><option value="active">Active</option><option value="on_leave">On leave</option><option value="inactive">Inactive</option></select></label>
        </div><div className="flex justify-end gap-3 border-t border-[#e2e7e3] bg-[#fafbfa] px-6 py-4"><button type="button" onClick={() => setModalOpen(false)} className="rounded-lg border border-[#d5dcd7] bg-white px-4 py-2.5 text-sm font-semibold">Cancel</button><button disabled={saving} className="inline-flex min-w-32 items-center justify-center gap-2 rounded-lg bg-[#173f2b] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{saving && <LoaderCircle className="animate-spin" size={16}/>} {editing ? "Save changes" : "Add employee"}</button></div></form></div>}
    </div>
  );
}

function Field({ label, value, onChange, type = "text", required = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) {
  return <label className="text-sm font-medium text-[#435047]">{label}<input type={type} value={value} onChange={(event) => onChange(event.target.value)} required={required} className="mt-1.5 w-full rounded-lg border border-[#d5dcd7] px-3 py-2.5 font-normal outline-none transition focus:border-[#4c7f60] focus:ring-2 focus:ring-[#4c7f60]/15"/></label>;
}
