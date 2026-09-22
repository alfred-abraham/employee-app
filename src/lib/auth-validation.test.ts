import assert from "node:assert/strict";
import test from "node:test";
import { isPasswordAllowed, safeCallbackURL } from "./auth-validation";

test("password policy accepts a strong password", () => {
  assert.equal(isPasswordAllowed("Useful-Pass9!"), true);
});

test("password policy rejects missing character classes and short values", () => {
  assert.equal(isPasswordAllowed("alllowercase1!"), false);
  assert.equal(isPasswordAllowed("ALLUPPERCASE1!"), false);
  assert.equal(isPasswordAllowed("NoNumberHere!"), false);
  assert.equal(isPasswordAllowed("NoSymbolHere9"), false);
  assert.equal(isPasswordAllowed("Short9!"), false);
});

test("callback URLs stay on the application origin", () => {
  assert.equal(safeCallbackURL("/employees?team=people"), "/employees?team=people");
  assert.equal(safeCallbackURL("https://attacker.example"), "/");
  assert.equal(safeCallbackURL("//attacker.example"), "/");
  assert.equal(safeCallbackURL(undefined), "/");
});
