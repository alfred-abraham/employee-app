import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { JSDOM } from "jsdom";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { EmployeeDirectory } from "../components/employee-directory";
import type { Role } from "./role-policy";

test("directory controls: own editing, no editor deletion, filtered own record, creation, and admin access", async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost:3107" });
  const saved = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: dom.window, self: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const originalFetch = globalThis.fetch;
  const testing = await import("@testing-library/react"), actions = await import("@testing-library/user-event");
  const router: AppRouterInstance = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {}, bfcacheId: "ownership" };
  const own = { id: "own", employeeNumber: "AB12", firstName: "Own", lastName: "Person", email: "own@example.com", phone: "", company: "Testing", jobTitle: "Tester", department: "Test", location: "Remote", status: "active", startDate: "2026-10-07", manager: "", createdAt: "", updatedAt: "" };
  const other = { ...own, id: "other", firstName: "Other", email: "other@example.com" };
  let ownEmployee: typeof own | null = own;
  let rows = [own, other];
  const mutations: Array<{ url: string; method: string; body: Record<string, string> }> = [];
  globalThis.fetch = async (url, options) => {
    if (options?.method) { mutations.push({ url: String(url), method: options.method, body: JSON.parse(String(options.body)) }); return Response.json({ employee: { id: "own" } }); }
    return Response.json({ employees: rows, ownEmployee, ownershipError: "", stats: { total: rows.length, departments: 1, onLeave: 0 }, departments: ["Test"], pagination: { page: 1, pageSize: 25, total: rows.length, totalPages: 1, hasPrevious: false, hasNext: false } });
  };
  const render = (role: Role) => testing.render(createElement(AppRouterContext.Provider, { value: router }, createElement(SearchParamsContext.Provider, { value: new URLSearchParams() }, createElement(EmployeeDirectory, { user: { name: "Own Person", email: own.email, image: null, roles: [role] } }))));
  try {
    const click = actions.default.setup({ document: dom.window.document });
    let view = render("editor");
    await testing.waitFor(() => assert.ok(view.getByRole("button", { name: "Edit Own" })));
    assert.equal(view.queryByRole("button", { name: "Edit Other" }), null);
    assert.equal(view.queryAllByRole("button", { name: /^Remove / }).length, 0);
    await click.click(view.getByRole("button", { name: "Edit Own" }));
    assert.equal((view.getByLabelText("Work email") as HTMLInputElement).readOnly, true);
    await click.clear(view.getByLabelText("Job title")); await click.type(view.getByLabelText("Job title"), "Updated");
    await click.click(view.getByRole("button", { name: "Save changes" }));
    await testing.waitFor(() => assert.equal(mutations.length, 1)); assert.equal(mutations[0].url, "/api/employees/own"); assert.equal(mutations[0].method, "PATCH"); assert.equal(mutations[0].body.jobTitle, "Updated");
    testing.cleanup(); rows = [other]; view = render("editor");
    await testing.waitFor(() => assert.ok(view.getByRole("button", { name: "Edit my record" })));
    await click.click(view.getByRole("button", { name: "Edit my record" })); assert.equal((view.getByLabelText("First name") as HTMLInputElement).value, "Own");
    testing.cleanup(); ownEmployee = null; view = render("editor");
    await testing.waitFor(() => assert.ok(view.getByRole("button", { name: "Add my record" })));
    await click.click(view.getByRole("button", { name: "Add my record" })); assert.equal((view.getByLabelText("Work email") as HTMLInputElement).value, own.email);
    testing.cleanup(); rows = [own, other]; view = render("admin");
    await testing.waitFor(() => assert.equal(view.getAllByRole("button", { name: /^Remove / }).length, 2));
    assert.equal(view.getAllByRole("button", { name: /^Edit / }).length, 2); assert.ok(view.getByRole("button", { name: "Add employee" }));
    testing.cleanup(); view = render("viewer");
    await testing.waitFor(() => assert.ok(view.getByText("Other Person")));
    assert.equal(view.queryAllByRole("button", { name: /^(Edit|Remove|Add) / }).length, 0);
  } finally {
    testing.cleanup(); globalThis.fetch = originalFetch;
    await new Promise(resolve => setTimeout(resolve, 50));
    for (const [key, descriptor] of saved) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
    dom.window.close();
  }
});
