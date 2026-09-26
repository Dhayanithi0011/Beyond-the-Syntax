import { useCallback, useEffect, useState } from "react";
import { api } from "../../services/api";
import { Badge, EmptyState, PageHeader, Spinner, StatusBadge } from "../../components/ui";
import { Modal } from "../../components/Modal";
import { SkeletonLines } from "../../components/Skeleton";
import { useToast } from "../../components/Toast";

type Dealt = { q_number: number; problem_id: string; title: string; score: number; solved: boolean };
type R2Session = {
  id: string;
  participant_id: string;
  participant_code: string;
  name: string;
  status: "not_started" | "active" | "completed" | "expired";
  started_at: string | null;
  deadline: string | null;
  time_remaining_seconds: number | null;
  current_index: number;
  total_questions: number;
  dealt: Dealt[];
  score: number;
  solved_count: number;
};

type Round2Admin = {
  sessions: R2Session[];
  competition_state: string;
  round2_duration_seconds: number;
};

const fmtClock = (s: number) => {
  if (s <= 0) return "0:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
};

export default function Round2Page() {
  const toast = useToast();
  const [data, setData] = useState<Round2Admin | null>(null);
  const [loading, setLoading] = useState(true);
  const [startOpen, setStartOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resetId, setResetId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/admin/round2");
      setData(data);
    } catch {
      /* transient — keep the last snapshot */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, [load]);

  const startRound = async () => {
    setStartOpen(false);
    setBusy(true);
    try {
      const { data } = await api.post("/admin/round2/start", {});
      toast.success(data.message ?? `Round 2 started for ${data.total_sessions} participants.`);
      load();
    } catch (e) {
      toast.error((e as { message?: string }).message || "Could not start Round 2.");
    } finally {
      setBusy(false);
    }
  };

  const closeRound = async () => {
    setCloseOpen(false);
    setBusy(true);
    try {
      const { data } = await api.post("/admin/round2/close", {});
      toast.success(data.message ?? "Round 2 closed.");
      load();
    } catch (e) {
      toast.error((e as { message?: string }).message || "Could not close Round 2.");
    } finally {
      setBusy(false);
    }
  };

  const resetSession = async (id: string) => {
    setResetId(id);
    try {
      await api.post(`/admin/round2/${id}/reset`, {});
      toast.success("Session reset — participant can restart with a fresh deal.");
      load();
    } catch (e) {
      toast.error((e as { message?: string }).message || "Reset failed.");
    } finally {
      setResetId(null);
    }
  };

  const active = data?.competition_state === "round2_active";
  const mins = Math.round((data?.round2_duration_seconds ?? 2700) / 60);
  const counts = data?.sessions.reduce(
    (acc, s) => {
      acc[s.status] = (acc[s.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div>
      <PageHeader
        title="Round 2 — Individual Coding Sprint"
        subtitle={active ? "Round is live — sessions tick against their shared 45-minute timer."
          : "Not launched. Starting deals 3 problems (Q1→Q2→Q3) to every qualified participant."}
        actions={
          <>
            {active ? (
              <button className="btn-secondary border-danger/30 text-danger hover:bg-danger/10" onClick={() => setCloseOpen(true)}>
                Close Round 2
              </button>
            ) : (
              <button className="btn-primary" onClick={() => setStartOpen(true)}>
                Start Round 2
              </button>
            )}
          </>
        }
      />

      {loading ? (
        <SkeletonLines lines={7} />
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { k: `${data?.sessions.length ?? 0}`, v: "Sessions dealt" },
              { k: `${counts?.active ?? 0}`, v: "In progress" },
              { k: `${counts?.completed ?? 0}`, v: "Completed" },
              { k: `${counts?.expired ?? 0}`, v: "Expired" },
            ].map((s) => (
              <div key={s.v} className="card px-4 py-3">
                <p className="text-xl font-semibold tabular-nums text-primary">{s.k}</p>
                <p className="mt-0.5 text-xs text-muted">{s.v}</p>
              </div>
            ))}
          </div>

          {data && data.sessions.length === 0 ? (
            <EmptyState
              icon="🚀"
              title="No Round 2 sessions yet"
              description="No participants have been qualified. Qualify participants first, then start the round to deal their problems."
            />
          ) : (
            <div className="space-y-3">
              {data?.sessions.map((s) => (
                <div key={s.id} className="card p-4 animate-fade-in">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className={`h-2.5 w-2.5 rounded-full ${s.status === "active" ? "bg-success animate-pulse" : s.status === "completed" ? "bg-success/60" : s.status === "expired" ? "bg-danger" : "bg-line"}`} aria-hidden />
                    <div className="min-w-0">
                      <p className="truncate font-semibold">
                        {s.name}
                        <span className="ml-2 font-mono text-xs font-normal text-muted">{s.participant_code}</span>
                      </p>
                      <p className="text-[11px] text-muted">
                        Q{s.current_index}/{s.total_questions} solved · {s.solved_count} problems · {s.score} pts
                      </p>
                    </div>
                    <div className="mx-2 hidden h-6 w-px bg-soft sm:block" />
                    <StatusBadge status={s.status} />
                    {s.status === "active" && s.deadline && (
                      <span className="font-mono text-xs text-muted">⏳ {fmtClock((s.deadline ? new Date(s.deadline).getTime() - Date.now() : 0) / 1000)}</span>
                    )}
                    <div className="ml-auto flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-1.5">
                        {Array.from({ length: Math.max(s.total_questions, 3) }, (_, i) => (i + 1)).map((n) => {
                          const dealt = s.dealt.find((d) => d.q_number === n);
                          const solved = dealt?.solved;
                          const at = n <= s.current_index;
                          return (
                            <span
                              key={n}
                              title={dealt ? dealt.title : "Not dealt"}
                              className={`grid h-7 w-7 place-items-center rounded-md border text-xs font-semibold ${
                                solved ? "border-success/40 bg-success/10 text-success"
                                  : at ? "border-primary/40 bg-primary/10 text-primary"
                                    : "border-line bg-soft text-muted"
                              }`}
                            >
                              {solved ? "✓" : n}
                            </span>
                          );
                        })}
                      </div>
                      {s.status === "active" && (
                        <>
                          <span className="mx-1 h-4 w-px bg-line" aria-hidden />
                          <button
                            className="btn-secondary px-2 py-1 text-[11px]"
                            disabled={resetId === s.id}
                            onClick={() => resetSession(s.id)}
                          >
                            {resetId === s.id ? "Resetting…" : "Reset deal"}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {s.dealt.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-3">
                      {s.dealt
                        .slice()
                        .sort((a, b) => a.q_number - b.q_number)
                        .map((d) => (
                          <span key={d.problem_id} className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] ${d.solved ? "border-success/30 bg-success/10 text-success" : "border-line bg-soft text-muted"}`}>
                            <Badge tone={d.solved ? "success" : "muted"} className="!px-1.5 !py-0 text-[9px]">Q{d.q_number}</Badge>
                            <span className="max-w-40 truncate">{d.title}</span>
                            {d.score > 0 && <span className="font-mono text-success">{d.score}</span>}
                          </span>
                        ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <p className="mt-5 text-center text-[11px] text-muted">
            Dealt serverside: Q1 → Q2 → Q3 in strict order against a single {mins}-minute shared timer. Reset re-deals from the shuffle deck.
          </p>
        </>
      )}

      {/* Start confirm */}
      <Modal
        open={startOpen}
        onClose={() => setStartOpen(false)}
        title="Start Round 2?"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setStartOpen(false)}>Cancel</button>
            <button className="btn-primary" onClick={startRound} disabled={busy}>{busy ? "Starting…" : "Yes, start it"}</button>
          </>
        }
      >
        <p className="text-sm">
          Every currently-qualified participant gets dealt 3 problems and a shared {mins}-minute timer, starting immediately.
          Those already in a live session keep theirs.
        </p>
        <p className="mt-2 text-sm text-muted">Problems are dealt from the shuffle deck — no one can preview them before launch.</p>
      </Modal>

      {/* Close confirm */}
      <Modal
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        title="Close Round 2?"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setCloseOpen(false)}>Cancel</button>
            <button className="btn-primary" onClick={closeRound} disabled={busy}>{busy ? "Closing…" : "Close the round"}</button>
          </>
        }
      >
        <p className="text-sm">
          Closes the round for everyone — active sessions are locked, further coding and submissions are rejected,
          and the winner calculations run over the standings as they are.
        </p>
        {busy && (
          <p className="mt-3 flex items-center gap-2 text-xs text-muted"><Spinner className="h-3 w-3" /> Working…</p>
        )}
      </Modal>
    </div>
  );
}