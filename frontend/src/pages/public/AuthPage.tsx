import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { api } from "../../services/api";
import { useToast } from "../../components/Toast";
import { Spinner } from "../../components/ui";
import { useAuth } from "../../contexts/AuthContext";
import { isDemoMode } from "../../services/mock";

type Tab = "login" | "register";

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
  minLength,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  autoComplete?: string;
  minLength?: number;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <div className="relative">
        <input
          id={id}
          type={show ? "text" : "password"}
          className="input pr-10"
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          minLength={minLength}
          required
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted transition-colors hover:text-text"
        >
          {show ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
    </div>
  );
}

const isThrottled = (err: any) =>
  err?.status === 429 ||
  err?.code === 429 ||
  err?.error === "RATE_LIMITED" ||
  /too many request|rate limit|429/i.test(err?.message ?? "");

const throttleMessage =
  "The sign-in/sign-up service is temporarily throttling this connection (too many attempts). Please wait a few minutes and try again.";

const loginErrorMessage = (err: any) => {
  if (isThrottled(err)) return throttleMessage;
  if (err?.code === "NOT_FOUND") return "No account found with that email, register number, or phone — check the ID or register first.";
  if (err?.code === "INVALID_CREDENTIALS") return "Incorrect password. Please try again.";
  return err?.message ?? "Something went wrong. Please try again.";
};

