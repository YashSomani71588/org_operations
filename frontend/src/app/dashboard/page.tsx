"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser, logout, type AuthUser } from "@/lib/auth";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  CircleCheckBig,
  FileText,
  LayoutDashboard,
  ListTodo,
  MessageCircle,
  LogOut,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import "./dashboard.css";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type Status = "Open" | "In Progress" | "Awaiting Approval" | "Changes Requested" | "Approved" | "Closed" | "Resolved";
type Priority = "Low" | "Medium" | "High" | "Critical";
type TeamRole = "VIEWER" | "MEMBER" | "MANAGER";
type Team = { id: string; name: string; slug: string; role: TeamRole; isGlobalAdmin?: boolean };
type DepartmentMember = { id: string; fullName: string; email: string; role: "MEMBER" };
type PersonSummary = { id: string; fullName: string; email: string };
type ActiveSection = "dashboard" | "work-items" | "approvals" | "users";
type ManagedUser = {
  membershipId: string;
  userId: string;
  fullName: string;
  email: string;
  role: TeamRole;
  isActive: boolean;
  lastSeenAt: string | null;
  presence: "ONLINE" | "OFFLINE";
  departmentId: string;
  departmentName: string;
};
type DepartmentOverview = {
  department: { id: string; name: string; slug: string };
  managers: PersonSummary[];
  ticketSummary: { total: number; pendingApprovals: number };
};
type WorkItemComment = {
  id: number;
  authorId: string;
  body: string;
  createdAt: string;
  author: { id: string; fullName: string };
};
type WorkItemActivity = {
  id: number;
  action: string;
  details: unknown;
  createdAt: string;
  actor: { id: string; fullName: string } | null;
};
type WorkItemDetails = { comments: WorkItemComment[]; activity: WorkItemActivity[] };

type Item = {
  dbId: number;
  id: string;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  team: string;
  assignee: string;
  assigneeId: string | null;
  creator: PersonSummary | null;
  approvalRequestedBy: PersonSummary | null;
  approvalRequestedAt: string | null;
  createdAt: string;
  resolutionProposal: string | null;
  due: string;
  dueAt: string | null;
  updated: string;
  version: number;
  approvalRequired: boolean;
  commentCount: number;
};

type ApiWorkItem = {
  id: number;
  title: string;
  description: string | null;
  status: Status;
  priority: Priority;
  team: string;
  assignee_name: string | null;
  assignee_id: string | null;
  creator: PersonSummary | null;
  approval_requested_by: PersonSummary | null;
  approval_requested_at: string | null;
  created_at: string;
  resolution_proposal: string | null;
  due_at: string | null;
  updated_at: string;
  version: number;
  approval_required: boolean;
  comment_count: number;
};

const filterStatuses: Status[] = ["Open", "In Progress", "Awaiting Approval", "Changes Requested", "Approved", "Closed", "Resolved"];
const editableStatuses: Status[] = ["Open", "In Progress", "Closed"];
const priorities: Priority[] = ["Low", "Medium", "High", "Critical"];
const PAGE_SIZE = 20;

const activityLabels: Record<string, string> = {
  CREATED: "Created this work item",
  UPDATED: "Updated the work item",
  CLAIMED: "Claimed the work item",
  ASSIGNED: "Assigned the work item",
  COMMENTED: "Added a comment",
  COMMENT_DELETED: "Deleted a comment",
  APPROVAL_REQUESTED: "Submitted the work item for approval",
  APPROVED: "Approved the work item",
  CHANGES_REQUESTED: "Requested changes",
  RESOLVED: "Resolved the work item",
};

function formatActivityDetails(details: unknown) {
  if (!details || typeof details !== "object") return "";
  const entries = Object.entries(details as Record<string, unknown>)
    .filter(([key]) => key !== "commentId")
    .map(([key, value]) => `${key.replaceAll("_", " ")}: ${String(value)}`);
  return entries.join(" · ");
}

