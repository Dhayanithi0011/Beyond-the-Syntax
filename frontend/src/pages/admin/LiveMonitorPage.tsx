import { useEffect, useState } from "react";
import { api } from "../../services/api";
import { StatusBadge } from "../../components/ui";
import { TableSkeleton } from "../../components/Skeleton";

type LiveSession = {
  id: string;
  participant_code: string;
  name: string;
  status: "not_started" | "active" | "completed" | "expired";
  started_at: string | null;
  deadline: string | null;
  time_remaining_seconds: number | null;
  current_index: number;
  total_questions: number;
  score: number;
  solved_count: number;
  dealt: { q_number: number; problem_id: string; title: string; score: number; solved: boolean }[];
};

type Live = {
  online_count: number;
  submitted_count: number;
  coding_now: number;
  competition_state: string;
  sessions: LiveSession[];
};

function SessionClock({ endAt }: { endAt: number }) {
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

export default function LiveMonitorPage() {
  const [live, setLive] = useState<Live | null>(null);

  useEffect(() => {
    const poll = () => api.get("/admin/live").then(({ data }) => setLive(data)).catch(() => {});
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Live Monitor</h1>
          <p className="mt-1 text-sm text-muted">Individual Round 2 in progress — auto-refreshes every 5 seconds.</p>
        </div>
        {live && (
          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 text-muted"><span className="h-2 w-2 rounded-full bg-success" /> {live.online_count} online</span>
            <span className="inline-flex items-center gap-1.5 text-muted"><span className="h-2 w-2 rounded-full bg-warning" /> {live.submitted_count} submitted</span>
            <span className="inline-flex items-center gap-1.5 text-muted"><span className="h-2 w-2 rounded-full bg-primary" /> {live.coding_now} coding now</span>
          </div>
        )}
      </div>

      {!live ? (
        <TableSkeleton rows={4} cols={3} />
      ) : live.sessions.length === 0 ? (
        <div className="card grid place-items-center px-6 py-16 text-center">
          <div className="mb-3 text-3xl" aria-hidden>📡</div>
          <h3 className="font-semibold text-text">No Round 2 sessions</h3>
          <p className="mt-1 max-w-sm text-sm text-muted">Sessions appear here once the round is started for qualified participants.</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {live.sessions.map((t) => {
            const active = t.status === "active";
            const endAt = t.deadline ? new Date(t.deadline).getTime() : null;
            return (
              <div key={t.id} className={`card p-5 animate-fade-in ${active ? "border-success/30" : ""}`}>
                <div className="flex items-center justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary" aria-hidden>{"</>"}</span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{t.name}</p>
                      <p className="font-mono text-[11px] text-muted">{t.participant_code}</p>
                    </div>
                  </div>
                  <StatusBadge status={t.status} />
                </div>

                <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-line bg-soft px-4 py-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted">
                      {t.status === "active" ? `Shared timer · Q${t.current_index + 1 || "?"}` : "Status"}
                    </p>
                    {active && endAt ? (
                      <SessionClock endAt={endAt} />
                    ) : (
                      <p className="font-mono text-lg font-semibold text-muted">
                        {t.status === "completed" ? "Done ✓" : t.status === "expired" ? "Time up" : "Awaiting start"}
                      </p>
                    )}
                  </div>
                  <div className="text-right text-sm text-muted">
                    <p className="text-[10px] uppercase tracking-wider">Score</p>
                    <p className="font-mono text-xl font-semibold text-primary">{t.score.toLocaleString()}</p>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-center gap-4" aria-label="Dealt problems">
                  {Array.from({ length: Math.max(t.total_questions, 3) }, (_, i) => i + 1).map((n) => {
                    const dealt = t.dealt.find((d) => d.q_number === n);
                    const solved = dealt?.solved;
                    const at = n <= t.current_index;
                    return (
                      <div key={n} className="flex flex-col items-center gap-1.5">
                        <span
                          className={`grid h-2.5 w-10 place-items-center rounded-full ${solved ? "bg-success" : at && active ? "bg-primary" : "bg-line/70"}`}
                          aria-hidden
                        />
                        <span className="text-[10px] text-muted">Q{n}</span>
                      </div>
                    );
                  })}
                  <span className="ml-1 text-[11px] text-muted">
                    {t.solved_count} solved{t.solved_count > 0 ? ` · +${t.score} pts` : ""}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6 rounded-xl border border-line bg-soft p-4 text-xs text-muted">
        <p className="font-medium text-text">How the round state works</p>
        <p className="mt-1">
          Timers are server-authoritative and shared across all three dealt problems. A refresh or disconnect never resets
          the clock — when the deadline passes, the backend marks the session expired and rejects further work.
          This screen simply renders that state.
        </p>
      </div>
    </div>
  );
}