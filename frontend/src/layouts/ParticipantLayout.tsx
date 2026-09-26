import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function ParticipantLayout() {
  const { signOut } = useAuth();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/15 text-primary text-xs">{"{ }"}</span>
            Beyond The Syntax
          </Link>
          <nav className="ml-auto flex items-center gap-1 text-sm" aria-label="Participant">
            <NavLink to="/quiz" className={({ isActive }) => `rounded-lg px-3 py-1.5 ${isActive ? "text-text" : "text-muted hover:text-text"}`}>
              Quiz
            </NavLink>
            <NavLink to="/team" className={({ isActive }) => `rounded-lg px-3 py-1.5 ${isActive ? "text-text" : "text-muted hover:text-text"}`}>
              Team
            </NavLink>
            <button
              className="rounded-lg px-3 py-1.5 text-muted hover:text-text transition-colors"
              onClick={() => signOut()}
            >
              Sign out
            </button>
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}