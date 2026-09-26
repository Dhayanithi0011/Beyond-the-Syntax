import { useCallback, useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import { Link } from "react-router-dom";
import { api } from "../../services/api";
import { isNativeToolchainReady } from "../../services/nativeRunner";
import { Markdown, SampleIO } from "../../components/Markdown";
import { Modal } from "../../components/Modal";
import { TabSwitchWatcher } from "../../components/TabSwitchWatcher";
import { Badge, StatusBadge } from "../../components/ui";
import { useToast } from "../../components/Toast";
import { useCountdown } from "../../components/Timer";

const LANGUAGES = ["c", "cpp", "java", "python"] as const;
type Language = (typeof LANGUAGES)[number];
const LANG_FULL: Record<Language, string> = { c: "C", cpp: "C++", java: "Java", python: "Python" };

const ROUND2_GUARD_CODES = new Set([
  "ROUND2_NOT_STARTED",
  "ROUND2_EXPIRED",
  "ROUND2_COMPLETED",
  "ROUND2_NOT_ACTIVE",
  "SESSION_EXPIRED",
]);

type ProblemMeta = { id: string; title: string; position: number; q_number?: number; domain?: string; difficulty?: string; max_score: number; solved: boolean; score: number; unlocked: boolean; attempted?: boolean };
type ProblemDetail = {
  id: string;
  title: string;
  position: number;
  domain?: string;
  difficulty?: string;
  max_score: number;
  statement_md: string;
  constraints_md: string;
  time_limit_ms: number;
  memory_limit_mb: number;
  sample_cases: { input: string; expected_output: string }[];
  direct_cases: { input: string; expected_output: string }[];
  test_cases: { input: string; expected_output: string }[];
};
type SessionInfo = { status: string; started_at: string | null; deadline: string | null; time_remaining_seconds: number | null; current_index: number; total_questions: number };
type ParticipantBrief = { name?: string; participant_code?: string };
type Draft = { language: Language; source_code: string };
type RunResult = { status: string; stdout: string; stderr: string; execution_time_ms: number; memory_kb: number; judge?: "real" | "simulated"; cases?: { label: string; input: string; expected: string; actual: string; passed: boolean }[] };
type SubmitResult = { status: string; execution_time_ms: number; memory_kb: number; score: number; passed: number; total: number; judge?: "real" | "simulated"; completed?: boolean; current_index?: number };
type Submission = { id: string; problem_id: string; problem_title: string; language: string; status: string; execution_time_ms: number; memory_kb: number; score: number; submitted_at: string };

const fmtMB = (kb: number) => (kb / 1024).toFixed(1);
const fmtSaveTime = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString() : null);

