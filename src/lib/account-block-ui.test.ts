import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { JSDOM } from "jsdom";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { AdminUsersScreen } from "../components/admin-users-screen";

test("admin UI confirms blocking and reinstatement, shows audit history, and disables self-blocking", async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost:3107" });
  const saved = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: dom.window, self: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const originalFetch = globalThis.fetch;
  const requests: Array<{method: string; body: object}> = [];
  let blocked = false, confirmed = false;
  dom.window.confirm = () => confirmed;
  const base = { createdAt: new Date().toISOString(), firstSignInAt: null, lastSignInAt: null, assignments: [], block: null, blockAudit: [] };
  globalThis.fetch = async (_url, options) => {
    if (options?.method) {
      requests.push({ method: options.method, body: JSON.parse(String(options.body)) }); blocked = options.method === "PUT";
      return Response.json({ success: true });
    }
    return Response.json({ users: [{ ...base, id: "self", name: "Admin", email: "admin@example.com" }, { ...base, id: "target", name: "Target", email: "target@example.com", block: blocked ? { reason: "Reported abuse", expiresAt: null, actorId: "self", createdAt: new Date().toISOString() } : null, blockAudit: requests.length ? [{ id: "audit", actorId: "self", action: blocked ? "block" : "unblock", reason: "Reported abuse", createdAt: new Date().toISOString() }] : [] }], pagination: { page: 1, total: 2, totalPages: 1 } });
  };
  const testing = await import("@testing-library/react"), actions = await import("@testing-library/user-event");
  const router: AppRouterInstance = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {}, bfcacheId: "block-test" };
  try {
    const view = testing.render(createElement(AppRouterContext.Provider, { value: router }, createElement(AdminUsersScreen, { user: { name: "Admin", email: "admin@example.com", image: null, roles: ["admin"] } })));
    const click = actions.default.setup({ document: dom.window.document });
    await testing.waitFor(() => assert.equal(view.getAllByRole("button", { name: "Block account" }).length, 2));
    const buttons = view.getAllByRole("button", { name: "Block account" }) as HTMLButtonElement[];
    assert.equal(buttons[0].disabled, true);
    await click.click(buttons[1]);
    await click.type(view.getByLabelText("Internal reason (admins only)"), "Reported abuse");
    await click.click(view.getByRole("button", { name: "Confirm block" })); assert.equal(requests.length, 0, "cancelled confirmation must not send a mutation");
    confirmed = true;
    await click.click(view.getByRole("button", { name: "Confirm block" }));
    await testing.waitFor(() => assert.ok(view.getByRole("button", { name: "Unblock account" })));
    assert.deepEqual(requests[0], { method: "PUT", body: { reason: "Reported abuse", expiresAt: null } });
    assert.ok(view.getByText("Block history"));
    await click.click(view.getByRole("button", { name: "Unblock account" }));
    await click.type(view.getByLabelText("Internal reason (admins only)"), "Reviewed");
    await click.click(view.getByRole("button", { name: "Confirm unblock" }));
    await testing.waitFor(() => assert.equal(requests.length, 2));
    assert.deepEqual(requests[1], { method: "DELETE", body: { reason: "Reviewed" } });
    await testing.waitFor(() => assert.equal(view.getAllByRole("button", { name: "Block account" }).length, 2));
  } finally {
    testing.cleanup(); globalThis.fetch = originalFetch;
    await new Promise(resolve => setTimeout(resolve, 50));
    for (const [key, descriptor] of saved) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
    dom.window.close();
  }
});
