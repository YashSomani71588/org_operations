export const WORK_ITEM_STATUSES = [
  "Open",
  "In Progress",
  "Awaiting Approval",
  "Changes Requested",
  "Approved",
  "Closed",
  "Resolved",
] as const;

export type WorkItemStatus = (typeof WORK_ITEM_STATUSES)[number];
export type WorkflowActor = "ADMIN" | "MANAGER" | "EMPLOYEE";

export const TERMINAL_STATUSES = new Set<WorkItemStatus>(["Closed", "Resolved"]);

const patchTransitions: Partial<Record<WorkItemStatus, readonly WorkItemStatus[]>> = {
  Open: ["In Progress"],
  "Changes Requested": ["In Progress"],
  Approved: ["Closed"],
};

export function canPatchStatus(
  from: WorkItemStatus,
  to: WorkItemStatus,
  options: { approvalRequired: boolean; hasAssignee: boolean }
) {
  if (TERMINAL_STATUSES.has(from) || from === to) return false;
  if (!patchTransitions[from]?.includes(to)) return false;
  if (to === "In Progress" && !options.hasAssignee) return false;
  if (to === "Closed" && (!options.approvalRequired || from !== "Approved")) return false;
  return true;
}

export function canRequestApproval(from: WorkItemStatus, approvalRequired: boolean) {
  return approvalRequired && (from === "In Progress" || from === "Changes Requested");
}

export function canResolve(from: WorkItemStatus, approvalRequired: boolean) {
  return !approvalRequired && from === "In Progress";
}

export function canDecideApproval(from: WorkItemStatus, hasProposal: boolean) {
  return from === "Awaiting Approval" && hasProposal;
}
