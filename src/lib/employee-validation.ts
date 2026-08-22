import { z } from "zod";

export const employeeStatuses = ["active", "on_leave", "inactive"] as const;

const optionalText = z.string().trim().max(160).optional().nullable().transform((value) => value || null);

export const employeeInputSchema = z.object({
  employeeNumber: z.string().trim().min(2).max(24),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.email().max(255).transform((value) => value.toLowerCase()),
  phone: optionalText,
  jobTitle: z.string().trim().min(2).max(120),
  department: z.string().trim().min(2).max(100),
  location: z.string().trim().min(2).max(120),
  status: z.enum(employeeStatuses),
  startDate: z.iso.date(),
  manager: optionalText,
});

export const employeePatchSchema = employeeInputSchema.partial().refine((value) => Object.keys(value).length > 0, "At least one field is required");
export type EmployeeInput = z.infer<typeof employeeInputSchema>;
