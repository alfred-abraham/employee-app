import { z } from "zod";

export const timeAwayInputSchema = z.object({
  employeeId: z.uuid(),
  type: z.enum(["vacation", "sick", "personal", "other"]),
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  note: z.string().trim().max(500).optional().nullable(),
}).refine((input) => input.endDate >= input.startDate, { message: "End date must be on or after start date." });