export default function CodingWorkspacePage() {
  const toast = useToast();

  const [problems, setProblems] = useState<ProblemMeta[]>([]);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [participant, setParticipant] = useState<ParticipantBrief | null>(null);
  const [activeId, setActiveId] = useState<string>("");
  const [detail, setDetail] = useState<ProblemDetail | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Partial<Record<Language, string>>>>({});
  const [activeLangs, setActiveLangs] = useState<Record<string, Language>>({});
  const [submissions, setSubmissions] = useState<Submission[]>([]);

  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [console, setConsole] = useState<{ kind: "run" | "submit"; result: RunResult | SubmitResult } | null>(null);

  const [completeOpen, setCompleteOpen] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnedRef = useRef<{ warn: boolean; crit: boolean }>({ warn: false, crit: false });

  const currentLang = (activeId && activeLangs[activeId]) || "cpp";
  const currentSource = (activeId && drafts[activeId]?.[currentLang]) || "";
  const current: Draft = { language: currentLang, source_code: currentSource };

  /* Locked questions redirect back to the lobby */
  const leaveToLobby = useCallback((message: string) => {
    toast.error(message);
    setTimeout(() => (window.location.href = "/round2"), 1500);
  }, [toast]);

  const guardErr = useCallback(
    (err: { code?: string; message?: string }) => {
      if (err.code && ROUND2_GUARD_CODES.has(err.code)) {
        leaveToLobby(
          err.code === "ROUND2_EXPIRED" || err.code === "SESSION_EXPIRED"
            ? "Round 2 time has ended."
            : err.code === "ROUND2_COMPLETED"
              ? "You already completed Round 2."
              : err.code === "ROUND2_NOT_STARTED"
                ? "Round 2 has not started yet."
                : "Round 2 is not running right now — returning to the Round 2 page."
        );
        return true;
      }
      if (err.code === "LOCKED") {
        toast.error("Locked — you must submit the earlier question first.");
        return true;
      }
      return false;
    },
    [leaveToLobby, toast]
  );

  const loadProblem = useCallback(async (id: string) => {
    try {
      const { data } = await api.get(`/coding/problems/${id}`);
      setDetail(data.problem);
      setActiveId(id);
      setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...(data.draft.languages ?? {}) } }));
      setActiveLangs((prev) => ({ ...prev, [id]: data.draft.language ?? "python" }));
      setConsole(null);
    } catch (e) {
      guardErr(e as { code?: string; message?: string });
    }
  }, [guardErr]);

  const refreshProblems = useCallback(async () => {
    try {
      const { data } = await api.get("/coding/problems");
      setProblems(data.problems);
      if (data.session) setSession(data.session);
      if (data.participant) setParticipant(data.participant);
      return data;
    } catch {
      /* non-critical refresh — keep the current list */
      return null;
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/coding/problems");
        setProblems(data.problems);
        setSession(data.session ?? null);
        setParticipant(data.participant ?? null);
        const idx = Math.max(0, data.session?.current_index ?? 0);
        const first = data.problems?.find((p: ProblemMeta) => p.unlocked) ?? data.problems?.[idx] ?? data.problems?.[0];
        if (first) loadProblem(first.id);
      } catch (e) {
        guardErr(e as { code?: string; message?: string });
      }
    })();
    api.get("/coding/submissions").then(({ data }) => setSubmissions(data.submissions)).catch(() => {});
  }, [loadProblem, guardErr]);

  const persist = useCallback(
    async (problemId: string, draft: Draft): Promise<boolean> => {
      setSaveState("saving");
      try {
        await api.post("/coding/save", { problem_id: problemId, language: draft.language, source_code: draft.source_code });
        setSaveState("saved");
        setLastSaved(new Date().toISOString());
        return true;
      } catch (e) {
        guardErr(e as { code?: string; message?: string });
        setSaveState("error");
        return false;
      }
    },
    [guardErr]
  );

  const onCodeChange = (value?: string) => {
    if (!activeId || !currentLang) return;
    const langAtEdit = currentLang;
    setSaveState("saving");
    setDrafts((prev) => ({ ...prev, [activeId]: { ...prev[activeId], [langAtEdit]: value ?? "" } }));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => persist(activeId, { language: langAtEdit, source_code: value ?? "" }), 1200);
  };

  const changeLanguage = (lang: Language) => {
    if (!activeId) return;
    const existing = drafts[activeId]?.[lang];
    const nextSource = existing || starterFor(lang);
    setDrafts((prev) => ({ ...prev, [activeId]: { ...prev[activeId], [lang]: nextSource } }));
    setActiveLangs((prev) => ({ ...prev, [activeId]: lang }));
    if (!existing) persist(activeId, { language: lang, source_code: nextSource });
  };

  const manualSave = async () => {
    if (!activeId) return;
    const ok = await persist(activeId, current);
    if (ok) toast.success("Code saved");
    else if (saveState === "error") toast.error("Could not save — check your connection and try again.");
  };

  const runCode = async () => {
    if (!activeId || viewOnly) return;
    setRunning(true);
    setConsole(null);
    try {
      if ((current.language === "c" || current.language === "cpp") && !isNativeToolchainReady()) {
        toast.info("Preparing the in-browser compiler — the first run downloads the toolchain (~90 MB)");
      }
      const { data } = await api.post("/coding/run", {
        problem_id: activeId,
        language: current.language,
        source_code: current.source_code,
      });
      const r = data as RunResult;
      setConsole({ kind: "run", result: r });
      if (r.status === "accepted") {
        toast.success("Successfully run — all sample cases passed.");
      } else if (r.status === "compilation_error") {
        toast.error("Compilation failed — check the output panel for the compiler message.");
      } else if (r.status === "runtime_error") {
        toast.error("Runtime error — check the output panel.");
      } else {
        toast.error("Some test cases did not pass — check the output panel.");
      }
    } catch (e) {
      const err = e as { code?: string; message?: string };
      if (!guardErr(err)) toast.error(err.message || "Run failed — are you still connected?");
    } finally {
      setRunning(false);
    }
  };

  const submitCode = async () => {
    if (!activeId || viewOnly) return;
    setSubmitting(true);
    try {
      const { data } = await api.post("/coding/submit", {
        problem_id: activeId,
        language: current.language,
        source_code: current.source_code,
      });
      const r = data as SubmitResult;
      setConsole({ kind: "submit", result: r });
      setSubmissions((prev) => [
        {
          id: data.submission_id,
          problem_id: activeId,
          problem_title: detail?.title ?? "",
          language: current.language,
          status: r.status,
          execution_time_ms: r.execution_time_ms,
          memory_kb: r.memory_kb,
          score: r.score,
          submitted_at: new Date().toISOString(),
        },
        ...prev,
      ]);
      toast[r.status === "accepted" ? "success" : "error"](
        r.status === "accepted" ? `Accepted — ${r.passed}/${r.total} hidden tests passed, +${r.score} pts.` : `Not accepted yet — ${r.status.replace("_", " ")}.`
      );
      const fresh = await refreshProblems();
      if (r.completed) {
        setTimeout(() => {
          window.location.href = "/round2";
        }, 1800);
        return;
      }
      const problemsNow = fresh?.problems?.length ? fresh.problems : problems;
      const next = problemsNow.find((p: ProblemMeta) => p.unlocked);
      if (next && next.id !== activeId) loadProblem(next.id);
    } catch (e) {
      const err = e as { code?: string; message?: string };
      if (!guardErr(err)) toast.error(err.message || "Submission failed — try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const doComplete = async () => {
    setCompleteOpen(false);
    setCompleting(true);
    try {
      const { data } = await api.post("/coding/complete", {});
      toast.success(data.message ?? "Round 2 complete");
      setTimeout(() => (window.location.href = "/round2"), 1200);
    } catch (e) {
      const err = e as { code?: string; message?: string };
      if (!guardErr(err)) toast.error("Could not close the round right now — try again.");
      setCompleting(false);
    }
  };

  /* Single shared deadline for all 3 dealt problems — server-authoritative. */
  const { ms: deadlineMs, label: deadlineLabel, expired: deadlineExpired } = useCountdown(session?.deadline ?? null);

  useEffect(() => {
    if (session?.deadline == null) return;
    if (deadlineMs <= 0) {
      toast.warning("Time is up — Round 2 has ended for you.");
      setTimeout(() => (window.location.href = "/round2"), 1500);
    } else if (deadlineMs <= 60_000 && !warnedRef.current.crit) {
      warnedRef.current.crit = true;
      toast.warning("60 seconds left — final warning.");
    } else if (deadlineMs <= 120_000 && !warnedRef.current.warn) {
      warnedRef.current.warn = true;
      toast.warning("2 minutes remaining.");
    }
  }, [deadlineMs, session?.deadline, toast]);

  const openCount = problems.filter((p) => p.solved).length;
  const openLabel = session ? `${session.current_index}/${session.total_questions || problems.length || 3} cleared` : `${openCount} cleared`;
  const headerName = participant?.name ?? "Participant";
  const headerCode = participant?.participant_code ? ` · ${participant.participant_code}` : "";
  const activeProblem = problems.find((p) => p.id === activeId);
  const viewOnly = !!activeProblem?.attempted;

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-line bg-surface/60 px-4 py-2.5">
        <Link to="/round2" className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/15 text-sm text-primary">{"</>"}</span>
          <span className="text-sm font-semibold">{session?.status === "active" ? "Round 2 — Coding Sprint" : "Round 2"}</span>
        </Link>
        <Badge tone="success" className="hidden sm:inline-flex">
          ● {openLabel}
        </Badge>
        <span className="mx-2 hidden h-6 w-px bg-soft sm:block" />
        <span className="hidden max-w-40 truncate text-xs text-muted sm:inline">
          {headerName}
          {headerCode}
        </span>

        <span className="text-xs text-muted">
          {saveState === "error"
            ? "⚠ Save failed — reconnect"
            : saveState === "saving"
              ? "Saving…"
              : saveState === "saved" && lastSaved
                ? `✓ Saved · ${fmtSaveTime(lastSaved)}`
                : ""}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <button className="btn-secondary px-2.5 py-1.5 text-xs" onClick={() => setHistoryOpen(true)}>
            Submissions ({submissions.length})
          </button>
          <button
            className="btn-secondary px-2.5 py-1.5 text-xs"
            onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}
            aria-label="Enter fullscreen"
          >
            ⛶
          </button>
          <div className="ml-2 text-right">
            <p className="text-[10px] uppercase tracking-wider text-muted">Shared timer · all 3 problems</p>
            {session?.deadline ? (
              <p className={`font-mono text-lg font-semibold tabular-nums ${deadlineExpired ? "text-danger animate-pulse" : "text-text"}`}>{deadlineLabel}</p>
            ) : (
              <p className="font-mono text-lg font-semibold text-muted">—</p>
            )}
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Problems sidebar */}
        <aside className="shrink-0 overflow-x-auto border-b border-line bg-surface/40 lg:w-56 lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <div className="p-3">
            <p className="mb-2 px-1 text-[11px] font-medium uppercase tracking-wider text-muted">
              Your dealt problems · Q1 → Q{(session?.total_questions ?? problems.length) || 3}
            </p>
            <div className="flex gap-2 lg:flex-col lg:gap-1.5">
              {problems.map((p) => {
                const done = p.attempted || p.solved;
                const locked = !p.unlocked && !done;
                return (
                  <button
                    key={p.id}
                    disabled={locked}
                    title={
                      locked
                        ? "Locked — submit the earlier question to open this one."
                        : p.solved
                          ? "Solved — view this question"
                          : done
                            ? "Submitted — view this question"
                            : "Open problem"
                    }
                    onClick={() => loadProblem(p.id)}
                    className={`flex min-w-max items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-colors lg:min-w-0 ${
                      p.id === activeId
                        ? "bg-primary/15 text-primary"
                        : locked
                          ? "cursor-not-allowed opacity-40"
                          : "text-muted hover:bg-soft hover:text-text"
                    }`}
                  >
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${p.solved ? "bg-success" : locked ? "bg-line/60" : done ? "bg-warning/70" : "bg-line"}`}
                      aria-hidden
                    />
                    <span className={`text-sm font-medium ${p.solved ? "text-success line-through decoration-success" : ""}`}>
                      {p.solved ? "✓ " : locked ? "🔒 " : done ? "✓ " : ""}Q{p.q_number ?? p.position}· {p.title}
                    </span>
                    {p.difficulty && <span className="ml-auto rounded border border-line bg-soft px-1 text-[10px] text-muted">{p.difficulty}</span>}
                    {p.score > 0 && <span className="ml-auto font-mono text-xs text-success">{p.score}</span>}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 hidden rounded-lg border border-line bg-soft p-3 text-xs text-muted lg:block">
              <p>The three dealt problems open in strict order — Q1 first, then Q2, then Q3. The next question only opens once you submit the current one correctly, or pass at least one hidden test case.</p>
              <p className="mt-2">Solved questions are struck through and stay viewable (read-only). A question you moved past is permanently locked for editing. The single shared timer covers all three.</p>
            </div>
          </div>
        </aside>

        {/* Statement + editor + console */}
        <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
          {/* Statement */}
          <section
            className="copy-protected min-h-0 flex-1 overflow-y-auto border-b border-line p-5 sm:p-6 xl:w-1/2 xl:border-b-0 xl:border-r"
            onCopy={(e) => e.preventDefault()}
            onContextMenu={(e) => e.preventDefault()}
            onDragStart={(e) => e.preventDefault()}
          >
            {detail ? (
              <div className="max-w-prose animate-fade-in">
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <Badge tone="primary">Q{detail.position}</Badge>
                  {detail.difficulty && <Badge tone={detail.difficulty === "hard" ? "danger" : detail.difficulty === "medium" ? "warning" : "muted"}>{detail.difficulty}</Badge>}
                  {detail.domain && <Badge tone="muted">{detail.domain}</Badge>}
                  <span className="ml-auto flex gap-3 text-xs text-muted">
                    <span>⏱ {detail.time_limit_ms} ms</span>
                    <span>🧠 {detail.memory_limit_mb} MB</span>
                    <span className="text-primary">◇ {detail.max_score} pts</span>
                  </span>
                </div>
                <h1 className="text-xl font-semibold">{detail.title}</h1>
                <div className="mt-4">
                  <Markdown>{detail.statement_md}</Markdown>
                </div>

                <div className="mt-6">
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted">Constraints</p>
                  <Markdown>{detail.constraints_md}</Markdown>
                </div>

                <div className="mt-6 space-y-3">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Sample cases</p>
                  <p className="text-xs text-muted">Worked examples with explanations — evaluated when you press Run.</p>
                  {detail.sample_cases.map((c, i) => (
                    <SampleIO key={i} title={`Sample ${i + 1}`} input={c.input} output={c.expected_output} />
                  ))}
                </div>

                {detail.direct_cases.length > 0 && (
                  <div className="mt-6 space-y-3">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Direct test cases — self-check</p>
                    <p className="text-xs text-muted">Pressing Run evaluates these too. Submitting also checks 5 hidden tests.</p>
                    {detail.direct_cases.map((c, i) => (
                      <SampleIO key={i} title={`Test ${i + 1}`} input={c.input} output={c.expected_output} />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted">Loading problem…</p>
            )}
          </section>

          {/* Editor + console */}
          <div className="flex min-h-0 flex-1 flex-col border-t border-line bg-[#0d1117] xl:w-1/2 xl:border-t-0">
            {/* IDE-style tab chrome (editor zone) */}
            <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface/95 px-3 py-1.5">
              <span className="flex gap-1.5" aria-hidden>
                <span className="h-2.5 w-2.5 rounded-full bg-danger/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
              </span>
              <span className="mx-1 h-4 w-px bg-line" aria-hidden />
              <span className="rounded-md bg-soft px-2 py-0.5 font-mono text-[11px] text-text">
                {(detail?.title ?? "problem").toLowerCase().replace(/\s+/g, "-")}.
                <span className="text-primary">{current.language}</span>
              </span>
              <span className="hidden sm:block text-[10px] font-medium uppercase tracking-widest text-muted">
                {LANG_FULL[current.language]} · Source code
              </span>
              {viewOnly && (
                <span className="rounded-md border border-warning/30 bg-warning/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning">
                  Read-only — already submitted
                </span>
              )}
              <div className="ml-auto flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">
                  Language
                  <select
                    className="input w-auto py-1 text-[11px] font-normal normal-case tracking-normal"
                    value={current.language}
                    onChange={(e) => changeLanguage(e.target.value as Language)}
                    disabled={viewOnly}
                    aria-label="Select language"
                  >
                    {LANGUAGES.map((l) => (
                      <option key={l} value={l}>{LANG_FULL[l]}</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col">
              <EditorWrapper
                language={current.language}
                code={current.source_code}
                onChange={onCodeChange}
                fileName={detail?.title ?? "main"}
                readOnly={viewOnly}
              />
            </div>

            {/* Results panel — intentionally light & report-like, distinct from the editor */}
            <div className="h-48 shrink-0 border-t border-line bg-surface">
              <div className="flex items-center justify-between gap-3 border-b border-line bg-soft px-3 py-1.5">
                <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                  <span className="grid h-5 w-5 place-items-center rounded-md bg-primary/10 font-mono text-[10px] text-primary">›_</span>
                  Console · Output
                </p>
                <div className="flex items-center gap-2">
                  {console?.kind === "run" && <StatusBadge status={console.result.status} />}
                  {console?.kind === "submit" && <StatusBadge status={(console.result as SubmitResult).status} />}
                  {console?.result.judge === "simulated" && (
                    <span className="hidden rounded-md border border-warning/30 bg-warning/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-warning sm:inline">
                      Demo judge · simulated
                    </span>
                  )}
                  {console && (
                    <>
                      <span className="font-mono text-[11px] text-muted">{(console.result as RunResult).execution_time_ms} ms</span>
                      <span className="font-mono text-[11px] text-muted">{fmtMB((console.result as RunResult).memory_kb)} MB</span>
                    </>
                  )}
                </div>
              </div>
              <div className="h-[calc(100%-2rem)] overflow-y-auto p-3 font-mono text-xs text-text">
                {running ? (
                  <p className="text-primary animate-pulse">Compiling & running locally against the visible cases…</p>
                ) : submitting ? (
                  <p className="text-primary animate-pulse">Compiling & judging locally against the hidden tests…</p>
                ) : console?.kind === "submit" ? (
                  <SubmitConsole result={console.result as SubmitResult} />
                ) : console ? (
                  <RunConsole result={console.result as RunResult} />
                ) : (
                  <div className="grid h-full place-items-center text-center">
                    <div>
                      <p className="text-base text-text/40">No output yet</p>
                      <p className="mt-1 text-[11px] text-muted">
                        Press <span className="font-semibold text-primary">▶ Run Code</span> to test your solution — results appear here.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line bg-surface/80 px-3 py-2.5">
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button className="btn-secondary text-xs" onClick={manualSave} disabled={saveState === "saving" || !activeId || viewOnly}>
            {saveState === "saving" ? "Saving…" : "Save"}
          </button>
          <button className="btn-primary text-xs" onClick={runCode} disabled={running || !activeId || viewOnly}>
            {running ? "Running…" : viewOnly ? "View only" : "▶ Run Code"}
          </button>
          <button className="btn-success text-xs" onClick={submitCode} disabled={submitting || !activeId || viewOnly}>
            {submitting ? "Submitting…" : viewOnly ? "Locked" : "Submit"}
          </button>
          <span className="mx-1 h-4 w-px bg-line" aria-hidden />
          <button className="btn-secondary border-danger/30 text-danger hover:bg-danger/10 text-xs" onClick={() => setCompleteOpen(true)} disabled={completing}>
            {completing ? "Closing round…" : "Finish Round 2 Early"}
          </button>
        </div>
      </footer>

      {/* Early completion confirm */}
      <Modal
        open={completeOpen}
        onClose={() => setCompleteOpen(false)}
        title="Finish Round 2 early?"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setCompleteOpen(false)}>Keep coding</button>
            <button className="btn-primary" onClick={doComplete}>Yes, close the round</button>
          </>
        }
      >
        <p className="text-sm">
          This <span className="font-medium text-text">ends Round 2 for you right now</span> — your solved problems and
          scores are locked in, and you cannot come back for more time.
        </p>
        <p className="mt-2 text-sm text-muted">Time left on the shared timer is discarded. There is no undo.</p>
      </Modal>

      {/* Submissions */}
      <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} title="Submission history" wide>
        {submissions.length === 0 ? (
          <p className="text-sm text-muted">No submissions yet.</p>
        ) : (
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {submissions.map((s, i) => (
              <div key={s.id} className="flex items-center gap-3 rounded-lg border border-line bg-soft px-3 py-2.5 text-sm">
                <span className="font-mono text-xs text-muted">#{submissions.length - i}</span>
                <span className="min-w-0 flex-1 truncate">
                  {s.problem_title} <span className="ml-1 text-xs text-muted">· {LANG_FULL[s.language as Language] ?? s.language}</span>
                </span>
                <StatusBadge status={s.status} />
                <span className="hidden font-mono text-xs text-muted sm:block">{s.execution_time_ms} ms</span>
                <span className="font-mono text-xs text-primary">{s.score} pts</span>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <TabSwitchWatcher context="the Round 2 coding sprint" notifyUrl="/coding/tab-switch" />
    </div>
  );
}

function EditorWrapper({
  language,
  code,
  onChange,
  fileName,
  readOnly = false,
}: {
  language: Language;
  code: string;
  onChange: (value?: string) => void;
  fileName: string;
  readOnly?: boolean;
}) {
  return (
    <Editor
      height="100%"
      language={language}
      value={code}
      theme="vs-dark"
      onChange={onChange}
      path={`${fileName}.${language}`}
      options={{
        fontFamily: "JetBrains Mono, monospace",
        fontSize: 14,
        minimap: { enabled: false },
        automaticLayout: true,
        scrollBeyondLastLine: false,
        tabSize: 4,
        padding: { top: 12 },
        renderLineHighlight: "all",
        scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
        readOnly,
      }}
    />
  );
}

function RunConsole({ result }: { result: RunResult }) {
  if (result.stderr) {
    return (
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-danger">Compilation / runtime error</p>
        <pre className="whitespace-pre-wrap rounded-lg border border-danger/25 bg-danger/5 p-3 leading-relaxed text-danger/90">{result.stderr}</pre>
      </div>
    );
  }
  const cases = result.cases ?? [];
  return (
    <div className="space-y-3">
      {result.judge === "simulated" && (
        <p className="rounded-md border border-warning/25 bg-warning/10 px-2.5 py-1.5 text-[11px] text-warning">
          Demo judge: this language runs in simulated mode in the preview. The real backend grader will execute it.
        </p>
      )}
      {cases.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {cases.map((t) => (
            <div
              key={t.label}
              className={`rounded-lg border px-3 py-2 ${t.passed ? "border-success/30 bg-success/5" : "border-danger/30 bg-danger/5"}`}
            >
              <p className={`flex items-center gap-1.5 text-xs font-semibold ${t.passed ? "text-success" : "text-danger"}`}>
                <span aria-hidden>{t.passed ? "✓" : "✕"}</span> {t.label}
              </p>
              {!t.passed && (
                <pre className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-muted">
{`expected: ${t.expected}
got:      ${t.actual}`}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
      {result.stdout && (
        <div>
          <p className="mb-1 text-[10px] font-medium uppercase tracking-widest text-muted">Program output</p>
          <pre className="whitespace-pre-wrap rounded-lg border border-line bg-soft p-3 leading-relaxed text-text">{result.stdout}</pre>
        </div>
      )}
      <p className="text-[11px] text-muted">
        ✓ Ran {cases.length ? `${cases.filter((c) => c.passed).length}/${cases.length} cases passed` : ""} in {result.execution_time_ms} ms · {fmtMB(result.memory_kb)} MB
      </p>
    </div>
  );
}

function SubmitConsole({ result }: { result: SubmitResult }) {
  const ok = result.status === "accepted";
  return (
    <div className={`rounded-lg border p-3 ${ok ? "border-success/30 bg-success/5" : "border-danger/30 bg-danger/5"}`}>
      <p className={`text-base font-semibold ${ok ? "text-success" : "text-danger"}`}>
        {ok ? "✓ Accepted" : `✕ ${result.status.replace(/_/g, " ")}`}
      </p>
      <p className="mt-1 text-xs text-muted">
        {result.passed}/{result.total} hidden test cases passed · {result.execution_time_ms} ms · {fmtMB(result.memory_kb)} MB ·{" "}
        <span className="font-semibold text-primary">+{result.score} pts</span>
      </p>
      {ok && result.completed && <p className="mt-1 text-xs text-success">✓ That was your final problem — Round 2 complete!</p>}
    </div>
  );
}

function starterFor(lang: Language): string {
  const starters: Record<Language, string> = {
    c: `#include <stdio.h>

int main() {
    // Read input from stdin, compute the answer, print it
    return 0;
}
`,
    cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    // Read input from stdin, compute the answer, print it
    return 0;
}
`,
    java: `import java.util.*;
import java.io.*;

public class Main {
    public static void main(String[] args) throws Exception {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        // Read input from stdin, compute the answer, print it
    }
}
`,
    python: `import sys

def main():
    data = sys.stdin.read().split()
    # Parse input from data, compute the answer, print it

if __name__ == "__main__":
    main()
`,
  };
  return starters[lang];
}