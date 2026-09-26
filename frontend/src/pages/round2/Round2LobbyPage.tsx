import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../services/api";
import { Badge, StatusBadge } from "../../components/ui";
import { SkeletonLines } from "../../components/Skeleton";
import { useCountdown } from "../../components/Timer";
import { useAuth } from "../../contexts/AuthContext";

type R2Session = {
  status: string;
  started_at: string | null;
  deadline: string | null;
  time_remaining_seconds: number | null;
  current_index: number;
  total_questions: number;
};

type Round2Status = {
  qualified: boolean;
  qualification_status: string;
  your_participant_code: string;
  competition_state: string;
  round2_duration_seconds: number;
  session: R2Session | null;
};

const SLOT_STYLE: Record<string, { label: string; cls: string; mark: string }> = {
  solved: { label: "Solved", cls: "border-success/40 bg-success/10 text-success", mark: "✓" },
  open: { label: "In progress", cls: "border-primary/40 bg-primary/10 text-primary", mark: "●" },
  locked: { label: "Locked", cls: "border-line bg-soft text-muted", mark: "🔒" },
};

export default function Round2LobbyPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [status, setStatus] = useState<Round2Status | null>(null);
  const [entering, setEntering] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/round2/status");
      setStatus(data);
    } catch {
      /* keep the last snapshot on transient failures */
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  }, [load]);

  const { label, expired } = useCountdown((status?.session as R2Session | null | undefined)?.deadline ?? null);

  if (!status) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <SkeletonLines lines={6} />
      </div>
    );
  }

  const session = status.session;
  const closed = status.competition_state === "round2_closed";

  /* ------------------------------------------------------------------ */
  /* Not selected for Round 2                                            */
  /* ------------------------------------------------------------------ */
  if (!status.qualified) {
    return (
      <section className="mx-auto max-w-xl px-4 py-10 sm:px-6">
        <div className="card animate-fade-in p-8 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-soft text-2xl" aria-hidden>🏁</span>
          <h1 className="mt-4 text-xl font-semibold tracking-tight">Round 2 is invite only</h1>
          <p className="mt-2 text-sm text-muted">
            Only the top performers from Round 1, decided by the organizing committee, are selected.
            Check back here after the results are announced.
          </p>
          <button className="btn-secondary mt-6 w-full py-2.5" onClick={() => navigate("/")}>Back to home</button>
        </div>
      </section>
    );
  }

  /* ------------------------------------------------------------------ */
  /* Qualified, round not launched yet                                   */
  /* ------------------------------------------------------------------ */
  if (!session) {
    return (
      <section className="mx-auto max-w-xl px-4 py-10 sm:px-6">
        <div className="card animate-fade-in">
          <div className="border-b border-line p-7 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/15 text-2xl" aria-hidden>🎉</div>
            <h1 className="mt-4 text-xl font-semibold tracking-tight">You're in Round 2!</h1>
            <p className="mt-1 text-sm text-muted">
              The individual coding sprint starts when the organizers launch it for all qualified participants.
            </p>
          </div>
          <div className="p-7 text-center">
            {closed ? (
              <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
                Round 2 has ended — this round is closed.
              </div>
            ) : (
              <>
                <span className="inline-grid h-12 w-12 place-items-center rounded-full bg-warning/15 text-xl" aria-hidden>⏳</span>
                <h2 className="mt-3 font-semibold">Waiting for the round to start</h2>
                <p className="mt-1 text-sm text-muted">
                  Everyone starts at the same time. Each participant is dealt 3 problems
                  (Q1 → Q2 → Q3) with a shared {Math.round(status.round2_duration_seconds / 60)}-minute timer — refresh when the launch is announced.
                </p>
                <div className="mt-5 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-line bg-soft">
                  {[1, 2, 3].map((n) => (
                    <div key={n} className="bg-surface p-4 text-center">
                      <p className="font-mono text-lg font-semibold text-primary">Q{n}</p>
                      <p className="mt-0.5 text-[11px] text-muted">{n === 1 ? "opens first" : "opens after Q" + (n - 1)}</p>
                    </div>
                  ))}
                </div>
                <button className="btn-secondary mt-6 w-full py-2.5" onClick={load}>Refresh status</button>
              </>
            )}
          </div>
        </div>
      </section>
    );
  }

  /* ------------------------------------------------------------------ */
  /* Finished — completed early or the timer ran out                     */
  /* ------------------------------------------------------------------ */
  if (session.status === "completed" || session.status === "expired") {
    const finished = session.status === "completed";
    const slots = Array.from({ length: Math.max(session.total_questions, 3) }, (_, i) => ({
      n: i + 1,
      state: i < session.current_index ? "solved" : i === session.current_index ? "open" : "locked",
    }));
    return (
      <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="card overflow-hidden animate-fade-in">
          <div className="flex items-center gap-4 border-b border-line p-7">
            <span
              className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-2xl ${finished ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}
              aria-hidden
            >
              {finished ? "✓" : "⏳"}
            </span>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">{finished ? "Round 2 complete!" : "Round 2 time ended"}</h1>
              <StatusBadge status={finished ? "completed" : "expired"} />
            </div>
          </div>
          <div className="p-7">
            {finished ? (
              <p className="text-sm text-muted">
                You finished your dealt questions — your solutions and scores are locked in. Results are published by the organizers.
              </p>
            ) : (
              <p className="text-sm text-muted">
                Your shared 45-minute budget has run out. All progress is locked in and no further work is possible.
              </p>
            )}
            <div className="mt-5 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-line bg-soft">
              {slots.map((s) => {
                const st = SLOT_STYLE[s.state] ?? SLOT_STYLE.locked;
                return (
                  <div key={s.n} className="bg-surface p-4 text-center">
                    <p className="text-lg">{st.mark}</p>
                    <p className="mt-1 font-mono text-sm font-semibold text-text">Q{s.n}</p>
                    <span className={`mt-1 inline-block rounded-md border px-2 py-0.5 text-[10px] font-medium ${st.cls}`}>{st.label}</span>
                  </div>
                );
              })}
            </div>
            <button className="btn-secondary mt-6 w-full py-2.5" onClick={() => navigate("/")}>Back to home</button>
          </div>
        </div>
      </section>
    );
  }

  /* ------------------------------------------------------------------ */
  /* Live session — one shared timer, strict Q1→Q2→Q3                    */
  /* ------------------------------------------------------------------ */
  const slots = Array.from({ length: Math.max(session.total_questions, 3) }, (_, i) => ({
    n: i + 1,
    state: i < session.current_index ? "solved" : i === session.current_index ? "open" : "locked",
  }));

  const enter = () => {
    setEntering(true);
    navigate("/coding");
    setEntering(false);
  };

  return (
    <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="card overflow-hidden animate-fade-in">
        <div className="relative border-b border-line p-7">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: "radial-gradient(60% 120% at 80% 0%, rgba(99,102,241,0.14) 0%, transparent 70%)" }}
          />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-semibold tracking-tight">Individual Coding Sprint</h1>
                  <StatusBadge status={session.status} />
                </div>
                <p className="mt-0.5 text-sm text-muted">
                  {user?.name ?? "Participant"} · {status.your_participant_code} — 3 problems, one shared timer
                </p>
              </div>
            </div>
            <div className="rounded-xl border border-line bg-soft px-4 py-2.5 text-center">
              <p className="text-[11px] uppercase tracking-wider text-muted">Time left</p>
              <p className={`font-mono text-xl font-semibold tabular-nums ${expired ? "text-danger animate-pulse" : "text-text"}`}>
                {session.deadline ? label : "—"}
              </p>
              <p className="mt-0.5 text-[10px] text-muted/70">Same clock for all 3 questions</p>
            </div>
          </div>
        </div>
        <div className="p-7">
          <p className="mb-4 text-sm font-semibold text-muted">Your dealt problems — solve them in order</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {slots.map((s) => {
              const st = SLOT_STYLE[s.state] ?? SLOT_STYLE.locked;
              return (
                <div key={s.n} className="rounded-xl border border-line bg-soft p-4 text-center">
                  <p className="text-2xl" aria-hidden>{st.mark}</p>
                  <p className="mt-1 font-mono text-base font-semibold text-text">Problem {s.n}</p>
                  <span className={`mt-2 inline-block rounded-md border px-2.5 py-1 text-xs font-medium ${st.cls}`}>{st.label}</span>
                  {s.state === "locked" && (
                    <p className="mt-2 text-[11px] text-muted">Completes after you submit Q{s.n - 1}</p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-7 grid gap-px overflow-hidden rounded-xl border border-line bg-soft sm:grid-cols-2">
            <div className="bg-surface p-4">
              <p className="text-xs text-muted">Started</p>
              <p className="mt-1 font-mono text-sm font-semibold tabular-nums">
                {session.started_at ? new Date(session.started_at).toLocaleTimeString() : "—"}
              </p>
            </div>
            <div className="bg-surface p-4">
              <p className="text-xs text-muted">Deadline</p>
              <p className="mt-1 font-mono text-sm font-semibold tabular-nums">
                {session.deadline ? new Date(session.deadline).toLocaleTimeString() : "—"}
              </p>
            </div>
          </div>

          {closed || expired ? (
            <div className="mt-7 rounded-xl border border-warning/30 bg-warning/10 p-4 text-center text-sm text-warning">
              Round 2 has been closed by the organizers.
            </div>
          ) : (
            <>
              <button className="btn-primary mt-7 w-full py-3 text-base" onClick={enter} disabled={entering}>
                {entering ? "Opening workspace…" : "Enter coding workspace →"}
              </button>
              <p className="mt-3 flex items-center gap-2 text-xs text-muted">
                <span className="text-warning">⚠</span> Only the open question is editable. Submitting locks it for good —
                there is no going back to edit or re-submit earlier problems.
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}