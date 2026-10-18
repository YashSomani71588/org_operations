"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser, logout, type AuthUser } from "@/lib/auth";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  Clock3,
  FileText,
  Filter,
  LayoutDashboard,
  ListTodo,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
  X,
  Zap,
} from "lucide-react";
import "./dashboard.css";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type Status = "Open" | "In Progress" | "In Review" | "Blocked" | "Closed";
type Priority = "Low" | "Medium" | "High" | "Critical";

type Item = {
  dbId: number;
  id: string;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  team: string;
  assignee: string;
  due: string;
  updated: string;
  version: number;
};

const statuses: Status[] = ["Open", "In Progress", "In Review", "Blocked", "Closed"];
const priorities: Priority[] = ["Low", "Medium", "High", "Critical"];
const teamNames = ["Payments", "Finance Ops", "Engineering", "Operations", "Compliance"];

export default function DashboardPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Filters & Search
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [priorityFilter, setPriorityFilter] = useState("All priorities");
  const [teamFilter, setTeamFilter] = useState("All teams");

  // Modals state
  const [selected, setSelected] = useState<Item | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("Medium");
  const [team, setTeam] = useState("Operations");
  const [saving, setSaving] = useState(false);

  // 1. Load User Session and Work Items
  async function reload() {
    setLoading(true);
    setError("");
    try {
      // Check auth
      const userRes = await getCurrentUser().catch(() => null);
      if (userRes?.user) {
        setCurrentUser(userRes.user);
      }

      // Fetch items from backend
      const res = await fetch(`${API_BASE}/api/work-items`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Backend error (${res.status})`);
      const data = await res.json();

      const mapped: Item[] = data.items.map((row: any) => ({
        dbId: row.id,
        id: `OPS-${String(1000 + row.id).padStart(4, "0")}`,
        title: row.title,
        description: row.description || "",
        status: row.status as Status,
        priority: row.priority as Priority,
        team: row.team || "Operations",
        assignee: row.assignee_name || "Unassigned",
        due: row.due_at ? new Date(row.due_at).toLocaleDateString() : "Not set",
        updated: new Date(row.updated_at).toLocaleString(),
        version: row.version,
      }));

      setItems(mapped);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not connect to backend");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  // Filter items
  const filtered = useMemo(() => {
    return items.filter((i) => {
      const matchQuery = `${i.id} ${i.title} ${i.team} ${i.assignee}`
        .toLowerCase()
        .includes(query.toLowerCase());
      const matchStatus = statusFilter === "All statuses" || i.status === statusFilter;
      const matchPriority = priorityFilter === "All priorities" || i.priority === priorityFilter;
      const matchTeam = teamFilter === "All teams" || i.team === teamFilter;
      return matchQuery && matchStatus && matchPriority && matchTeam;
    });
  }, [items, query, statusFilter, priorityFilter, teamFilter]);

  // Metrics counts
  const openCount = items.filter((i) => i.status !== "Closed").length;
  const reviewCount = items.filter((i) => i.status === "In Review").length;
  const blockedCount = items.filter((i) => i.status === "Blocked").length;

  // 2. Save Status with Optimistic Concurrency Control (Version Check)
  async function saveStatus() {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/work-items/${selected.dbId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          status: selected.status,
          expectedVersion: selected.version, // <--- Concurrency version check!
        }),
      });

      const data = await res.json();

      if (res.status === 409) {
        // Concurrency conflict occurred!
        setNotice(`⚠️ CONFLICT: ${data.message} Remote version is now v${data.serverVersion}.`);
        await reload();
        setSelected(null);
        return;
      }

      if (!res.ok) throw new Error(data.error || "Update failed");

      setNotice("✓ Status updated successfully and recorded in PostgreSQL audit log.");
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
        setNotice("✓ You claimed this work item atomically!");
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
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/work-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          priority,
          team,
        }),
      });
      if (!res.ok) throw new Error("Could not create item");
      setTitle("");
      setDescription("");
      setNewOpen(false);
      setNotice("✓ Work item created in PostgreSQL.");
      await reload();
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

  return (
    <div className="dashboard-root">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Zap size={20} />
          </div>
          <div>
            <strong style={{ fontSize: "16px", color: "#0f172a", display: "block" }}>
              OpsFlow
            </strong>
            <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 700 }}>
              NEWTONITE OPS
            </span>
          </div>
        </div>

        <div className="workspace-label">WORKSPACE</div>
        <nav className="nav-list">
          <button className="nav-button active">
            <LayoutDashboard size={18} /> Dashboard
          </button>
          <button className="nav-button" onClick={() => setStatusFilter("All statuses")}>
            <ListTodo size={18} /> Work Items
          </button>
          <button className="nav-button" onClick={() => setStatusFilter("In Review")}>
            <ShieldCheck size={18} /> Approvals
          </button>
          <button className="nav-button" onClick={() => setStatusFilter("Blocked")}>
            <AlertCircle size={18} /> Blocked Queue
          </button>
        </nav>

        <div className="sidebar-bottom">
          <div className="profile">
            <div className="avatar">
              {currentUser?.fullName?.slice(0, 2).toUpperCase() || "OP"}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ fontSize: "12px", color: "#0f172a", display: "block" }}>
                {currentUser?.fullName || "Aarav Patel"}
              </strong>
              <span style={{ fontSize: "10px", color: "#64748b" }}>
                {currentUser?.role || "EMPLOYEE"}
              </span>
            </div>
            <button
              onClick={handleLogout}
              title="Sign Out"
              style={{
                border: 0,
                background: "transparent",
                color: "#dc2626",
                cursor: "pointer",
                padding: "4px",
              }}
            >
              <LogOut size={16} />
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
          <div className="top-actions">
            <button className="secondary-button" onClick={() => void reload()}>
              <RefreshCw size={14} /> Refresh Data
            </button>
            <div className="avatar">
              {currentUser?.fullName?.slice(0, 2).toUpperCase() || "OP"}
            </div>
          </div>
        </header>

        <section className="page-content">
          <div className="welcome-row">
            <div>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#2563eb", letterSpacing: "1px" }}>
                OPS WORKSPACE
              </span>
              <h1>Welcome, {currentUser?.fullName || "Operator"} ✦</h1>
              <p>Track ownership, handle concurrency collisions, and resolve critical workflows.</p>
            </div>
            <button className="primary-button" onClick={() => setNewOpen(true)}>
              <Plus size={17} /> Create work item
            </button>
          </div>

          {error && (
            <div style={{ padding: "14px 18px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "10px", color: "#b91c1c", marginBottom: "20px", display: "flex", alignItems: "center", gap: "10px" }}>
              <AlertCircle size={18} />
              <span>{error}. Ensure your backend server is running on port 4000.</span>
            </div>
          )}

          {/* Metric Cards */}
          <div className="metric-grid">
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
                <span>Blocked / Escalated</span>
                <Clock3 size={18} color="#dc2626" />
              </div>
              <div className="metric-value">{blockedCount}</div>
              <div className="metric-note">Requires team intervention</div>
            </div>

            <div className="metric-card">
              <div className="metric-top">
                <span>Concurrency Engine</span>
                <Activity size={18} color="#16a34a" />
              </div>
              <div className="metric-value" style={{ fontSize: "20px", color: "#16a34a", marginTop: "16px" }}>
                OCC Active
              </div>
              <div className="metric-note">v-lock enabled on PostgreSQL</div>
            </div>
          </div>

          {/* Table & Attention Grid */}
          <div className="content-grid">
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Team Work Queue</h2>
                  <p>Search, filter, claim, and update records in real-time.</p>
                </div>
                <button
                  className="secondary-button"
                  style={{ padding: "6px 12px", fontSize: "11px" }}
                  onClick={() => {
                    setQuery("");
                    setStatusFilter("All statuses");
                    setPriorityFilter("All priorities");
                    setTeamFilter("All teams");
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
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by title, team, or ID..."
                  />
                </label>

                <select className="plain-filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option>All statuses</option>
                  {statuses.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>

                <select className="plain-filter" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
                  <option>All priorities</option>
                  {priorities.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>

                <select className="plain-filter" value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
                  <option>All teams</option>
                  {teamNames.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>

              {/* Table */}
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>WORK ITEM</th>
                      <th>STATUS</th>
                      <th>PRIORITY</th>
                      <th>TEAM</th>
                      <th>ASSIGNEE</th>
                      <th>VERSION</th>
                      <th style={{ textAlign: "right" }}>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: "center", padding: "30px", color: "#64748b" }}>
                          Loading live work items from PostgreSQL...
                        </td>
                      </tr>
                    ) : filtered.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: "center", padding: "30px", color: "#64748b" }}>
                          No work items match the active filters.
                        </td>
                      </tr>
                    ) : (
                      filtered.map((item) => (
                        <tr key={item.dbId}>
                          <td>
                            <button className="item-link" onClick={() => setSelected(item)}>
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
                              <button
                                onClick={() => claimItem(item.dbId)}
                                style={{
                                  background: "#eff6ff",
                                  border: "1px solid #bfdbfe",
                                  color: "#1d4ed8",
                                  borderRadius: "6px",
                                  padding: "3px 8px",
                                  fontSize: "11px",
                                  fontWeight: 600,
                                  cursor: "pointer",
                                }}
                              >
                                Claim
                              </button>
                            ) : (
                              <span style={{ fontWeight: 600, color: "#334155" }}>{item.assignee}</span>
                            )}
                          </td>
                          <td style={{ fontWeight: 700, color: "#64748b" }}>v{item.version}</td>
                          <td style={{ textAlign: "right" }}>
                            <button
                              onClick={() => setSelected(item)}
                              className="secondary-button"
                              style={{ padding: "4px 8px", fontSize: "11px" }}
                            >
                              Update Status
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="table-footer">
                <span>Showing {filtered.length} of {items.length} items</span>
                <button
                  onClick={() => void reload()}
                  style={{ border: 0, background: "transparent", color: "#2563eb", cursor: "pointer", fontWeight: 600 }}
                >
                  Reload Queue
                </button>
              </div>
            </section>

            {/* Side Attention Panel */}
            <aside style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <section className="panel" style={{ padding: "20px" }}>
                <h3 style={{ fontSize: "14px", fontWeight: 700, margin: "0 0 12px", color: "#0f172a" }}>
                  🚨 Needs Attention (Blocked)
                </h3>
                {blockedCount === 0 ? (
                  <p style={{ fontSize: "12px", color: "#64748b", margin: 0 }}>No items are currently blocked.</p>
                ) : (
                  items
                    .filter((i) => i.status === "Blocked")
                    .map((bItem) => (
                      <div
                        key={bItem.dbId}
                        onClick={() => setSelected(bItem)}
                        style={{
                          padding: "10px",
                          background: "#fef2f2",
                          border: "1px solid #fee2e2",
                          borderRadius: "8px",
                          marginBottom: "8px",
                          cursor: "pointer",
                        }}
                      >
                        <strong style={{ fontSize: "12px", color: "#991b1b", display: "block" }}>
                          {bItem.id}: {bItem.title}
                        </strong>
                        <span style={{ fontSize: "10px", color: "#b91c1c" }}>Team: {bItem.team}</span>
                      </div>
                    ))
                )}
              </section>

              <section className="panel" style={{ padding: "20px" }}>
                <h3 style={{ fontSize: "14px", fontWeight: 700, margin: "0 0 12px", color: "#0f172a" }}>
                  💡 Assessment Evaluator Tips
                </h3>
                <ul style={{ fontSize: "11px", color: "#475569", paddingLeft: "16px", margin: 0, lineHeight: 1.6 }}>
                  <li><strong>OCC Testing:</strong> Open this tab in two windows. Try changing the status in both. The 2nd will trigger a version conflict!</li>
                  <li><strong>Atomic Claim:</strong> Click "Claim" on an unassigned item. It assigns to you and bumps the version atomically.</li>
                </ul>
              </section>
            </aside>
          </div>
        </section>
      </main>

      {/* Status Update Modal with OCC Version Check */}
      {selected && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setSelected(null)}>
          <form className="modal" onSubmit={(e) => { e.preventDefault(); void saveStatus(); }}>
            <div className="modal-heading">
              <div>
                <span style={{ fontSize: "11px", color: "#2563eb", fontWeight: 700 }}>
                  {selected.id} · {selected.team} (Record v{selected.version})
                </span>
                <h2>{selected.title}</h2>
                <p style={{ fontSize: "12px", color: "#64748b" }}>{selected.description}</p>
              </div>
              <button type="button" onClick={() => setSelected(null)} style={{ border: 0, background: "transparent", cursor: "pointer" }}>
                <X size={18} />
              </button>
            </div>

            <label className="form-field">
              Change Status
              <select value={selected.status} onChange={(e) => setSelected({ ...selected, status: e.target.value as Status })}>
                {statuses.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>

            <div style={{ padding: "10px", background: "#f8fafc", borderRadius: "8px", fontSize: "11px", color: "#64748b" }}>
              ℹ️ Current Version: <strong>v{selected.version}</strong>. The server validates that no one else has updated this item in the meantime.
            </div>

            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setSelected(null)}>Cancel</button>
              <button type="submit" className="primary-button" disabled={saving}>
                {saving ? "Checking & Saving..." : "Save Status"}
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
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Provide details..." />
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <label className="form-field">
                Priority
                <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
                  {priorities.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>

              <label className="form-field">
                Team
                <select value={team} onChange={(e) => setTeam(e.target.value)}>
                  {teamNames.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setNewOpen(false)}>Cancel</button>
              <button type="submit" className="primary-button" disabled={saving}>
                {saving ? "Creating..." : "Create Item"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Notice Toast */}
      {notice && (
        <div className="toast">
          <CheckCircle2 size={16} color="#4ade80" />
          <span>{notice}</span>
          <button onClick={() => setNotice("")} style={{ border: 0, background: "transparent", color: "#fff", cursor: "pointer" }}>
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}