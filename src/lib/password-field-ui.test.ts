import assert from "node:assert/strict";
import test from "node:test";
import { createElement, useState } from "react";
import { JSDOM } from "jsdom";
import { PasswordField } from "../components/password-field";

function Harness() {
  const [value, setValue] = useState("");
  return createElement(PasswordField, { label: "New password", name: "newPassword", autoComplete: "new-password", value, onChange: setValue });
}

test("password fields mask by default and toggle visibility with an accessible button", async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost:3112" });
  const saved = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: dom.window, self: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const testing = await import("@testing-library/react"), actions = await import("@testing-library/user-event");
  try {
    const view = testing.render(createElement(Harness));
    const input = view.getByLabelText("New password") as HTMLInputElement;
    assert.equal(input.type, "password", "password input must be masked by default");
    const toggle = view.getByRole("button", { name: "Show new password" });
    assert.equal(toggle.getAttribute("aria-pressed"), "false");
    assert.equal(toggle.getAttribute("type"), "button", "toggle must not submit the form");

    const click = actions.default.setup({ document: dom.window.document });
    await click.click(toggle);
    assert.equal(input.type, "text", "toggle must reveal the typed password");
    assert.equal(view.getByRole("button", { name: "Hide new password" }).getAttribute("aria-pressed"), "true");

    await click.click(view.getByRole("button", { name: "Hide new password" }));
    assert.equal(input.type, "password", "toggle must re-mask the password");

    await click.type(input, "Secret9!");
    assert.equal((view.getByLabelText("New password") as HTMLInputElement).value, "Secret9!");
  } finally {
    testing.cleanup();
    await new Promise(resolve => setTimeout(resolve, 50));
    for (const [key, descriptor] of saved) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
    dom.window.close();
  }
});
