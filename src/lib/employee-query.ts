export const defaultPageSize = 25;
export const maxPageSize = 100;

export type EmployeeQuery = {
  search?: string;
  department?: string;
  status?: "active" | "on_leave" | "inactive";
  page: number;
  pageSize: number;
};

function positiveInteger(value: string | null, fallback: number, maximum: number) {
  if (value === null) return fallback;
  if (!/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= maximum ? parsed : null;
}

export function parseEmployeeQuery(params: URLSearchParams): EmployeeQuery | null {
  const page = positiveInteger(params.get("page"), 1, 1_000_000);
  const pageSize = positiveInteger(params.get("pageSize"), defaultPageSize, maxPageSize);
  const search = params.get("search")?.trim() ?? "";
  const department = params.get("department")?.trim() ?? "";
  const status = params.get("status")?.trim() ?? "";
  if (!page || !pageSize || search.length > 120 || (search.length > 0 && search.length < 2) || department.length > 100 || (status && !["active", "on_leave", "inactive"].includes(status))) return null;
  return { page, pageSize, search: search || undefined, department: department || undefined, status: status as EmployeeQuery["status"] || undefined };
}

export function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}
