import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { isDemoMode } from "../services/mock";

const NAV = [
  { to: "/admin", label: "Dashboard", icon: "▦", end: true },
  { to: "/admin/questions", label: "Questions", icon: "?" },
  { to: "/admin/participants", label: "Participants", icon: "◉" },
  { to: "/admin/round2", label: "Round 2", icon: "◧" },
  { to: "/admin/leaderboard", label: "Leaderboard", icon: "◈" },
  { to: "/admin/live", label: "Live Monitor", icon: "◔" },
];

export default function AdminLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2.5 border-b border-line px-5">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/15 text-primary">{"{ }"}</span>
        <div>
          <p className="text-sm font-semibold leading-tight">Beyond The Syntax</p>
          <p className="text-[11px] text-muted">Admin Console</p>
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Admin">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                isActive ? "bg-primary/15 text-primary" : "text-muted hover:bg-soft hover:text-text"
              }`
            }
          >
            <span aria-hidden className="text-base w-5 text-center">{n.icon}</span>
            {n.label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-line p-4">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-primary/15 text-sm text-primary">SL</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{user?.name ?? "Admin"}</p>
            <p className="text-xs text-muted">Administrator</p>
          </div>
        </div>
        <button
          className="btn-ghost mt-3 w-full justify-center text-xs"
          onClick={() => {
            navigate("/");
          }}
        >
          View participant site →
        </button>
        <button
          className="btn-ghost mt-1.5 w-full justify-center text-xs text-warning"
          onClick={() => signOut().then(() => navigate("/auth"))}
        >
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-line lg:block">{sidebar}</aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-line bg-bg animate-fade-in">{sidebar}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-line px-4 sm:px-6">
          <button className="btn-secondary px-2.5 lg:hidden" aria-label="Open menu" onClick={() => setOpen(true)}>
            ☰
          </button>
          <div className="hidden items-center gap-2 text-xs text-muted lg:flex">
            <span className="inline-block h-2 w-2 rounded-full bg-success" />
            {isDemoMode ? "Demo mode · mock data" : "Live · FastAPI + Supabase"}
          </div>
          <div className="flex items-center gap-3">
            <Link to="/admin" className="text-sm text-muted hover:text-text">
              Round 2: Live
            </Link>
            <span className="hidden rounded-lg border border-line px-2.5 py-1 text-xs text-muted sm:block">v0.1</span>
          </div>
        </header>
        <main className="flex-1 overflow-x-hidden p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}