export default function DashboardPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [activeSection, setActiveSection] = useState<ActiveSection>("dashboard");
  const [departmentOverview, setDepartmentOverview] = useState<DepartmentOverview | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  // Filters & Search
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [priorityFilter, setPriorityFilter] = useState("All priorities");

  // Department user management
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [newUserOpen, setNewUserOpen] = useState(false);
  const [newUserTeamId, setNewUserTeamId] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState<TeamRole>("MEMBER");

  // Modals state
  const [selected, setSelected] = useState<Item | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("Medium");
  const [dueDate, setDueDate] = useState("");
  const [approvalRequired, setApprovalRequired] = useState(false);
  const [saving, setSaving] = useState(false);
  const [assigningItem, setAssigningItem] = useState<Item | null>(null);
  const [departmentMembers, setDepartmentMembers] = useState<DepartmentMember[]>([]);
  const [assigneeId, setAssigneeId] = useState("");
  const [workItemDetails, setWorkItemDetails] = useState<WorkItemDetails | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [commentBody, setCommentBody] = useState("");
  const [resolutionProposal, setResolutionProposal] = useState("");
  const [statusDraft, setStatusDraft] = useState<Status>("Open");
  const [dueDateDraft, setDueDateDraft] = useState("");

  const selectedTeam = teams.find((team) => team.id === selectedTeamId);
  const isGlobalAdmin = currentUser?.role === "ADMIN";
  const canManageTeam = isGlobalAdmin || selectedTeam?.role === "MANAGER";
  const canClaimWork = !isGlobalAdmin && selectedTeam?.role === "MEMBER";
  const accessRole = isGlobalAdmin ? "GLOBAL ADMIN" : selectedTeam?.role ?? "VIEWER";
  const canEditSelected = Boolean(
    selected &&
    activeSection !== "approvals" &&
    !["Awaiting Approval", "Closed", "Resolved"].includes(selected.status) &&
    (canManageTeam || selected.assigneeId === currentUser?.id)
  );

  // 1. Load User Session and Work Items
  async function reload(teamId = selectedTeamId, page = currentPage) {
    if (!teamId) return;
    setLoading(true);
    setError("");
    try {
      // Check auth
      const userRes = await getCurrentUser().catch(() => null);
      if (userRes?.user) {
        setCurrentUser(userRes.user);
      }

      const params = new URLSearchParams({
        teamId,
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (query.trim()) params.set("search", query.trim());
      if (activeSection === "approvals") {
        params.set("view", "awaiting-approval");
      } else {
        if (activeSection === "work-items") params.set("view", "my-work");
        if (statusFilter !== "All statuses") params.set("status", statusFilter);
        if (priorityFilter !== "All priorities") params.set("priority", priorityFilter);
      }
      const res = await fetch(`${API_BASE}/api/work-items?${params}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Backend error (${res.status})`);
      const data = (await res.json()) as {
        items: ApiWorkItem[];
        pagination: { page: number; pageSize: number; total: number; totalPages: number };
      };

      const mapped: Item[] = data.items.map((row) => ({
        dbId: row.id,
        id: `OPS-${String(1000 + row.id).padStart(4, "0")}`,
        title: row.title,
        description: row.description || "",
        status: row.status as Status,
        priority: row.priority as Priority,
        team: row.team || "Operations",
        assignee: row.assignee_name || "Unassigned",
        assigneeId: row.assignee_id,
        creator: row.creator,
        approvalRequestedBy: row.approval_requested_by,
        approvalRequestedAt: row.approval_requested_at,
        createdAt: new Date(row.created_at).toLocaleDateString(),
        resolutionProposal: row.resolution_proposal,
        due: row.due_at ? new Date(row.due_at).toLocaleDateString() : "Not set",
        dueAt: row.due_at,
        updated: new Date(row.updated_at).toLocaleString(),
        version: row.version,
        approvalRequired: row.approval_required,
        commentCount: row.comment_count,
      }));

      setItems(mapped);
      setTotalItems(data.pagination.total);
      setTotalPages(Math.max(data.pagination.totalPages, 1));
      setCurrentPage(data.pagination.page);

      const activeUser = userRes?.user ?? currentUser;
      if (activeUser?.role === "ADMIN") {
        const overviewResponse = await fetch(`${API_BASE}/api/teams/${teamId}/overview`, {
          credentials: "include",
        });
        if (!overviewResponse.ok) throw new Error("Could not load department overview");
        setDepartmentOverview((await overviewResponse.json()) as DepartmentOverview);
      } else {
        setDepartmentOverview(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not connect to backend");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(async () => {
      const [userRes, teamsRes] = await Promise.all([
        getCurrentUser().catch(() => null),
        fetch(`${API_BASE}/api/teams`, { credentials: "include" }),
      ]);
      if (!userRes?.user || !teamsRes.ok) {
        router.replace("/");
        return;
      }
      const teamData = (await teamsRes.json()) as { teams: Team[] };
      setCurrentUser(userRes.user);
      setTeams(teamData.teams);
      const initialTeamId = teamData.teams[0]?.id ?? "";
      setSelectedTeamId(initialTeamId);
      await reload(initialTeamId);
    }, 0);
    return () => window.clearTimeout(timeoutId);
    // Bootstrap once; later query changes are handled by the debounced effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const heartbeat = window.setInterval(() => {
      void getCurrentUser().catch(() => null);
    }, 45_000);
    return () => window.clearInterval(heartbeat);
  }, [currentUser]);

  useEffect(() => {
    if (!selectedTeamId) return;
    const timeoutId = window.setTimeout(() => {
      if (activeSection === "users") void loadManagedUsers(selectedTeamId);
      else void reload(selectedTeamId);
    }, 250);
    return () => window.clearTimeout(timeoutId);
    // reload intentionally reads the latest filter values represented by these dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTeamId, query, statusFilter, priorityFilter, currentPage, activeSection]);

  useEffect(() => {
    if (activeSection !== "users" || !selectedTeamId) return;
    const presenceRefresh = window.setInterval(() => void loadManagedUsers(selectedTeamId), 30_000);
    return () => window.clearInterval(presenceRefresh);
    // Presence refresh intentionally follows the selected department and current access scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection, selectedTeamId, currentUser?.role, teams.length]);

  useEffect(() => {
    if (!notice) return;
    const timeoutId = window.setTimeout(() => setNotice(""), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [notice]);

  // Filter items
  const filtered = useMemo(() => {
    return items;
  }, [items]);

  const managedUserGroups = useMemo(() => {
    const departmentOrder = teams.map((team) => team.id);
    return departmentOrder
      .map((departmentId) => ({
        departmentId,
        departmentName: teams.find((team) => team.id === departmentId)?.name ?? "Department",
        users: managedUsers.filter((user) => user.departmentId === departmentId),
      }))
      .filter((group) => group.users.length > 0 || !isGlobalAdmin);
  }, [isGlobalAdmin, managedUsers, teams]);

  // Metrics counts
  const openCount = items.filter((i) => !["Approved", "Closed", "Resolved"].includes(i.status)).length;
  const reviewCount = items.filter((i) => i.status === "Awaiting Approval").length;
  const closedCount = items.filter((i) => ["Approved", "Closed", "Resolved"].includes(i.status)).length;

  async function loadWorkItemDetails(item: Item) {
    setDetailLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/work-items/${item.dbId}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Could not load work item details");
      const data = (await response.json()) as WorkItemDetails;
      setWorkItemDetails({ comments: data.comments, activity: data.activity });
    } catch (detailError) {
      setNotice(detailError instanceof Error ? detailError.message : "Could not load work item details");
    } finally {
      setDetailLoading(false);
    }
  }

  function openWorkItem(item: Item) {
    setSelected(item);
    setStatusDraft(item.status);
    setDueDateDraft(item.dueAt?.slice(0, 10) ?? "");
    setResolutionProposal(item.resolutionProposal ?? "");
    setCommentBody("");
    setWorkItemDetails(null);
    void loadWorkItemDetails(item);
  }

  async function submitWorkItem() {
    if (!selected) return;
    setSaving(true);
    try {
      const needsApprovalSubmission =
        selected.approvalRequired && ["In Progress", "Changes Requested"].includes(selected.status);
      if (needsApprovalSubmission && resolutionProposal.trim().length < 5) {
        setNotice("Add completion notes before submitting for approval.");
        return;
      }

      const endpoint = needsApprovalSubmission ? "request-approval" : null;
      const nextStatus = selected.status === "Approved" ? "Closed" : statusDraft;
      const res = await fetch(
        endpoint
          ? `${API_BASE}/api/work-items/${selected.dbId}/${endpoint}`
          : `${API_BASE}/api/work-items/${selected.dbId}`,
        {
          method: endpoint ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(
            endpoint
              ? { expectedVersion: selected.version, resolutionProposal: resolutionProposal.trim() }
              : { status: nextStatus, expectedVersion: selected.version }
          ),
        }
      );

      const data = await res.json();

      if (res.status === 409) {
        // Concurrency conflict occurred!
        setNotice(data.message || "This work item changed while you were viewing it. Please try again.");
        await reload();
        setSelected(null);
        return;
      }

      if (!res.ok) throw new Error(data.error || "Update failed");

      setNotice(
        needsApprovalSubmission
          ? "Submitted successfully. Waiting for approval."
          : nextStatus === "Closed"
            ? "Work item closed successfully."
            : "Work item submitted successfully."
      );
      setSelected(null);
      await reload();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Status update failed");
    } finally {
      setSaving(false);
    }
  }

  // 3. Claim Ticket (Atomic CAS Race Prevention)
  async function claimItem(id: number) {
    try {
      const res = await fetch(`${API_BASE}/api/work-items/${id}/claim`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (res.status === 409) {
        setNotice(`⚠️ ALREADY CLAIMED: ${data.message}`);
      } else if (res.ok) {
        setNotice("Work item claimed successfully.");
      }
      await reload();
    } catch {
      setNotice("Failed to claim work item.");
    }
  }

  // 4. Create New Work Item
  async function addItem(e: FormEvent) {
    e.preventDefault();
    if (title.trim().length < 5) {
      setNotice("Title must be at least 5 characters.");
      return;
    }
    if (!description.trim()) {
      setNotice("Description is required.");
      return;
    }
    if (!selectedTeamId) {
      setNotice("Department is required.");
      return;
    }
    if (!dueDate) {
      setNotice("Due date is required.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/work-items`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        credentials: "include",
        body: JSON.stringify({
          teamId: selectedTeamId,
          title: title.trim(),
          description: description.trim(),
          priority,
          dueAt: new Date(`${dueDate}T12:00:00.000Z`).toISOString(),
          approvalRequired,
        }),
      });
      if (!res.ok) throw new Error("Could not create item");
      setTitle("");
      setDescription("");
      setDueDate("");
      setNewOpen(false);
      setNotice("Work item created successfully.");
      setCurrentPage(1);
      await reload(selectedTeamId, 1);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not create work item");
    } finally {
      setSaving(false);
    }
  }

  // 5. Sign Out
  async function handleLogout() {
    await logout();
    router.replace("/");
    router.refresh();
  }

  async function openAssignment(item: Item) {
    try {
      const response = await fetch(`${API_BASE}/api/teams/${selectedTeamId}/members`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Could not load department employees");
      const data = (await response.json()) as { members: DepartmentMember[] };
      setDepartmentMembers(data.members);
      setAssigneeId(data.members[0]?.id ?? "");
      setAssigningItem(item);
    } catch (assignmentError) {
      setNotice(assignmentError instanceof Error ? assignmentError.message : "Could not load employees");
    }
  }

  async function loadManagedUsers(teamId = selectedTeamId) {
    if (!teamId || teams.length === 0) return;
    setUsersLoading(true);
    try {
      const targetTeams = isGlobalAdmin ? teams : teams.filter((team) => team.id === teamId);
      const results = await Promise.all(targetTeams.map(async (team) => {
        const response = await fetch(`${API_BASE}/api/teams/${team.id}/users`, { credentials: "include" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load department users");
        return (data.users as Omit<ManagedUser, "departmentId" | "departmentName">[]).map((user) => ({
          ...user,
          departmentId: team.id,
          departmentName: team.name,
        }));
      }));
      setManagedUsers(results.flat());
    } catch (usersError) {
      setNotice(usersError instanceof Error ? usersError.message : "Could not load department users");
    } finally {
      setUsersLoading(false);
    }
  }

  function openNewUser() {
    setNewUserTeamId(selectedTeamId);
    setNewUserRole("MEMBER");
    setNewUserOpen(true);
  }

  async function addManagedUser(event: FormEvent) {
    event.preventDefault();
    const targetTeamId = isGlobalAdmin ? newUserTeamId : selectedTeamId;
    if (!targetTeamId) return;
    setSaving(true);
    try {
      const response = await fetch(`${API_BASE}/api/teams/${targetTeamId}/users`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: newUserName.trim(),
          email: newUserEmail.trim(),
          password: newUserPassword,
          role: newUserRole,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not add employee");
      setNewUserName("");
      setNewUserEmail("");
      setNewUserPassword("");
      setNewUserOpen(false);
      if (targetTeamId !== selectedTeamId) setSelectedTeamId(targetTeamId);
      else await loadManagedUsers(targetTeamId);
      setNotice("Employee access added successfully.");
    } catch (userError) {
      setNotice(userError instanceof Error ? userError.message : "Could not add employee");
    } finally {
      setSaving(false);
    }
  }

  async function revokeManagedUser(user: ManagedUser) {
    setSaving(true);
    try {
      const response = await fetch(`${API_BASE}/api/teams/${selectedTeamId}/users/${user.userId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Could not revoke employee access");
      }
      setNotice(`${user.fullName}'s department access was revoked.`);
      await loadManagedUsers();
    } catch (userError) {
      setNotice(userError instanceof Error ? userError.message : "Could not revoke employee access");
    } finally {
      setSaving(false);
    }
  }

  async function saveDueDate() {
    if (!selected || !dueDateDraft || !canManageTeam) return;
    setSaving(true);
    try {
      const response = await fetch(`${API_BASE}/api/work-items/${selected.dbId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedVersion: selected.version,
          dueAt: new Date(`${dueDateDraft}T12:00:00.000Z`).toISOString(),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update due date");
      setSelected(null);
      setNotice("Due date updated successfully.");
      await reload();
    } catch (dueDateError) {
      setNotice(dueDateError instanceof Error ? dueDateError.message : "Could not update due date");
      await reload();
    } finally {
      setSaving(false);
    }
  }

  async function addComment(event: FormEvent) {
    event.preventDefault();
    if (!selected || !commentBody.trim()) return;
    setSaving(true);
    try {
      const response = await fetch(`${API_BASE}/api/work-items/${selected.dbId}/comments`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: commentBody.trim() }),
      });
      if (!response.ok) throw new Error("Could not add comment");
      setCommentBody("");
      setNotice("Comment added successfully.");
      await loadWorkItemDetails(selected);
    } catch (commentError) {
      setNotice(commentError instanceof Error ? commentError.message : "Could not add comment");
    } finally {
      setSaving(false);
    }
  }

  async function deleteComment(commentId: number) {
    if (!selected) return;
    setSaving(true);
    try {
      const response = await fetch(`${API_BASE}/api/work-items/${selected.dbId}/comments/${commentId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Could not delete comment");
      setNotice("Comment deleted successfully.");
      await loadWorkItemDetails(selected);
    } catch (commentError) {
      setNotice(commentError instanceof Error ? commentError.message : "Could not delete comment");
    } finally {
      setSaving(false);
    }
  }

  async function assignItem(event: FormEvent) {
    event.preventDefault();
    if (!assigningItem || !assigneeId) return;
    setSaving(true);
    try {
      const response = await fetch(`${API_BASE}/api/work-items/${assigningItem.dbId}/assign`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assigneeId,
          expectedVersion: assigningItem.version,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error || "Assignment failed");
      setAssigningItem(null);
      setNotice("Work item assigned to the selected department employee.");
      await reload();
    } catch (assignmentError) {
      setNotice(assignmentError instanceof Error ? assignmentError.message : "Assignment failed");
      await reload();
    } finally {
      setSaving(false);
    }
  }

  async function decideApproval(item: Item, approve: boolean) {
    setSaving(true);
    try {
      const response = await fetch(
        `${API_BASE}/api/work-items/${item.dbId}/${approve ? "approve" : "request-changes"}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedVersion: item.version,
            ...(approve ? {} : { reason: "Changes requested by the department manager." }),
          }),
        }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error || "Approval decision failed");
      setNotice(approve ? "Work item approved successfully." : "Work item returned for changes.");
      await reload();
    } catch (approvalError) {
      setNotice(approvalError instanceof Error ? approvalError.message : "Approval decision failed");
      await reload();
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!isProfileOpen) return;

    function closeProfileMenu(event: MouseEvent) {
      if (!profileMenuRef.current?.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    }

    function closeProfileMenuOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsProfileOpen(false);
    }

    document.addEventListener("mousedown", closeProfileMenu);
    document.addEventListener("keydown", closeProfileMenuOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeProfileMenu);
      document.removeEventListener("keydown", closeProfileMenuOnEscape);
    };
  }, [isProfileOpen]);

  return (
    <div className="dashboard-root">
      {/* Sidebar */}
      <aside className="sidebar">
        <a
          className="brand newtonite-link"
          href="https://www.newtonite.in/"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Visit Newtonite's official website"
        >
          <div className="brand-mark">
            N°
          </div>
          <div>
            <strong className="brand-name">NEWTONITE</strong>
            <span className="brand-subtitle">OPERATIONS</span>
          </div>
        </a>

        <div className="workspace-label">WORKSPACE</div>
        <nav className="nav-list">
          <button
            className={`nav-button ${activeSection === "dashboard" ? "active" : ""}`}
            onClick={() => { setCurrentPage(1); setActiveSection("dashboard"); }}
          >
            <LayoutDashboard size={18} /> Dashboard
          </button>
          <button
            className={`nav-button ${activeSection === "work-items" ? "active" : ""}`}
            onClick={() => { setCurrentPage(1); setStatusFilter("All statuses"); setActiveSection("work-items"); }}
          >
            <ListTodo size={18} /> My Work Items
          </button>
          {(isGlobalAdmin || selectedTeam?.role === "MANAGER" || selectedTeam?.role === "MEMBER") && (
            <button
              className={`nav-button ${activeSection === "approvals" ? "active" : ""}`}
              onClick={() => { setCurrentPage(1); setActiveSection("approvals"); }}
            >
              <ShieldCheck size={18} /> Approvals
            </button>
          )}
          {canManageTeam && (
            <button
              className={`nav-button ${activeSection === "users" ? "active" : ""}`}
              onClick={() => { setCurrentPage(1); setActiveSection("users"); }}
            >
              <Users size={18} /> User Management
            </button>
          )}
        </nav>

        <div className="sidebar-bottom">
          <div className="profile-menu-container" ref={profileMenuRef}>
            {isProfileOpen && (
              <div className="profile-popover" role="dialog" aria-label="Account details">
                <div className="profile-popover-header">
                  <div className="avatar profile-popover-avatar">
                    {currentUser?.fullName?.slice(0, 2).toUpperCase() || "OP"}
                  </div>
                  <div>
                    <strong>{currentUser?.fullName || "Operator"}</strong>
                    <span>{currentUser?.email || "No email available"}</span>
                  </div>
                </div>
                <div className="profile-detail-row">
                  <span>Access</span>
                  <strong>{accessRole}</strong>
                </div>
                <button className="profile-signout" type="button" onClick={() => void handleLogout()}>
                  <LogOut size={16} /> Sign out
                </button>
              </div>
            )}

            <button
              type="button"
              className="profile profile-trigger"
              aria-expanded={isProfileOpen}
              aria-haspopup="dialog"
              onClick={() => setIsProfileOpen((open) => !open)}
            >
              <div className="avatar">
                {currentUser?.fullName?.slice(0, 2).toUpperCase() || "OP"}
              </div>
              <div className="profile-summary">
                <strong>{currentUser?.fullName || "Operator"}</strong>
                <span>{accessRole}</span>
              </div>
              <span className="profile-menu-indicator" aria-hidden="true">•••</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span> <strong>Operational Command Center</strong>
          </div>
          <ThemeToggle />
        </header>

        <section className="page-content">
          <div className="welcome-row">
            <div>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#2563eb", letterSpacing: "1px" }}>
                OPS WORKSPACE
              </span>
              <h1>Welcome, {currentUser?.fullName || "Operator"} ✦</h1>
              <p>Track ownership, coordinate team activity, and resolve critical workflows.</p>
            </div>
            {canManageTeam && activeSection !== "users" && (
              <button className="primary-button" onClick={() => setNewOpen(true)}>
                <Plus size={17} /> Create work item
              </button>
            )}
          </div>

          {error && (
            <div style={{ padding: "14px 18px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "10px", color: "#b91c1c", marginBottom: "20px", display: "flex", alignItems: "center", gap: "10px" }}>
              <AlertCircle size={18} />
              <span>{error}. Ensure your backend server is running on port 4000.</span>
            </div>
          )}

          {isGlobalAdmin && departmentOverview && activeSection !== "users" && (
            <section className="department-overview" aria-label={`${departmentOverview.department.name} department overview`}>
              <div>
                <span className="overview-label">SELECTED DEPARTMENT</span>
                <h2>{departmentOverview.department.name}</h2>
                <p>
                  {departmentOverview.ticketSummary.total} tickets · {departmentOverview.ticketSummary.pendingApprovals} pending approvals
                </p>
              </div>
              <div className="manager-list">
                <span className="overview-label">DEPARTMENT MANAGERS</span>
                {departmentOverview.managers.map((manager) => (
                  <div className="manager-chip" key={manager.id}>
                    <strong>{manager.fullName}</strong>
                    <span>{manager.email}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Metric Cards */}
          {activeSection === "dashboard" && <div className="metric-grid">
            <div className="metric-card">
              <div className="metric-top">
                <span>Total Active Items</span>
                <FileText size={18} color="#2563eb" />
              </div>
              <div className="metric-value">{openCount}</div>
              <div className="metric-note">Across all operations teams</div>
            </div>

            <div className="metric-card">
              <div className="metric-top">
                <span>Pending Approvals</span>
                <ShieldCheck size={18} color="#7e22ce" />
              </div>
              <div className="metric-value">{reviewCount}</div>
              <div className="metric-note">Awaiting managerial sign-off</div>
            </div>

            <div className="metric-card">
              <div className="metric-top">
                <span>Completed / Approved</span>
                <CircleCheckBig size={18} color="#16a34a" />
              </div>
              <div className="metric-value">{closedCount}</div>
              <div className="metric-note">Approved or closed work</div>
            </div>

          </div>}

          {activeSection === "users" ? (
            <section className="panel user-management-panel">
              <div className="panel-heading">
                <div>
                  <h2>User Management</h2>
                  <p>Add or revoke access for the selected department.</p>
                </div>
                <button type="button" className="primary-button" onClick={openNewUser}>
                  <UserPlus size={16} /> Add employee
                </button>
              </div>
              <div className="user-management-toolbar">
                <strong>{isGlobalAdmin ? "All departments" : selectedTeam?.name}</strong>
                <span>{managedUsers.length} users across {managedUserGroups.length} department{managedUserGroups.length === 1 ? "" : "s"}</span>
              </div>
              {usersLoading ? (
                <p className="table-message">Loading department users...</p>
              ) : managedUserGroups.length === 0 ? (
                <p className="table-message">No users currently have department access.</p>
              ) : (
                <div className="user-department-groups">
                  {managedUserGroups.map((group) => (
                    <section className="user-department-group" key={group.departmentId}>
                      <div className="department-group-heading">
                        <div>
                          <span>DEPARTMENT</span>
                          <h3>{group.departmentName}</h3>
                        </div>
                        <strong>{group.users.length} users</strong>
                      </div>
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>EMPLOYEE</th>
                              <th>EMAIL</th>
                              <th>ROLE</th>
                              <th>ACCOUNT</th>
                              <th>PRESENCE</th>
                              <th style={{ textAlign: "right" }}>ACCESS</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.users.map((user) => (
                              <tr key={user.membershipId}>
                                <td><strong className="user-name-cell">{user.fullName}</strong></td>
                                <td>{user.email}</td>
                                <td><span className={`role-badge role-${user.role.toLowerCase()}`}>{user.role}</span></td>
                                <td><span className={user.isActive ? "active-label" : "inactive-label"}>{user.isActive ? "Active" : "Inactive"}</span></td>
                                <td>
                                  <span className={`presence-label presence-${user.presence.toLowerCase()}`}>
                                    <i aria-hidden="true" /> {user.presence === "ONLINE" ? "Online" : "Offline"}
                                  </span>
                                </td>
                                <td style={{ textAlign: "right" }}>
                                  <button
                                    type="button"
                                    className="revoke-button"
                                    disabled={saving || user.userId === currentUser?.id || (!isGlobalAdmin && user.role === "MANAGER")}
                                    onClick={() => void revokeManagedUser(user)}
                                  >
                                    <UserMinus size={14} /> Revoke
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </section>
          ) : (
          /* Work queue */
          <div className="content-grid">
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>{activeSection === "approvals" ? "Pending Approvals" : activeSection === "work-items" ? "My Work Items" : "Team Work Queue"}</h2>
                  <p>
                    {activeSection === "approvals"
                      ? "Review approval requests and ticket ownership details."
                      : activeSection === "work-items"
                        ? "Your created, assigned, claimed, approval-pending, and currently available work."
                        : "Search, filter, claim, and update records in real-time."}
                  </p>
                </div>
                <button
                  className="secondary-button"
                  style={{ padding: "6px 12px", fontSize: "11px" }}
                  onClick={() => {
                    setQuery("");
                    setStatusFilter("All statuses");
                    setPriorityFilter("All priorities");
                    setCurrentPage(1);
                  }}
                >
                  Reset filters
                </button>
              </div>

              {/* Filters */}
              <div className="filters">
                <label className="search-box">
                  <Search size={16} />
                  <input
                    value={query}
                    onChange={(e) => { setCurrentPage(1); setQuery(e.target.value); }}
                    placeholder="Search by title, team, or ID..."
                  />
                </label>

                {activeSection !== "approvals" && (
                  <>
                    <select className="plain-filter" value={statusFilter} onChange={(e) => { setCurrentPage(1); setStatusFilter(e.target.value); }}>
                      <option>All statuses</option>
                      {filterStatuses.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>

                    <select className="plain-filter" value={priorityFilter} onChange={(e) => { setCurrentPage(1); setPriorityFilter(e.target.value); }}>
                      <option>All priorities</option>
                      {priorities.map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </select>
                  </>
                )}

                <label className="department-filter">
                  <span>Department</span>
                  <select className="plain-filter" value={selectedTeamId} onChange={(e) => { setCurrentPage(1); setSelectedTeamId(e.target.value); }}>
                    {teams.map((teamOption) => (
                      <option key={teamOption.id} value={teamOption.id}>
                        {teamOption.name}{teamOption.isGlobalAdmin ? "" : ` (${teamOption.role.toLowerCase()})`}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {activeSection === "work-items" ? (
                <div className="my-work-grid">
                  {loading ? (
                    <p className="my-work-empty">Loading your work items...</p>
                  ) : filtered.length === 0 ? (
                    <p className="my-work-empty">No personal or available work items match these filters.</p>
                  ) : filtered.map((item) => (
                    <article className="work-item-card" key={item.dbId}>
                      <div className="work-card-topline">
                        <span>{item.id} · {item.team}</span>
                        <span className={`priority-badge priority-${item.priority.toLowerCase()}`}>{item.priority}</span>
                      </div>
                      <button type="button" className="work-card-title" onClick={() => openWorkItem(item)}>
                        {item.title}
                      </button>
                      <p className="work-card-description">{item.description}</p>
                      <div className="work-card-badges">
                        <span className={`status-badge status-${item.status.toLowerCase().replaceAll(" ", "-")}`}>{item.status}</span>
                        <span className="work-card-info"><CalendarDays size={14} /> Due {item.due}</span>
                        <span className="work-card-info"><MessageCircle size={14} /> {item.commentCount} comment{item.commentCount === 1 ? "" : "s"}</span>
                      </div>
                      <div className="work-card-ownership">
                        <div>
                          <span>{item.assigneeId ? "Assigned to" : "Available to claim"}</span>
                          <strong>{item.assignee}</strong>
                        </div>
                        <div>
                          <span>Last activity</span>
                          <strong>{item.updated}</strong>
                        </div>
                      </div>
                      <div className="work-card-actions">
                        {item.assigneeId === null && canClaimWork && (
                          <button type="button" className="claim-button" onClick={() => void claimItem(item.dbId)}>Claim work</button>
                        )}
                        {item.assigneeId === null && canManageTeam && (
                          <button type="button" className="secondary-button" onClick={() => void openAssignment(item)}>Assign employee</button>
                        )}
                        <button type="button" className="secondary-button" onClick={() => openWorkItem(item)}>View details</button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
              /* Dashboard and approvals tables */
              <div className="table-wrap">
                <table className={activeSection === "approvals" ? "approvals-table" : undefined}>
                  <thead>
                    {activeSection === "approvals" ? (
                      <tr>
                        <th>TICKET</th>
                        <th>CREATED</th>
                        <th>DEPARTMENT</th>
                        <th>CREATED BY</th>
                        <th>ASSIGNED TO</th>
                        <th>DUE DATE</th>
                        <th>REQUESTED BY</th>
                        <th style={{ textAlign: "right" }}>DECISION</th>
                      </tr>
                    ) : (
                      <tr>
                        <th>WORK ITEM</th>
                        <th>STATUS</th>
                        <th>PRIORITY</th>
                        <th>TEAM</th>
                        <th>ASSIGNEE</th>
                        <th>DUE DATE</th>
                        <th style={{ textAlign: "right" }}>ACTIONS</th>
                      </tr>
                    )}
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={activeSection === "approvals" ? 8 : 7} style={{ textAlign: "center", padding: "30px", color: "#64748b" }}>
                          Loading live work items from PostgreSQL...
                        </td>
                      </tr>
                    ) : filtered.length === 0 ? (
                      <tr>
                        <td colSpan={activeSection === "approvals" ? 8 : 7} style={{ textAlign: "center", padding: "30px", color: "#64748b" }}>
                          {activeSection === "approvals" ? "No approvals are currently pending." : "No work items match the active filters."}
                        </td>
                      </tr>
                    ) : (
                      filtered.map((item) => activeSection === "approvals" ? (
                        <tr key={item.dbId}>
                          <td>
                            <button className="item-link" onClick={() => openWorkItem(item)}>
                              <span>{item.id} · {item.status}</span>
                              <strong>{item.title}</strong>
                              {item.resolutionProposal && <small>{item.resolutionProposal}</small>}
                            </button>
                          </td>
                          <td>{item.createdAt}</td>
                          <td>{item.team}</td>
                          <td>{item.creator?.fullName ?? "Unknown"}</td>
                          <td>{item.assignee}</td>
                          <td>{item.due}</td>
                          <td>
                            {item.approvalRequestedBy?.fullName ?? item.assignee}
                            {item.approvalRequestedAt && <small className="cell-note">{new Date(item.approvalRequestedAt).toLocaleDateString()}</small>}
                          </td>
                          <td style={{ textAlign: "right" }}>
                            {canManageTeam ? (
                              <div className="row-actions approval-actions">
                                <button
                                  type="button"
                                  className="approve-button"
                                  disabled={saving}
                                  onClick={() => void decideApproval(item, true)}
                                >
                                  Yes · Approve
                                </button>
                                <button
                                  type="button"
                                  className="reject-button"
                                  disabled={saving}
                                  onClick={() => void decideApproval(item, false)}
                                >
                                  No · Return
                                </button>
                              </div>
                            ) : (
                              <span className="view-only-label">Awaiting manager decision</span>
                            )}
                          </td>
                        </tr>
                      ) : (
                        <tr key={item.dbId}>
                          <td>
                            <button className="item-link" onClick={() => openWorkItem(item)}>
                              <span>{item.id}</span>
                              <strong>{item.title}</strong>
                            </button>
                          </td>
                          <td>
                            <span className={`status-badge status-${item.status.toLowerCase().replaceAll(" ", "-")}`}>
                              {item.status}
                            </span>
                          </td>
                          <td>
                            <span className={`priority-badge priority-${item.priority.toLowerCase()}`}>
                              {item.priority}
                            </span>
                          </td>
                          <td>{item.team}</td>
                          <td style={{ fontSize: "11px" }}>
                            {item.assignee === "Unassigned" ? (
                              canClaimWork ? (
                                <button
                                  onClick={() => claimItem(item.dbId)}
                                  className="claim-button"
                                >
                                  Claim
                                </button>
                              ) : (
                                <span style={{ color: "#94a3b8" }}>Unassigned</span>
                              )
                            ) : (
                              <span style={{ fontWeight: 600, color: "#334155" }}>{item.assignee}</span>
                            )}
                          </td>
                          <td>{item.due}</td>
                          <td style={{ textAlign: "right" }}>
                            <div className="row-actions">
                              {canManageTeam && item.assigneeId === null && (
                                <button
                                  onClick={() => void openAssignment(item)}
                                  className="secondary-button"
                                >
                                  Assign
                                </button>
                              )}
                              {(canManageTeam || item.assigneeId === currentUser?.id) && (
                                item.status === "Awaiting Approval" && canManageTeam ? (
                                  <button
                                    onClick={() => { setCurrentPage(1); setActiveSection("approvals"); }}
                                    className="secondary-button"
                                  >
                                    Review approval
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => openWorkItem(item)}
                                    className="secondary-button"
                                  >
                                    View / submit
                                  </button>
                                )
                              )}
                              {!canManageTeam && item.assigneeId !== currentUser?.id && (
                                <span className="view-only-label">View only</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              )}
              <div className="table-footer">
                <span>
                  {totalItems === 0
                    ? "Showing 0 items"
                    : `Showing ${(currentPage - 1) * PAGE_SIZE + 1}-${Math.min(currentPage * PAGE_SIZE, totalItems)} of ${totalItems} items`}
                </span>
                <div className="pagination-controls" aria-label="Work item pagination">
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={loading || currentPage === 1}
                    onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  >
                    Previous
                  </button>
                  <span>Page {currentPage} of {totalPages}</span>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={loading || currentPage >= totalPages}
                    onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  >
                    Next
                  </button>
                </div>
              </div>
            </section>
          </div>
          )}
        </section>
      </main>

      {/* Work item details, collaboration, history, and workflow modal */}
      {selected && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setSelected(null)}>
          <div className="modal work-item-modal" role="dialog" aria-modal="true" aria-labelledby="work-item-title">
            <div className="modal-heading">
              <div>
                <span style={{ fontSize: "11px", color: "#2563eb", fontWeight: 700 }}>
                  {selected.id} · {selected.team}
                </span>
                <h2 id="work-item-title">{selected.title}</h2>
              </div>
              <button type="button" onClick={() => setSelected(null)} style={{ border: 0, background: "transparent", cursor: "pointer" }}>
                <X size={18} />
              </button>
            </div>

            <section className="work-item-section description-section">
              <h3>Description</h3>
              <p>{selected.description || "No description was provided."}</p>
            </section>

            <div className="ticket-details-grid">
              <div><span>Created</span><strong>{selected.createdAt}</strong></div>
              <div><span>Department</span><strong>{selected.team}</strong></div>
              <div><span>Created by</span><strong>{selected.creator?.fullName ?? "Unknown"}</strong></div>
              <div><span>Assigned to</span><strong>{selected.assignee}</strong></div>
              <div><span>Approval requested by</span><strong>{selected.approvalRequestedBy?.fullName ?? "Not requested"}</strong></div>
              <div><span>Last updated</span><strong>{selected.updated}</strong></div>
              <div><span>Due date</span><strong>{selected.due}</strong></div>
            </div>

            {canManageTeam && !["Awaiting Approval", "Closed", "Resolved"].includes(selected.status) && (
              <div className="due-date-editor">
                <label className="form-field compact-field">
                  Due date
                  <input type="date" value={dueDateDraft} onChange={(event) => setDueDateDraft(event.target.value)} required />
                </label>
                <button type="button" className="secondary-button" disabled={saving || !dueDateDraft} onClick={() => void saveDueDate()}>
                  Save due date
                </button>
              </div>
            )}

            {selected.resolutionProposal && (
              <div className="resolution-proposal">
                <span>Resolution proposal</span>
                <p>{selected.resolutionProposal}</p>
              </div>
            )}

            <section className="work-item-section workflow-section">
              <div className="section-heading-row">
                <div>
                  <h3>Status and approval</h3>
                  <p>Current state: <span className={`status-badge status-${selected.status.toLowerCase().replaceAll(" ", "-")}`}>{selected.status}</span></p>
                </div>
                {selected.status === "Awaiting Approval" && <span className="approval-pending-label">Approval pending</span>}
              </div>

              {canEditSelected && selected.status !== "Approved" && (
                <label className="form-field compact-field">
                  Status
                  <select value={statusDraft} onChange={(e) => setStatusDraft(e.target.value as Status)}>
                    {editableStatuses.filter((status) => !selected.approvalRequired || status !== "Closed").map((status) => (
                      <option key={status}>{status}</option>
                    ))}
                    {selected.status === "Changes Requested" && <option>Changes Requested</option>}
                  </select>
                </label>
              )}

              {canEditSelected && selected.approvalRequired && ["In Progress", "Changes Requested"].includes(selected.status) && (
                <label className="form-field compact-field">
                  Completion notes for manager
                  <textarea
                    value={resolutionProposal}
                    onChange={(event) => setResolutionProposal(event.target.value)}
                    rows={3}
                    placeholder="Describe the completed work and evidence for approval..."
                  />
                </label>
              )}

              {selected.status === "Awaiting Approval" && (
                <p className="workflow-message">This work item is waiting for a manager decision. Status changes are paused until it is approved or returned.</p>
              )}
              {selected.status === "Approved" && (
                <p className="workflow-message success">Manager approval is complete. The assignee or manager can now close this work item.</p>
              )}

              {canEditSelected && (
                <div className="workflow-actions">
                  <button type="button" className="primary-button" disabled={saving} onClick={() => void submitWorkItem()}>
                    {saving ? "Submitting..." : selected.status === "Approved" ? "Close work item" : "Submit"}
                  </button>
                </div>
              )}
            </section>

            <section className="work-item-section">
              <div className="section-heading-row">
                <div>
                  <h3>Comments</h3>
                  <p>View and discuss updates on this work item.</p>
                </div>
              </div>

              {detailLoading ? (
                <p className="section-empty">Loading comments...</p>
              ) : workItemDetails?.comments.length ? (
                <div className="comment-list">
                  {workItemDetails.comments.map((comment) => (
                    <article className="comment-card" key={comment.id}>
                      <div>
                        <strong>{comment.author.fullName}</strong>
                        <time>{new Date(comment.createdAt).toLocaleString()}</time>
                      </div>
                      <p>{comment.body}</p>
                      {(comment.authorId === currentUser?.id || canManageTeam) && (
                        <button type="button" className="delete-comment-button" disabled={saving} onClick={() => void deleteComment(comment.id)}>
                          <Trash2 size={13} /> Delete
                        </button>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <p className="section-empty">No comments yet.</p>
              )}

              {accessRole !== "VIEWER" && (
                <form className="comment-form" onSubmit={(event) => void addComment(event)}>
                  <textarea
                    value={commentBody}
                    onChange={(event) => setCommentBody(event.target.value)}
                    rows={2}
                    maxLength={5000}
                    placeholder="Add a comment..."
                    aria-label="New comment"
                  />
                  <button type="submit" className="secondary-button" disabled={saving || !commentBody.trim()}>
                    <Send size={14} /> Add comment
                  </button>
                </form>
              )}
            </section>

            <section className="work-item-section">
              <div className="section-heading-row">
                <div>
                  <h3>Work item history</h3>
                  <p>A chronological record of activity.</p>
                </div>
              </div>
              {detailLoading ? (
                <p className="section-empty">Loading history...</p>
              ) : workItemDetails?.activity.length ? (
                <ol className="activity-list">
                  {workItemDetails.activity.map((activity) => (
                    <li key={activity.id}>
                      <span className="activity-dot" aria-hidden="true" />
                      <div>
                        <strong>{activity.actor?.fullName ?? "System"}</strong>
                        <p>{activityLabels[activity.action] ?? activity.action.replaceAll("_", " ").toLowerCase()}</p>
                        {formatActivityDetails(activity.details) && <small>{formatActivityDetails(activity.details)}</small>}
                        <time>{new Date(activity.createdAt).toLocaleString()}</time>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="section-empty">No recorded activity.</p>
              )}
            </section>

            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setSelected(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {assigningItem && (
        <div className="modal-backdrop" onClick={(event) => event.target === event.currentTarget && setAssigningItem(null)}>
          <form className="modal" onSubmit={(event) => void assignItem(event)}>
            <div className="modal-heading">
              <div>
                <span style={{ fontSize: "11px", color: "#2563eb", fontWeight: 700 }}>
                  {assigningItem.id} · {assigningItem.team}
                </span>
                <h2>Assign work item</h2>
                <p>{assigningItem.title}</p>
              </div>
              <button type="button" onClick={() => setAssigningItem(null)} className="icon-button">
                <X size={18} />
              </button>
            </div>

            <label className="form-field">
              Department employee
              <select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)} required>
                {departmentMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.fullName} · {member.email}
                  </option>
                ))}
              </select>
            </label>

            {departmentMembers.length === 0 && (
              <p className="empty-state-note">No active employees are available in this department.</p>
            )}

            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setAssigningItem(null)}>Cancel</button>
              <button type="submit" className="primary-button" disabled={saving || !assigneeId}>
                {saving ? "Assigning..." : "Assign employee"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Create New Item Modal */}
      {newOpen && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setNewOpen(false)}>
          <form className="modal" onSubmit={(e) => void addItem(e)}>
            <div className="modal-heading">
              <div>
                <h2>Create Work Item</h2>
                <p>Add a task to the shared operational queue.</p>
              </div>
              <button type="button" onClick={() => setNewOpen(false)} style={{ border: 0, background: "transparent", cursor: "pointer" }}>
                <X size={18} />
              </button>
            </div>

            <label className="form-field">
              Title
              <input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. Stripe webhook failure investigation" />
            </label>

            <label className="form-field">
              Description
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Provide task details..." required />
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <label className="form-field">
                Department
                <select value={selectedTeamId} onChange={(event) => setSelectedTeamId(event.target.value)} required>
                  <option value="" disabled>Select department</option>
                  {teams.map((teamOption) => (
                    <option key={teamOption.id} value={teamOption.id}>{teamOption.name}</option>
                  ))}
                </select>
              </label>

              <label className="form-field">
                Priority
                <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
                  {priorities.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>

              <label className="form-field">
                Due date
                <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required />
              </label>
            </div>

            <label className="approval-checkbox">
              <input
                type="checkbox"
                checked={approvalRequired}
                onChange={(e) => setApprovalRequired(e.target.checked)}
              />
              Manager approval is required before resolution
            </label>

            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setNewOpen(false)}>Cancel</button>
              <button type="submit" className="primary-button" disabled={saving}>
                {saving ? "Creating..." : "Create Item"}
              </button>
            </div>
          </form>
        </div>
      )}

      {newUserOpen && (
        <div className="modal-backdrop" onClick={(event) => event.target === event.currentTarget && setNewUserOpen(false)}>
          <form className="modal" autoComplete="off" onSubmit={(event) => void addManagedUser(event)}>
            <div className="modal-heading">
              <div>
                <h2>Add employee access</h2>
                <p>Create a new employee or add an existing employee to a department.</p>
              </div>
              <button type="button" className="icon-button" onClick={() => setNewUserOpen(false)}><X size={18} /></button>
            </div>

            <label className="form-field">
              Full name
              <input value={newUserName} onChange={(event) => setNewUserName(event.target.value)} minLength={2} maxLength={120} required />
            </label>
            <label className="form-field">
              Email
              <input
                type="email"
                autoComplete="off"
                pattern="^[^\s@]+@[^\s@]+\.[^\s@]{2,}$"
                value={newUserEmail}
                onChange={(event) => setNewUserEmail(event.target.value)}
                required
              />
            </label>
            <label className="form-field">
              Initial password
              <input type="password" autoComplete="new-password" value={newUserPassword} onChange={(event) => setNewUserPassword(event.target.value)} minLength={8} maxLength={72} required />
            </label>
            <label className="form-field">
              Department
              <select
                value={newUserTeamId}
                onChange={(event) => setNewUserTeamId(event.target.value)}
                disabled={!isGlobalAdmin}
                required
              >
                {teams.map((teamOption) => <option key={teamOption.id} value={teamOption.id}>{teamOption.name}</option>)}
              </select>
            </label>
            <label className="form-field">
              Access role
              <select value={newUserRole} onChange={(event) => setNewUserRole(event.target.value as TeamRole)}>
                <option value="MEMBER">Employee / Member</option>
                <option value="VIEWER">Viewer</option>
                {isGlobalAdmin && <option value="MANAGER">Manager</option>}
              </select>
            </label>

            <p className="empty-state-note">If the email already exists, its existing password will remain unchanged.</p>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setNewUserOpen(false)}>Cancel</button>
              <button type="submit" className="primary-button" disabled={saving || !newUserTeamId}>
                {saving ? "Adding..." : "Add employee"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Notice Toast */}
      {notice && (
        <div className="toast" role="status" aria-live="polite">
          <CheckCircle2 size={16} color="#4ade80" />
          <span>{notice}</span>
        </div>
      )}
    </div>
  );
}
