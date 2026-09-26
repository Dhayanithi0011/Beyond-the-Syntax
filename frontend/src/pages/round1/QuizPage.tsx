import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../services/api";
import { useToast } from "../../components/Toast";
import { Modal } from "../../components/Modal";
import { TabSwitchWatcher } from "../../components/TabSwitchWatcher";

type Question = {
  question_id: string;
  text: string;
  options: { label: string; text: string }[];
  category?: string;
};

type TimerState = "normal" | "warning" | "critical";

export default function QuizPage() {
  const toast = useToast();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [deadline, setDeadline] = useState<Date | null>(null);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const [remainingMs, setRemainingMs] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const submittedRef = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/quiz/questions");
        setQuestions(data.questions);
        setDeadline(new Date(data.deadline));
      } catch (err: any) {
        setLoadError(
          err?.code === "NOT_FOUND"
            ? "Your quiz hasn't started yet."
            : err?.message ?? "Could not load the quiz. Please try again."
        );
      }
    })();
  }, []);

  /* Server-authoritative countdown; auto-submit at zero. */
  useEffect(() => {
    if (!deadline) return;
    const tick = () => {
      const ms = deadline.getTime() - Date.now();
      setRemainingMs(Math.max(ms, 0));
      if (ms <= 0) doSubmit(true);
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [deadline]);

  /* Anti-cheat deterrents (CSS + events). Not real security — answer keys live server-side. */
  useEffect(() => {
    const block = (e: Event) => e.preventDefault();
    const blockKeys = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && ["c", "x", "u", "p", "s"].includes(e.key.toLowerCase())) e.preventDefault();
      if (e.key === "F12") e.preventDefault();
    };
    document.addEventListener("contextmenu", block);
    document.addEventListener("copy", block);
    document.addEventListener("cut", block);
    document.addEventListener("keydown", blockKeys);
    return () => {
      document.removeEventListener("contextmenu", block);
      document.removeEventListener("copy", block);
      document.removeEventListener("cut", block);
      document.removeEventListener("keydown", blockKeys);
    };
  }, []);

  /* Record tab/hidden switches as suspicious activity markers.
     The popup itself lives in <TabSwitchWatcher> below; it reports each
     switch to /quiz/tab-switch so admins see it in the audit trail. */
  useEffect(() => {
    let hiddenSince = 0;
    const onVisibility = () => {
      if (document.hidden) hiddenSince = Date.now();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const selectAnswer = useCallback((questionId: string, label: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: label }));
    api.post("/quiz/answer", { question_id: questionId, selected_option: label }).catch(() => {});
  }, []);

  const toggleMarked = useCallback((questionId: string) => {
    setMarked((prev) => {
      const next = new Set(prev);
      next.has(questionId) ? next.delete(questionId) : next.add(questionId);
      return next;
    });
  }, []);

  const doSubmit = async (auto: boolean) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    try {
      const { data } = await api.post("/quiz/submit");
      void data;
      toast.success(auto ? "Time's up — your quiz was auto-submitted." : "Quiz submitted — your answers have been recorded.");
    } catch {
      toast.error("Could not submit. Please check your connection.");
      submittedRef.current = false;
    } finally {
      setTimeout(() => {
        window.location.href = "/quiz";
      }, 900);
    }
  };

  const q = questions[current];
  const answeredCount = Object.keys(answers).length;
  const mm = String(Math.floor(remainingMs / 60000)).padStart(2, "0");
  const ss = String(Math.floor((remainingMs % 60000) / 1000)).padStart(2, "0");
  const timerState: TimerState = remainingMs <= 30_000 ? "critical" : remainingMs <= 120_000 ? "warning" : "normal";

  const cellState = (i: number) => {
    const id = questions[i]?.question_id;
    if (!id) return "empty";
    if (marked.has(id)) return "marked";
    if (answers[id]) return "answered";
    return "unanswered";
  };

  if (loadError)
    return (
      <div className="min-h-screen grid place-items-center px-4">
        <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-8 text-center">
          <p className="text-sm text-muted">{loadError}</p>
          <a href="/quiz" className="btn-primary mt-5 inline-flex w-full justify-center py-2.5 text-sm">
            ← Back to Round 1
          </a>
        </div>
      </div>
    );

  if (!q) return <div className="min-h-screen grid place-items-center text-muted">Loading questions…</div>;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-line bg-surface/60 px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">Beyond The Syntax — Round 1</p>
          <p className="hidden text-xs text-muted sm:block">
            {answeredCount}/{questions.length} answered
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 font-mono text-lg font-semibold tabular-nums ${
            timerState === "critical"
              ? "border-danger/40 bg-danger/15 text-danger animate-pulse"
              : timerState === "warning"
              ? "border-warning/30 bg-warning/15 text-warning"
              : "border-line bg-soft text-text"
          }`}
          role="timer"
          aria-live="polite"
        >
          <span aria-hidden>{timerState === "normal" ? "⏱" : "⚠"}</span>
          {mm}:{ss}
        </span>
        <button className="btn-danger hidden sm:inline-flex" onClick={() => setConfirmOpen(true)} disabled={submitting}>
          Submit Quiz
        </button>
      </header>

      <main className="flex flex-1 flex-col lg:flex-row">
        {/* Question panel */}
        <div className="quiz-protected flex-1 px-5 py-8 sm:px-10">
          <div className="mx-auto max-w-2xl">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted">
                Question {current + 1}
                {q.category && (
                  <>
                    <span className="mx-1 text-muted/30">·</span>
                    {q.category}
                  </>
                )}
              </p>
              <button
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  marked.has(q.question_id)
                    ? "border-warning/40 bg-warning/15 text-warning"
                    : "border-line bg-soft text-muted hover:text-text"
                }`}
                onClick={() => toggleMarked(q.question_id)}
              >
                {marked.has(q.question_id) ? "★ Marked for review" : "☆ Mark for review"}
              </button>
            </div>

            <h2 className={`${q.text.includes("\n") ? "whitespace-pre-wrap font-mono text-[13px] leading-relaxed" : "text-xl font-medium leading-relaxed"}`}>{q.text}</h2>

            <div className="mt-7 space-y-3">
              {q.options.map((opt, i) => {
                const selected = answers[q.question_id] === opt.label;
                const codeLike = /[;{}()="'%&<>+*/]/.test(opt.text) && opt.text.length > 3;
                return (
                  <label
                    key={opt.label}
                    className={`block cursor-pointer rounded-xl border p-4 transition-colors ${
                      selected ? "border-primary bg-primary/10" : "border-line bg-surface hover:border-primary/40"
                    }`}
                  >
                    <span className="flex items-start gap-3">
                      <span
                        className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border text-xs font-semibold ${
                          selected ? "border-primary bg-primary text-white" : "border-line text-muted"
                        }`}
                      >
                        {opt.label}
                      </span>
                      <span className={`text-sm leading-relaxed ${codeLike ? "font-mono" : ""}`}>{opt.text}</span>
                    </span>
                    <input
                      type="radio"
                      name={`q-${q.question_id}`}
                      className="sr-only"
                      checked={selected}
                      onChange={() => selectAnswer(q.question_id, opt.label)}
                      aria-label={`Option ${opt.label}: ${opt.text}`}
                    />
                  </label>
                );
              })}
            </div>

            <div className="mt-8 flex items-center justify-between">
              <button className="btn-secondary" disabled={current === 0} onClick={() => setCurrent((c) => c - 1)}>
                ← Previous
              </button>
              {current < questions.length - 1 ? (
                <button className="btn-primary" onClick={() => setCurrent((c) => c + 1)}>
                  Next →
                </button>
              ) : (
                <button className="btn-danger sm:hidden" onClick={() => setConfirmOpen(true)}>
                  Submit Quiz
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Navigator */}
        <aside className="border-t border-line bg-surface/40 p-5 lg:w-64 lg:border-l lg:border-t-0">
          <h3 className="text-sm font-semibold">Question navigator</h3>
          <p className="mt-0.5 text-xs text-muted">{answeredCount} of {questions.length} answered</p>

          <div className="mt-4 grid grid-cols-5 gap-2 lg:grid-cols-5">
            {questions.map((qq, i) => {
              const state = cellState(i);
              return (
                <button
                  key={qq.question_id}
                  aria-label={`Question ${i + 1}, ${state}`}
                  onClick={() => setCurrent(i)}
                  className={`h-10 rounded-lg border text-sm font-medium transition-colors ${
                    i === current
                      ? "border-primary bg-primary text-white"
                      : state === "answered"
                      ? "border-success/40 bg-success/20 text-success hover:bg-success/30"
                      : state === "marked"
                      ? "border-warning/40 bg-warning/20 text-warning hover:bg-warning/30"
                      : "border-line bg-soft text-muted hover:bg-soft"
                  }`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>

          <div className="mt-5 space-y-2 text-xs text-muted">
            <p><span className="mr-2 inline-block h-3 w-3 rounded bg-success/60 align-middle" /> Answered</p>
            <p><span className="mr-2 inline-block h-3 w-3 rounded bg-warning/60 align-middle" /> Marked for review</p>
            <p><span className="mr-2 inline-block h-3 w-3 rounded border border-line bg-soft align-middle" /> Not answered</p>
          </div>
        </aside>
      </main>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Submit your quiz?"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setConfirmOpen(false)}>Keep working</button>
            <button className="btn-danger" onClick={() => doSubmit(false)} disabled={submitting}>
              {submitting ? "Submitting…" : "Confirm submit"}
            </button>
          </>
        }
      >
        <p className="text-sm">
          You answered <span className="font-semibold text-text">{answeredCount}</span> of{" "}
          <span className="font-semibold text-text">{questions.length}</span> questions.
        </p>
        <p className="mt-2 text-sm text-muted">
          {questions.length - answeredCount > 0
            ? `${questions.length - answeredCount} question${questions.length - answeredCount > 1 ? "s are" : " is"} unanswered.`
            : "All questions answered — great work."}
        </p>
        <p className="mt-2 text-sm text-warning">This action cannot be undone.</p>
      </Modal>

      <TabSwitchWatcher context="the quiz exam" notifyUrl="/quiz/tab-switch" />
    </div>
  );
}