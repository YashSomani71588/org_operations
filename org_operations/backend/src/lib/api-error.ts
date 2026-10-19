import type { Response } from "express";
import type { z } from "zod";

const defaultMessages: Record<string, string> = {
  UNAUTHENTICATED: "Sign in is required.",
  TEAM_ACCESS_DENIED: "You do not have access to this department.",
  WORK_ITEM_NOT_FOUND: "Work item not found.",
  MANAGER_REQUIRED: "Manager access is required.",
  EMPLOYEE_REQUIRED: "Employee access is required.",
  OWNER_REQUIRED: "This action is limited to the assigned employee.",
  INVALID_WORKFLOW_TRANSITION: "That workflow transition is not allowed.",
  STALE_DATA: "This work item changed. Refresh it and try again.",
  INTERNAL_SERVER_ERROR: "An unexpected server error occurred.",
};

export function apiError(
  response: Response,
  status: number,
  code: string,
  message = defaultMessages[code] ?? "The request could not be completed.",
  extra?: Record<string, unknown>
) {
  return response.status(status).json({ error: code, message, ...extra });
}

export function validationError(response: Response, error: z.ZodError) {
  return apiError(response, 400, "VALIDATION_ERROR", "Check the submitted fields and try again.", {
    details: error.flatten().fieldErrors,
  });
}
