"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Download, FileText, LoaderCircle, RefreshCw, Trash2, Upload } from "lucide-react";
import { AppShell, type ShellUser } from "./app-shell";
import { defaultDocumentLimits, formatDocumentBytes, type DocumentCategory, type DocumentLimits, type ProfileDocument } from "@/lib/document-policy";

export function MyDocumentsScreen({ user }: { user: ShellUser }) {
  const [documents, setDocuments] = useState<ProfileDocument[]>([]);
  const [limits, setLimits] = useState<DocumentLimits>(defaultDocumentLimits);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<DocumentCategory>("resume");
  const [busy, setBusy] = useState("");
  const [removeId, setRemoveId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadKey = useRef<string | null>(null);
  const listRequest = useRef(0);

  const refresh = useCallback(async () => {
    const version = ++listRequest.current;
    setLoading(true);
    try {
      const response = await fetch("/api/me/documents", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load your documents.");
      if (version !== listRequest.current) return;
      setDocuments(data.documents); setLimits(data.limits); setConfigured(data.configured); setLoaded(true);
    } catch (failure) {
      if (version === listRequest.current) setError(failure instanceof Error ? failure.message : "Unable to load your documents.");
    } finally { if (version === listRequest.current) setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    return () => { window.clearTimeout(timer); };
  }, [refresh]);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || busy) return;
    setError(""); setNotice("");
    if (file.size === 0 || file.size > limits.maxFileBytes || !/\.(pdf|docx)$/i.test(file.name)) {
      setError(`Choose a nonempty PDF or DOCX file up to ${formatDocumentBytes(limits.maxFileBytes)}.`); return;
    }
    setBusy("upload");
    uploadKey.current ??= crypto.randomUUID();
    try {
      const response = await fetch("/api/me/documents", { method: "POST", headers: {
        "Content-Type": file.type || "application/octet-stream",
        "X-Document-Name": encodeURIComponent(file.name),
        "X-Document-Category": category,
        "Idempotency-Key": uploadKey.current,
      }, body: file });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to upload your document.");
      setNotice(`${file.name} uploaded.`); setFile(null); uploadKey.current = null;
      if (fileInput.current) fileInput.current.value = "";
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to upload your document."); }
    finally { await refresh(); setBusy(""); }
  }

  async function remove(document: ProfileDocument) {
    setBusy(document.id); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/me/documents/${document.id}`, { method: "DELETE" });
      if (!response.ok) { const data = await response.json(); throw new Error(data.error || "Unable to remove your document."); }
      setNotice(`${document.originalName} removed.`); setRemoveId(null);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to remove your document."); }
    finally { await refresh(); setBusy(""); }
  }

  async function download(document: ProfileDocument) {
    setBusy(document.id); setError("");
    try {
      const response = await fetch(`/api/me/documents/${document.id}`);
      if (!response.ok) { const data = await response.json(); throw new Error(data.error || "Unable to download your document."); }
      const url = URL.createObjectURL(await response.blob());
      const link = window.document.createElement("a");
      link.href = url; link.download = document.originalName; window.document.body.append(link); link.click(); link.remove();
      // Give the browser time to start reading the object URL.
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to download your document."); }
    finally { setBusy(""); }
  }

  const used = documents.reduce((total, document) => total + document.byteSize, 0);
  return <AppShell user={user} section="documents" title="My documents">
    <section className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
      <div className="rounded-2xl border border-[#dfe4e1] bg-white p-5 sm:p-7">
        <h2 className="text-xl font-semibold">Your profile documents</h2>
        <p className="mt-2 text-sm text-[#66736b]">Keep your resume and other documents with your profile. Only you can access them through the app.</p>
        {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {notice && <p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
        {loaded && !configured && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Document uploads are not configured yet. Contact the application owner. Existing documents can still be downloaded or removed.</p>}
        <form onSubmit={(event) => void upload(event)} className="mt-6 grid gap-4 sm:grid-cols-[1fr_200px_auto] sm:items-end">
          <label className="block text-sm font-medium">Document<input ref={fileInput} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={Boolean(busy) || !loaded || !configured} onChange={(event) => { setFile(event.target.files?.[0] ?? null); uploadKey.current = null; setError(""); }} aria-describedby="document-limits" className="mt-2 block w-full rounded-lg border border-[#d6dcd8] p-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-[#e4efe7] file:px-3 file:py-1 file:text-[#315f43] disabled:opacity-50"/></label>
          <label className="block text-sm font-medium">Category<select value={category} disabled={Boolean(busy)} onChange={(event) => { setCategory(event.target.value as DocumentCategory); uploadKey.current = null; }} className="mt-2 w-full rounded-lg border border-[#d6dcd8] bg-white p-2.5"><option value="resume">Resume</option><option value="other">Other document</option></select></label>
          <button disabled={!file || Boolean(busy) || !configured} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#173f2b] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy === "upload" ? <LoaderCircle size={16} className="animate-spin"/> : <Upload size={16}/>} {busy === "upload" ? "Uploading…" : "Upload"}</button>
        </form>
        <p id="document-limits" className="mt-3 text-xs leading-5 text-[#66736b]">PDF or DOCX, up to {formatDocumentBytes(limits.maxFileBytes)} per file. Up to {limits.maxDocuments} documents and {formatDocumentBytes(limits.maxTotalBytes)} total. Password-protected DOCX files and macro-enabled documents are unsupported.</p>
      </div>
      <div className="mt-6 rounded-2xl border border-[#dfe4e1] bg-white p-5 sm:p-7" aria-busy={loading}>
        <div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold">Saved documents</h2>{loaded && <p className="mt-1 text-xs text-[#66736b]">{documents.length} of {limits.maxDocuments} documents · {formatDocumentBytes(used)} used</p>}</div><button type="button" onClick={() => { setError(""); void refresh(); }} disabled={loading || Boolean(busy)} aria-label="Refresh documents" className="rounded-lg border border-[#d6dcd8] p-2 disabled:opacity-50"><RefreshCw size={17}/></button></div>
        {loading && <p role="status" className="mt-5 text-sm text-[#66736b]">Loading documents…</p>}
        {!loading && loaded && documents.length === 0 && <p className="mt-5 text-sm text-[#66736b]">No documents yet. Upload your resume or another document above.</p>}
        <ul className="mt-4 divide-y divide-[#e2e7e3]">{documents.map((document) => <li key={document.id} className="py-4">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 gap-3"><FileText size={22} className="mt-1 shrink-0 text-[#568067]"/><div className="min-w-0"><p className="break-all text-sm font-semibold">{document.originalName}</p><p className="mt-1 text-xs text-[#66736b]">{document.category === "resume" ? "Resume" : "Other document"} · {formatDocumentBytes(document.byteSize)} · {new Date(document.createdAt).toLocaleDateString()}</p>{document.status !== "ready" && <p className="mt-1 text-xs text-amber-800">{document.status === "pending" ? "Upload incomplete or processing. Abandoned uploads are cleaned up automatically." : "Awaiting removal. Retry Remove or wait for automatic cleanup."}</p>}</div></div>
            <div className="flex shrink-0 gap-2">{document.status === "ready" && <button type="button" onClick={() => void download(document)} disabled={Boolean(busy)} aria-label={`Download ${document.originalName}`} className="inline-flex items-center gap-2 rounded-lg border border-[#d6dcd8] px-3 py-2 text-sm disabled:opacity-50"><Download size={16}/>Download</button>}{document.status !== "pending" && <button type="button" onClick={() => setRemoveId(document.id)} disabled={Boolean(busy)} aria-label={`Remove ${document.originalName}`} className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 disabled:opacity-50"><Trash2 size={16}/>Remove</button>}</div>
          </div>
          {removeId === document.id && <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-red-50 p-3 text-sm"><p>Remove this document permanently?</p><button type="button" onClick={() => void remove(document)} disabled={Boolean(busy)} className="rounded-lg bg-red-700 px-3 py-2 font-semibold text-white disabled:opacity-50">{busy === document.id ? "Removing…" : "Remove document"}</button><button type="button" onClick={() => setRemoveId(null)} disabled={Boolean(busy)} className="rounded-lg border border-red-200 px-3 py-2">Cancel</button></div>}
        </li>)}</ul>
      </div>
    </section>
  </AppShell>;
}
