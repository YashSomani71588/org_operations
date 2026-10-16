'use client';

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, clearSession, ActiveSession } from "@/lib/auth";
import { LogOut, Building2 } from "lucide-react";

export default function DashboardPage() {
  const router = useRouter();
  const [session, setSession] = useState<ActiveSession | null>(null);

  useEffect(() => {
    const active = getSession();
    if (!active) {
      router.push("/");
    } else {
      setSession(active);
    }
  }, [router]);

  const handleLogout = () => {
    clearSession();
    router.push("/");
  };

  if (!session) return null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <nav className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 text-white font-bold flex items-center justify-center text-sm">
            N
          </div>
          <span className="font-bold text-lg text-slate-800">Newtonite Operations</span>
        </div>

        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 text-sm text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg border">
            <Building2 className="w-4 h-4 text-slate-500" />
            <span className="font-medium text-slate-800">{session.teamName}</span>
            <span className="text-xs px-2 py-0.5 rounded font-bold uppercase bg-blue-100 text-blue-700">
              {session.role}
            </span>
          </div>

          <div className="text-sm font-semibold text-slate-700">
            {session.userName}
          </div>

          <button
            onClick={handleLogout}
            className="flex items-center gap-1 text-xs text-rose-600 hover:text-rose-700 font-semibold px-2.5 py-1.5 rounded hover:bg-rose-50 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900">Welcome, {session.userName}</h1>
          <p className="text-slate-500 text-sm mt-1">
            Logged into <strong className="text-slate-700">{session.teamName}</strong> with <strong className="text-slate-700">{session.role}</strong> role.
          </p>
          <div className="mt-6 p-4 rounded-xl bg-slate-50 border border-slate-200">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Active Session Payload</p>
            <pre className="text-xs mt-2 bg-slate-900 text-slate-100 p-3 rounded-lg overflow-x-auto">
              {JSON.stringify(session, null, 2)}
            </pre>
          </div>
        </div>
      </main>
    </div>
  );
}
