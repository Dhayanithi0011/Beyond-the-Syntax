import { Link, NavLink, Outlet } from "react-router-dom";

export default function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-50 border-b border-line bg-bg/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/15 text-primary">{"{ }"}</span>
            <span className="text-lg font-semibold tracking-tight">Beyond The Syntax</span>
          </Link>
          <nav className="flex items-center gap-1 text-sm" aria-label="Primary">
            <NavLink
              to="/"
              className={({ isActive }) =>
                `rounded-lg px-3 py-2 transition-colors ${isActive ? "text-text" : "text-muted hover:text-text"}`
              }
              end
            >
              Home
            </NavLink>
            <NavLink
              to="/rules"
              className={({ isActive }) =>
                `rounded-lg px-3 py-2 transition-colors ${isActive ? "text-text" : "text-muted hover:text-text"}`
              }
            >
              Rules
            </NavLink>
            <NavLink
              to="/quiz"
              className={({ isActive }) =>
                `rounded-lg px-3 py-2 transition-colors ${isActive ? "text-text" : "text-muted hover:text-text"}`
              }
            >
              Round 1
            </NavLink>
            <NavLink
              to="/round2"
              className={({ isActive }) =>
                `rounded-lg px-3 py-2 transition-colors ${isActive ? "text-text" : "text-muted hover:text-text"}`
              }
            >
              Round 2
            </NavLink>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/auth" className="btn-primary text-xs">
              Login / Register
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-line py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 text-sm text-muted sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded bg-primary/15 text-primary text-xs">{"{ }"}</span>
            <span>Beyond The Syntax · College Coding Championship</span>
          </div>
          <div className="flex items-center gap-4">
            <Link className="hover:text-text transition-colors" to="/rules">Rules</Link>
            <Link className="hover:text-text transition-colors" to="/auth">Sign in</Link>
          </div>
        </div>
        <p className="mt-6 text-center text-xs text-muted/70">Developed by Dany 😎</p>
      </footer>
    </div>
  );
}