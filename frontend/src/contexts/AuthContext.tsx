import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api } from "../services/api";
import { supabase } from "../lib/supabase";
import { isDemoMode, demoParticipant, demoAdmin } from "../services/mock";

export type Profile = { id: string; role: "participant" | "admin"; name: string };

const AuthContext = createContext<{ user: Profile | null; loading: boolean; signOut: () => Promise<void> }>({
  user: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const signOut = async () => {
    setLoading(true);
    setUser(null);
    if (!isDemoMode && supabase) {
      await supabase.auth.signOut();
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isDemoMode) {
      // Demo identity lets every route be previewed without Supabase. Roles and
      // real identity plumbing are wired up later — the backend stays authoritative.
      const t = setTimeout(() => {
        setUser(demoParticipant);
        setLoading(false);
      }, 400);
      return () => clearTimeout(t);
    }

    if (!supabase) {
      setLoading(false);
      return;
    }

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session?.user) {
        setUser(null);
        setLoading(false);
        return;
      }
      // Resolve role/profile from OUR backend, never trust anything client-side
      // beyond "this Supabase user is signed in".
      try {
        const response = await api.get("/auth/me");
        setUser(response.data);
      } catch {
        setUser(null);
      }
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={{ user, loading, signOut }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

export { demoAdmin as mockAdminIdentity };