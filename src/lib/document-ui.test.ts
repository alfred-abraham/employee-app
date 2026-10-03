import assert from "node:assert/strict";
import test, { before, beforeEach, afterEach, after } from "node:test";
import { createElement } from "react";
import { JSDOM } from "jsdom";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { MyDocumentsScreen } from "../components/my-documents-screen";
import { defaultDocumentLimits, type ProfileDocument } from "./document-policy";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost:3108" });
const originalFetch = globalThis.fetch;
const originalGlobals = new Map<string, PropertyDescriptor | undefined>();
let testing: typeof import("@testing-library/react");
let actions: typeof import("@testing-library/user-event");
let saved: ProfileDocument[];
let configured: boolean;
let loseUploadResponse: boolean;
let downloadFailure: boolean;
let uploadKeys: string[];
let mutations: number;
const router: AppRouterInstance = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {}, bfcacheId: "document-test" };

before(async () => {
  for (const [name, value] of Object.entries({ window: dom.window, self: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, File: dom.window.File, IS_REACT_ACT_ENVIRONMENT: true })) {
    originalGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  testing = await import("@testing-library/react");
  actions = await import("@testing-library/user-event");
});
beforeEach(() => {
  saved = []; configured = true; loseUploadResponse = false; downloadFailure = false; uploadKeys = []; mutations = 0;
  globalThis.fetch = async (url, options) => {
    const path = String(url);
    if (options?.method === "POST") {
      const headers = new Headers(options.headers);
      const key = headers.get("idempotency-key")!;
      uploadKeys.push(key);
      if (!saved.length) saved.push({ id: "6c7e1111-2222-4333-8444-555555555555", originalName: decodeURIComponent(headers.get("x-document-name")!), category: headers.get("x-document-category") as "resume" | "other", contentType: "application/pdf", byteSize: (options.body as File).size, createdAt: "2026-10-03T12:00:00Z", status: "ready" });
      if (loseUploadResponse) { loseUploadResponse = false; throw new Error("Connection interrupted. Retry upload."); }
      return Response.json({ document: saved[0] }, { status: 201 });
    }
    if (options?.method === "DELETE") { mutations++; saved = []; return new Response(null, { status: 204 }); }
    if (path.endsWith("/documents")) return Response.json({ documents: saved, configured, limits: defaultDocumentLimits });
    if (downloadFailure) return Response.json({ error: "The stored document is unavailable." }, { status: 404 });
    return new Response("document bytes");
  };
});
afterEach(() => testing.cleanup());
after(() => {
  globalThis.fetch = originalFetch;
  for (const [name, descriptor] of originalGlobals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
  dom.window.close();
});

async function screen() {
  const rendered = testing.render(createElement(AppRouterContext.Provider, { value: router }, createElement(MyDocumentsScreen, { user: { name: "Document Test", email: "documents@example.invalid", image: null, roles: [] } })));
  await testing.waitFor(() => assert.ok(rendered.getByText("No documents yet. Upload your resume or another document above.")));
  return { ...rendered, user: actions.default.setup({ document: dom.window.document }) };
}

test("profile document UI uploads with category/limits and exposes self-service navigation without a directory role", async () => {
  const view = await screen();
  assert.ok(view.getByRole("link", { name: "My documents" }));
  assert.equal(view.queryByRole("link", { name: "Directory" }), null);
  assert.match(view.getByText(/PDF or DOCX, up to/).textContent!, /10.0 MB/);
  await view.user.selectOptions(view.getByLabelText("Category"), "other");
  await view.user.upload(view.getByLabelText("Document"), new dom.window.File(["%PDF-1.7\n%%EOF"], "certificate.pdf", { type: "application/pdf" }));
  await view.user.click(view.getByRole("button", { name: "Upload" }));
  await testing.waitFor(() => assert.ok(view.getByText("certificate.pdf uploaded.")));
  assert.equal(saved[0].category, "other");
  assert.ok(view.getByRole("button", { name: "Download certificate.pdf" }));
  assert.ok(view.getByRole("button", { name: "Remove certificate.pdf" }));
  assert.equal((view.getByLabelText("Document") as HTMLInputElement).value, "");
});

test("UI retry reuses the upload identifier after a lost response", async () => {
  const view = await screen();
  loseUploadResponse = true;
  await view.user.upload(view.getByLabelText("Document"), new dom.window.File(["pdf"], "resume.pdf", { type: "application/pdf" }));
  await view.user.click(view.getByRole("button", { name: "Upload" }));
  await testing.waitFor(() => assert.match(view.getByRole("alert").textContent!, /Connection interrupted/));
  await testing.waitFor(() => assert.equal((view.getByRole("button", { name: "Upload" }) as HTMLButtonElement).disabled, false));
  await view.user.click(view.getByRole("button", { name: "Upload" }));
  await testing.waitFor(() => assert.ok(view.getByText("resume.pdf uploaded.")));
  assert.equal(uploadKeys.length, 2);
  assert.equal(uploadKeys[0], uploadKeys[1]);
  assert.equal(saved.length, 1);
});

test("removal requires confirmation, cancel retains the document, and download errors appear in the profile", async () => {
  const view = await screen();
  await view.user.upload(view.getByLabelText("Document"), new dom.window.File(["pdf"], "resume.pdf", { type: "application/pdf" }));
  await view.user.click(view.getByRole("button", { name: "Upload" }));
  await testing.waitFor(() => assert.ok(view.getByText("resume.pdf uploaded.")));
  downloadFailure = true;
  await view.user.click(view.getByRole("button", { name: "Download resume.pdf" }));
  await testing.waitFor(() => assert.match(view.getByRole("alert").textContent!, /unavailable/));
  await view.user.click(view.getByRole("button", { name: "Remove resume.pdf" }));
  assert.equal(mutations, 0);
  await view.user.click(view.getByRole("button", { name: "Cancel" }));
  assert.equal(saved.length, 1);
  await view.user.click(view.getByRole("button", { name: "Remove resume.pdf" }));
  await view.user.click(view.getByRole("button", { name: "Remove document" }));
  await testing.waitFor(() => assert.ok(view.getByText("resume.pdf removed.")));
  assert.equal(mutations, 1);
  assert.equal(saved.length, 0);
});

test("missing bucket configuration disables uploads with clear guidance", async () => {
  configured = false;
  const view = await screen();
  assert.match(view.getByText(/Document uploads are not configured/).textContent!, /Contact the application owner/);
  assert.equal((view.getByLabelText("Document") as HTMLInputElement).disabled, true);
  assert.equal((view.getByRole("button", { name: "Upload" }) as HTMLButtonElement).disabled, true);
});
