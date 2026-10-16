export interface UserPersona {
  id: string;
  name: string;
  email: string;
  avatar: string;
  teams: {
    teamId: string;
    teamName: string;
    role: "VIEWER" | "MEMBER" | "MANAGER";
  }[];
}

export const SEEDED_USERS: UserPersona[] = [
  {
    id: "user-viewer-01",
    name: "Alice Vance",
    email: "alice@company.internal",
    avatar: "AV",
    teams: [
      { teamId: "team-ops-01", teamName: "Operations & Payments", role: "VIEWER" }
    ]
  },
  {
    id: "user-member-01",
    name: "Bob Martinez",
    email: "bob@company.internal",
    avatar: "BM",
    teams: [
      { teamId: "team-ops-01", teamName: "Operations & Payments", role: "MEMBER" },
      { teamId: "team-eng-01", teamName: "Core Engineering", role: "VIEWER" }
    ]
  },
  {
    id: "user-manager-01",
    name: "Charlie Zhang",
    email: "charlie@company.internal",
    avatar: "CZ",
    teams: [
      { teamId: "team-ops-01", teamName: "Operations & Payments", role: "MANAGER" },
      { teamId: "team-eng-01", teamName: "Core Engineering", role: "MEMBER" }
    ]
  },
  {
    id: "user-manager-02",
    name: "Priya Sharma",
    email: "priya@company.internal",
    avatar: "PS",
    teams: [
      { teamId: "team-ops-01", teamName: "Operations & Payments", role: "MANAGER" }
    ]
  }
];

export interface ActiveSession {
  userId: string;
  userName: string;
  email: string;
  teamId: string;
  teamName: string;
  role: "VIEWER" | "MEMBER" | "MANAGER";
}

const STORAGE_KEY = "ops_active_session";

export function saveSession(session: ActiveSession) {
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }
}

export function getSession(): ActiveSession | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function clearSession() {
  if (typeof window !== "undefined") {
    localStorage.removeItem(STORAGE_KEY);
  }
}
