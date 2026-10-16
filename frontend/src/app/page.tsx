'use client';

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { SEEDED_USERS, UserPersona, saveSession } from "@/lib/auth";
import { ArrowRight, Building2, CheckCircle2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [selectedUser, setSelectedUser] = useState<UserPersona>(SEEDED_USERS[1]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>(SEEDED_USERS[1].teams[0].teamId);

  const handleUserSelect = (user: UserPersona) => {
    setSelectedUser(user);
    setSelectedTeamId(user.teams[0].teamId);
  };

  const currentTeamInfo = selectedUser.teams.find((t) => t.teamId === selectedTeamId) || selectedUser.teams[0];

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    saveSession({
      userId: selectedUser.id,
      userName: selectedUser.name,
      email: selectedUser.email,
      teamId: currentTeamInfo.teamId,
      teamName: currentTeamInfo.teamName,
      role: currentTeamInfo.role
    });
    router.push("/dashboard");
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-600 text-white font-bold text-xl shadow-lg mb-4">
          N
        </div>
        <h2 className="text-3xl font-extrabold text-white tracking-tight">
          Newtonite Operations
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          Operations Under Pressure • Identity & Team Access
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-xl">
        <div className="bg-slate-800 py-8 px-6 shadow-2xl rounded-2xl sm:px-10 border border-slate-700">
          <form onSubmit={handleLogin} className="space-y-6">

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                1. Select User Persona
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {SEEDED_USERS.map((user) => {
                  const isSelected = selectedUser.id === user.id;
                  return (
                    <div
                      key={user.id}
                      onClick={() => handleUserSelect(user)}
                      className={`cursor-pointer rounded-xl p-3 border transition-all flex items-center justify-between ${
                        isSelected
                          ? "border-blue-500 bg-blue-950/40 ring-1 ring-blue-500"
                          : "border-slate-700 bg-slate-900/50 hover:border-slate-600 hover:bg-slate-900"
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center font-bold text-slate-200 text-xs">
                          {user.avatar}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">{user.name}</p>
                          <p className="text-xs text-slate-400">{user.email}</p>
                        </div>
                      </div>
                      {isSelected && <CheckCircle2 className="w-4 h-4 text-blue-400" />}
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                2. Select Active Team & Responsibility
              </label>
              <div className="space-y-2">
                {selectedUser.teams.map((t) => {
                  const isSelected = selectedTeamId === t.teamId;
                  return (
                    <div
                      key={t.teamId}
                      onClick={() => setSelectedTeamId(t.teamId)}
                      className={`cursor-pointer rounded-xl p-3 border transition-all flex items-center justify-between ${
                        isSelected
                          ? "border-blue-500 bg-blue-950/40 ring-1 ring-blue-500"
                          : "border-slate-700 bg-slate-900/50 hover:border-slate-600"
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <Building2 className="w-5 h-5 text-slate-400" />
                        <div>
                          <p className="text-sm font-medium text-white">{t.teamName}</p>
                          <p className="text-xs text-slate-400">Team ID: {t.teamId}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-700 text-slate-200">
                          {t.role}
                        </span>
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-blue-400" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-slate-900/80 rounded-xl p-4 border border-slate-700/60 text-xs text-slate-300 space-y-1.5">
              <span className="font-semibold text-white uppercase tracking-wider text-[11px]">
                Effective Capabilities ({currentTeamInfo.role}):
              </span>
              {currentTeamInfo.role === "MANAGER" && (
                <ul className="list-disc list-inside text-slate-400 space-y-1">
                  <li>Can assign and reassign work items to team members.</li>
                  <li>Can approve or reject pending resolution proposals.</li>
                  <li>Can reopen resolved work items with rationale.</li>
                </ul>
              )}
              {currentTeamInfo.role === "MEMBER" && (
                <ul className="list-disc list-inside text-slate-400 space-y-1">
                  <li>Can create new work items.</li>
                  <li>Can claim unassigned work items atomically.</li>
                  <li>Can progress tickets and submit resolution proposals.</li>
                </ul>
              )}
              {currentTeamInfo.role === "VIEWER" && (
                <ul className="list-disc list-inside text-slate-400 space-y-1">
                  <li>Read-only access to work items, metrics, and audit timeline.</li>
                  <li>Cannot claim, assign, or mutate state.</li>
                </ul>
              )}
            </div>

            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 shadow-md transition-all active:scale-[0.99]"
            >
              Sign In as {selectedUser.name.split(" ")[0]} ({currentTeamInfo.role})
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
