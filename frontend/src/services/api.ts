import axios from "axios";
import { supabase } from "../lib/supabase";
import { isDemoMode, demoAdapter } from "./mock";

const API_BASE = (import.meta.env.VITE_API_URL ?? "/api/v1").replace(/\/+$/, "");

export const api = axios.create({ baseURL: API_BASE });

if (isDemoMode) {
  // Simulate the whole backend locally so the UI can be designed and reviewed
  // without Postgres / FastAPI / Supabase. Flip VITE_DEMO_MODE=false to hit the
  // real API — page code does not change.
  api.defaults.adapter = demoAdapter;
} else {
  api.interceptors.request.use(async (config) => {
    if (!supabase) return config;
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) {
      config.headers.Authorization = `Bearer ${data.session.access_token}`;
    }
    return config;
  });
}

// Normalizes backend { error, message } bodies (see docs/API_SPEC.md) so UI
// components can branch on a stable error code (e.g. "NOT_YOUR_TURN",
// "SESSION_EXPIRED", "INVALID_CREDENTIALS") instead of parsing prose.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const code = err?.response?.data?.error ?? err?.error ?? "UNKNOWN_ERROR";
    const message = err?.response?.data?.message ?? err?.message ?? "Something went wrong.";
    return Promise.reject({ code, message, raw: err });
  }
);