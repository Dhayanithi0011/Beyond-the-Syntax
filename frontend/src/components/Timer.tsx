import { useEffect, useMemo, useState } from "react";

/**
 * Server-authoritative countdown display. It only ever counts DOWN from the
 * deadline it is given — it never invents or extends time. The source of truth
 * remains the backend (the shared session / quiz deadline).
 */
export function useCountdown(deadline: Date | string | null) {
  const target = useMemo(() => (deadline ? new Date(deadline).getTime() : null), [deadline]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!target) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [target]);

  const ms = target ? Math.max(target - now, 0) : 0;
  const mm = Math.floor(ms / 60000);
  const ss = Math.floor((ms % 60000) / 1000);

  return {
    ms,
    label: `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`,
    longLabel: `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`,
    expired: ms <= 0,
  };
}

const LEVELS = {
  normal: { cls: "text-text bg-soft border-line", icon: "⏱" },
  warning: { cls: "text-warning bg-warning/15 border-warning/30", icon: "⚠" },
  critical: { cls: "text-danger bg-danger/15 border-danger/40", icon: "⚠" },
} as const;

type TimerLevel = keyof typeof LEVELS;

export function TimerDisplay({
  deadline,
  level,
  className = "",
  format = "mm:ss",
}: {
  deadline: Date | string | null;
  level?: TimerLevel;
  className?: string;
  format?: "mm:ss" | "hh:mm:ss";
}) {
  const { label, longLabel, expired } = useCountdown(deadline);
  const effectiveLevel: TimerLevel = expired ? "critical" : level ?? "normal";
  const { cls, icon } = LEVELS[effectiveLevel];

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 font-mono text-lg font-semibold tabular-nums ${cls} ${expired ? "animate-pulse" : ""} ${className}`}
      role="timer"
      aria-live="polite"
      aria-label={`Time remaining ${expired ? "expired" : effectiveLevel === "normal" ? "normal" : effectiveLevel}`}
    >
      <span aria-hidden>{icon}</span>
      {format === "hh:mm:ss" ? longLabel : label}
    </span>
  );
}