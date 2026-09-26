import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { isDemoMode } from "../services/mock";

/**
 * Frontend route guards are a UX convenience only — they stop a logged-out
 * user from seeing a broken page. They are NOT the security boundary; every
 * endpoint this leads to re-checks role/state/turn server-side (see
 * backend/app/core/security.py).
 *
 * In demo mode the guard passes everyone through so both the participant and
 * admin experiences can be reviewed before login/roles are wired up.
 */
export default function ProtectedRoute({ role }: { role: "participant" | "admin" }) {
  const { user, loading } = useAuth();

  if (isDemoMode) return <Outlet />;

  if (loading) return <div className="min-h-screen grid place-items-center text-muted">Loading…</div>;
  if (!user || user.role !== role) {
    return <Navigate to="/auth" replace />;
  }
  return <Outlet />;
}