import { z } from "zod";
import { WORK_ITEM_STATUSES } from "./workflow";

export const workItemStatuses = WORK_ITEM_STATUSES;

export const workItemPriorities = ["Low", "Medium", "High", "Critical"] as const;

export const listWorkItemsSchema = z.object({
  teamId: z.string().uuid(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(200).optional(),
  status: z.enum(workItemStatuses).optional(),
  priority: z.enum(workItemPriorities).optional(),
  view: z.enum(["all", "mine", "my-work", "unassigned", "awaiting-approval", "overdue"]).default("all"),
});

export const createWorkItemSchema = z.object({
  teamId: z.string().uuid(),
  title: z.string().trim().min(5).max(255),
  description: z.string().trim().min(1).max(10_000),
  priority: z.enum(workItemPriorities).default("Medium"),
  dueAt: z.string().datetime(),
  approvalRequired: z.boolean().default(false),
});

export const updateWorkItemSchema = z.object({
  expectedVersion: z.number().int().positive(),
  title: z.string().trim().min(5).max(255).optional(),
  description: z.string().trim().max(10_000).nullable().optional(),
  category: z.string().trim().min(2).max(120).optional(),
  priority: z.enum(workItemPriorities).optional(),
  dueAt: z.string().datetime().nullable().optional(),
  approvalRequired: z.boolean().optional(),
  status: z.enum(["In Progress", "Closed"]).optional(),
}).refine(
  (value) => Object.keys(value).some((key) => key !== "expectedVersion"),
  "At least one field must be changed"
);

export const expectedVersionSchema = z.object({
  expectedVersion: z.number().int().positive(),
});

export const resolutionSchema = expectedVersionSchema.extend({
  resolutionProposal: z.string().trim().min(5).max(10_000),
});

export const decisionSchema = expectedVersionSchema.extend({
  reason: z.string().trim().min(3).max(2_000).optional(),
});

export const commentSchema = z.object({
  body: z.string().trim().min(1).max(5_000),
});

export const assignWorkItemSchema = expectedVersionSchema.extend({
  assigneeId: z.string().uuid(),
});
