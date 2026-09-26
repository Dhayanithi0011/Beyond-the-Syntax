import { ReactNode } from "react";
import { Link } from "react-router-dom";

export type Tone = "primary" | "success" | "warning" | "danger" | "muted" | "info";

const TONES: Record<Tone, string> = {
  primary: "bg-primary/15 text-primary border-primary/25",
  success: "bg-success/15 text-success border-success/25",
  warning: "bg-warning/15 text-warning border-warning/25",
  danger: "bg-danger/15 text-danger border-danger/25",
  muted: "bg-soft text-muted border-line",
  info: "bg-sky-500/15 text-sky-400 border-sky-500/25",
};

export function Badge({ tone = "muted", children, className = "" }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONES[tone]} ${className}`}>
      {children}
    </span>
  );
}

export function StatCard({
  label,
  value,
  icon,
  hint,
  tone = "primary",
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  hint?: string;
  tone?: Tone;
}) {
  return (
    <div className="card p-5 animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted">{label}</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
          {hint && <p className="mt-1 text-xs text-muted/70">{hint}</p>}
        </div>
        {icon && <span className={`grid h-10 w-10 place-items-center rounded-lg text-lg ${TONES[tone]}`}>{icon}</span>}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="card grid place-items-center px-6 py-16 text-center">
      {icon && <div className="mb-3 text-3xl" aria-hidden>{icon}</div>}
      <h3 className="font-semibold text-text">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      aria-label="Loading"
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-line border-t-primary ${className}`}
    />
  );
}

export function Avatar({ name, color = "#6366F1", size = "md", className = "" }: { name: string; color?: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const sizes = { sm: "h-7 w-7 text-xs", md: "h-9 w-9 text-sm", lg: "h-12 w-12 text-base" };
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${sizes[size]} ${className}`}
      style={{ background: `${color}26`, color }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function NavLink({ to, children, className = "" }: { to: string; children: ReactNode; className?: string }) {
  return (
    <Link to={to} className={`text-muted hover:text-text transition-colors ${className}`}>
      {children}
    </Link>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className = "",
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={`inline-flex rounded-lg border border-line bg-soft p-0.5 ${className}`} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            value === o.value ? "bg-primary text-white" : "text-muted hover:text-text"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const STATUS_TEXT: Record<string, { label: string; tone: Tone }> = {
  qualified: { label: "Qualified", tone: "success" },
  not_qualified: { label: "Not qualified", tone: "danger" },
  pending: { label: "Pending", tone: "warning" },
  in_progress: { label: "In progress", tone: "info" },
  submitted: { label: "Submitted", tone: "success" },
  auto_submitted: { label: "Auto-submitted", tone: "warning" },
  not_submitted: { label: "Not started", tone: "muted" },
  active: { label: "Active", tone: "success" },
  completed: { label: "Completed", tone: "success" },
  paused: { label: "Paused", tone: "warning" },
  expired: { label: "Expired", tone: "danger" },
  accepted: { label: "Accepted", tone: "success" },
  wrong_answer: { label: "Wrong Answer", tone: "danger" },
  compilation_error: { label: "Compilation Error", tone: "warning" },
  runtime_error: { label: "Runtime Error", tone: "danger" },
  tle: { label: "Time Limit Exceeded", tone: "warning" },
  mle: { label: "Memory Limit Exceeded", tone: "warning" },
  not_started: { label: "Not started", tone: "muted" },
  registration_open: { label: "Registration open", tone: "success" },
  registration_closed: { label: "Registration closed", tone: "muted" },
  round1_active: { label: "Round 1 active", tone: "info" },
  round1_closed: { label: "Round 1 closed", tone: "muted" },
  qualification_done: { label: "Qualification done", tone: "success" },
  teams_created: { label: "Teams created", tone: "info" },
  round2_active: { label: "Round 2 active", tone: "primary" },
  round2_closed: { label: "Round 2 closed", tone: "muted" },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS_TEXT[status] ?? { label: status, tone: "muted" as Tone };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}