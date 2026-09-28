import assert from "node:assert/strict";
import test from "node:test";
import { escapeLike, parseEmployeeQuery } from "./employee-query";

test("employee query defaults to a bounded first page", () => {
  assert.deepEqual(parseEmployeeQuery(new URLSearchParams()), { page: 1, pageSize: 25, search: undefined, department: undefined, status: undefined });
});

test("employee query accepts combined search, department, status, and page", () => {
  const params = new URLSearchParams({ search: "  Ada Lovelace ", department: "Engineering", status: "active", page: "3", pageSize: "50" });
  assert.deepEqual(parseEmployeeQuery(params), { search: "Ada Lovelace", department: "Engineering", status: "active", page: 3, pageSize: 50 });
});

test("employee query rejects unbounded or invalid requests", () => {
  for (const input of ["page=0", "page=-1", "page=1.5", "page=1000001", "pageSize=0", "pageSize=101", "search=a", `search=${"x".repeat(121)}`, "status=unknown"]) {
    assert.equal(parseEmployeeQuery(new URLSearchParams(input)), null, input);
  }
});

test("search wildcards are escaped as literal text", () => {
  assert.equal(escapeLike("A%_\\B"), "A\\%\\_\\\\B");
});