export default function AuthPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user, signOut } = useAuth();

  const [tab, setTab] = useState<Tab>("login");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [form, setForm] = useState({
    name: "",
    participantCode: "",
    contact: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const isAdminId = (id: string) => id.trim().toLowerCase().startsWith("admin");

  const handleSignOut = async () => {
    setLoading(true);
    await signOut();
    setLoading(false);
    navigate("/");
  };

  const submitLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (isDemoMode) {
      if (isAdminId(identifier)) {
        await api.post("/admin/login", { email: identifier, password });
        toast.success("Signed in as Dr. Sarah Lin (demo)");
        navigate("/admin");
      } else {
        toast.success("Signed in as Aarav Mehta (demo)");
        navigate("/quiz");
      }
      setLoading(false);
      return;
    }

    if (!supabase) {
      toast.error("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
      setLoading(false);
      return;
    }

    try {
      const { data } = await api.post("/auth/login", { identifier, password });
      await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token ?? "",
      });
      // Route by the backend-resolved role — admin -> /admin, participant -> /quiz.
      navigate(data.user.role === "admin" ? "/admin" : "/quiz");
    } catch (err: any) {
      toast.error(loginErrorMessage(err));
      setLoading(false);
    }
  };

  const submitRegister = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (isDemoMode) {
      setTimeout(() => {
        setLoading(false);
        toast.success("Registration received. You can now take Round 1.");
        navigate("/quiz");
      }, 700);
      return;
    }

    if (!supabase) {
      toast.error("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
      setLoading(false);
      return;
    }

    const contact = form.contact.trim();
    const hasEmail = contact.includes("@");
    const phone = hasEmail ? "" : contact;

    if (!hasEmail && !phone) {
      toast.error("Enter your mobile number or Gmail.");
      setLoading(false);
      return;
    }

    // Server-signed identity: the real Gmail when given, otherwise null so the
    // backend synthesizes a stable account email from the register number.
    const signupEmail = hasEmail ? contact : null;
    const fallbackEmail = hasEmail ? contact : `${form.participantCode.trim().toLowerCase()}@syntax.event`;

    try {
      // Preferred path: server-side signup via the Supabase admin API (auto
      // confirms the email, no public-signup rate limit, mobile-only works).
      const { data } = await api.post("/auth/signup", {
        name: form.name,
        email: signupEmail,
        participant_code: form.participantCode,
        phone: phone || null,
        password: form.password,
      });
      if (data.access_token) {
        await supabase.auth.setSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token ?? "",
        });
        toast.success(`Welcome, ${data.user.name}! You can now take Round 1.`);
        navigate("/quiz");
      } else {
        // Account created + confirmed; Supabase just throttled the session token.
        toast.success("Account created. Sign in with your email and password.");
        setTab("login");
        setIdentifier(data.user.email ?? fallbackEmail);
      }
    } catch (err: any) {
      if (err?.code === "NOT_CONFIGURED") {
        // No service-role key yet — legacy browser-side signup fallback.
        const { data, error } = await supabase.auth.signUp({
          email: fallbackEmail,
          password: form.password,
        });
        if (error) throw error;

        if (!data.session) {
          if (!hasEmail) {
            toast.error("A Gmail is required to create a login on this instance — please register with your Gmail.");
          } else {
            toast.success("Account created — confirm your email, then sign in.");
          }
          setLoading(false);
          return;
        }

        await api.post("/auth/register", {
          name: form.name,
          email: fallbackEmail,
          participant_code: form.participantCode,
          phone: phone || null,
        });
        toast.success(`Welcome, ${form.name}! You can now take Round 1.`);
        navigate("/quiz");
      } else if (err?.code === "ALREADY_REGISTERED") {
        toast.error("This email, register number, or phone is already registered — sign in instead.");
        setTab("login");
        setIdentifier(fallbackEmail);
      } else {
        toast.error(isThrottled(err) ? throttleMessage : err?.message ?? "Registration failed.");
      }
      setLoading(false);
    }
  };

  return (
    <section className="mx-auto grid min-h-[75vh] max-w-md place-items-center px-4">
      <div className="card w-full p-7 animate-fade-in">
        <div className="mb-6 text-center">
          <span className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl bg-primary/15 text-primary">{"{ }"}</span>
          <h1 className="text-xl font-semibold">Beyond The Syntax</h1>
          <p className="mt-1 text-sm text-muted">One account for participants and organizers.</p>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-1 rounded-lg bg-soft p-1">
          <button
            type="button"
            onClick={() => setTab("login")}
            className={`rounded-md py-2 text-sm font-medium transition-colors ${tab === "login" ? "bg-bg text-text shadow-sm" : "text-muted hover:text-text"}`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => setTab("register")}
            className={`rounded-md py-2 text-sm font-medium transition-colors ${tab === "register" ? "bg-bg text-text shadow-sm" : "text-muted hover:text-text"}`}
          >
            Register
          </button>
        </div>

        {tab === "login" ? (
          <form onSubmit={submitLogin} className="space-y-4">
            <div>
              <label htmlFor="identifier" className="label">Email, register number, or phone</label>
              <input
                id="identifier"
                className="input"
                placeholder="you@college.edu · CST25-042 · 98765 43210"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                autoComplete="username"
                required
              />
            </div>
            <PasswordField
              id="password"
              label="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />
            <p className="text-[11px] text-muted">
              Organizers: sign in with your admin Gmail &amp; password — the admin console opens here too.
            </p>
            <button className="btn-primary w-full py-2.5" disabled={loading}>
              {loading ? <Spinner /> : "Sign in"}
            </button>
          </form>
        ) : (
          <form onSubmit={submitRegister} className="space-y-4">
            <div>
              <label htmlFor="re-name" className="label">Full name</label>
              <input id="re-name" className="input" placeholder="Aarav Mehta" value={form.name} onChange={set("name")} required />
            </div>
            <div>
              <label htmlFor="re-code" className="label">Register number</label>
              <input id="re-code" className="input" placeholder="e.g. CST25-042" value={form.participantCode} onChange={set("participantCode")} required />
            </div>
            <div>
              <label htmlFor="re-contact" className="label">Mobile number or Gmail</label>
              <input
                id="re-contact"
                className="input"
                placeholder="98765 43210 or you@college.edu"
                value={form.contact}
                onChange={set("contact")}
                required
              />
              <p className="mt-1.5 text-[11px] text-muted">
                Your Gmail becomes the login ID; a mobile number is stored for contact. You can still sign in later with your register number.
              </p>
            </div>
            <PasswordField
              id="re-password"
              label="Password"
              value={form.password}
              onChange={set("password")}
              placeholder="8+ characters"
              autoComplete="new-password"
              minLength={8}
            />
            <button className="btn-primary w-full py-2.5" disabled={loading}>
              {loading ? <Spinner /> : "Create account"}
            </button>
          </form>
        )}

        {user && (
          <p className="mt-5 text-center text-sm text-muted">
            Signed in as {user.name}.{" "}
            <button type="button" className="text-primary hover:underline" onClick={handleSignOut} disabled={loading}>
              Sign out
            </button>
          </p>
        )}
      </div>
    </section>
  );
}