import { useEffect, useState } from "react";
import { api } from "../../services/api";
import { StatusBadge } from "../../components/ui";
import { TableSkeleton } from "../../components/Skeleton";

type LiveTeam = {
  id: string;
  name: string;
  color: string;
  status: string;
  score: number;
  current_member_number: number;
  current_problem?: string;
  time_remaining_ms?: number;
  members?: { member_number: number; name: string; status: string }[];
};

type Live = {
  online_count: number;
  submitted_count: number;
  teams_coding: number;
  teams: LiveTeam[];
};

function TeamClock({ endAt }: { endAt: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const ms = Math.max(endAt - now, 0);
  const m = String(Math.floor(ms / 60000)).padStart(2, "0");
  const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, "0");
  const low = ms < 60_000;
  return <span className={`font-mono text-lg font-semibold tabular-nums ${low ? "text-danger animate-pulse" : "text-text"}`}>{m}:{s}</span>;
}

const M_LABEL: Record<string, string> = {
  not_started: "bg-soft",
  active: "bg-success",
  completed: "bg-primary",
  expired: "bg-danger",
  paused: "bg-warning",
};

export default function LiveMonitorPage() {
  const [live, setLive] = useState<Live | null>(null);

  useEffect(() => {
    const poll = () => api.get("/admin/live").then(({ data }) => setLive(data)).catch(() => {});
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, []);

  const endAtFor = (t: LiveTeam) => (t.time_remaining_ms != null ? Date.now() + t.time_remaining_ms : null);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Live Monitor</h1>
          <p className="mt-1 text-sm text-muted">Coding relay in progress — auto-refreshes every 5 seconds.</p>
        </div>
        {live && (
          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 text-muted"><span className="h-2 w-2 rounded-full bg-success" /> {live.online_count} online</span>
            <span className="inline-flex items-center gap-1.5 text-muted"><span className="h-2 w-2 rounded-full bg-warning" /> {live.submitted_count} submitted</span>
            <span className="inline-flex items-center gap-1.5 text-muted"><span className="h-2 w-2 rounded-full bg-primary" /> {live.teams_coding} teams coding</span>
          </div>
        )}
      </div>

      {!live ? (
        <TableSkeleton rows={4} cols={3} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {live.teams.map((t) => {
            const endAt = endAtFor(t);
            const active = t.status === "active";
            return (
              <div key={t.id} className={`card p-5 animate-fade-in ${active ? "border-success/30" : ""}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-lg" style={{ background: `${t.color}1f`, color: t.color }} aria-hidden>
                      ▲
                    </span>
                    <p className="font-semibold" style={{ color: t.color }}>{t.name}</p>
                  </div>
                  <StatusBadge status={t.status} />
                </div>

                <div className="mt-4 flex items-center justify-between rounded-lg border border-line bg-soft px-4 py-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted">
                      {t.status === "completed" ? "Status" : `Member ${t.current_member_number} · ${t.current_problem ?? ""}`}
                    </p>
                    {t.status === "active" && endAt ? (
                      <TeamClock endAt={endAt} />
                    ) : (
                      <p className="font-mono text-lg font-semibold text-muted">
                        {t.status === "completed" ? "Done ✓" : t.status === "paused" ? "Paused" : "Awaiting start"}
                      </p>
                    )}
                  </div>
                  <div className="text-right text-sm text-muted">
                    <p className="text-[10px] uppercase tracking-wider">Score</p>
                    <p className="font-mono text-xl font-semibold text-primary">{t.score.toLocaleString()}</p>
                  </div>
                </div>

                {t.members && (
                  <div className="mt-4 flex items-center justify-center gap-4" aria-label="Member status">
                    {t.members.map((m) => (
                      <div key={m.member_number} className="flex flex-col items-center gap-1.5">
                        <span className={`h-3 w-3 rounded-full ${M_LABEL[m.status] ?? "bg-soft"}`} aria-hidden />
                        <span className="text-[10px] text-muted">M{m.member_number}</span>
                      </div>
                    ))}
                    <span className="ml-1 text-[11px] text-muted">
                      {t.members.find((m) => m.status === "active")?.name ?? (t.status === "completed" ? t.members[2]?.name : "—")}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6 rounded-xl border border-line bg-soft p-4 text-xs text-muted">
        <p className="font-medium text-text">How the relay state works</p>
        <p className="mt-1">
          Timers are server-authoritative. A refresh or disconnect never resets the clock — when a member's window
          expires, the backend activates the next eligible member automatically. This screen simply renders that state.
        </p>
      </div>
    </div>
  );
}