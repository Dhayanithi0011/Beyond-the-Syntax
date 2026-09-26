import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../services/api";
import { Badge, StatusBadge } from "../../components/ui";
import { SkeletonLines } from "../../components/Skeleton";
import { Modal } from "../../components/Modal";

type Competition = {
  name: string;
  state: string;
  round1_duration_seconds: number;
  round1_questions: number;
};

type Attempt = {
  status: string;
  time_taken_seconds: number | null;
  submitted_at: string | null;
};

const R2_SEEN_KEY = "bs-round2-seen";

export default function QuizLobbyPage() {
  const navigate = useNavigate();
  const [comp, setComp] = useState<Competition | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [starting, setStarting] = useState(false);
  const [selectedPopup, setSelectedPopup] = useState(false);
  const [teamStatus, setTeamStatus] = useState<string>("none");

  useEffect(() => {
    api.get("/competition").then(({ data }) => setComp(data)).catch(() => {});
    api.get("/quiz/attempt").then(({ data }) => setAttempt(data)).catch(() => {});
    api
      .get("/teams/status")
      .then(({ data }) => {
        setTeamStatus(data?.team_status ?? "none");
        if (data?.qualified && !localStorage.getItem(R2_SEEN_KEY)) {
          setSelectedPopup(true);
        }
      })
      .catch(() => {});
  }, []);

  const dismissSelected = () => {
    localStorage.setItem(R2_SEEN_KEY, "1");
    setSelectedPopup(false);
  };

  const submitted = attempt?.status === "submitted" || attempt?.status === "auto_submitted";
  const roundOpen = comp?.state === "round1_active";
  const stateCopy =
    !comp || comp.state === "registration_open"
      ? "Registration is open. Round 1 unlocks when the organizers start it — check back then."
      : comp.state === "round1_active"
      ? "Round 1 is live — take your time and good luck!"
      : `Round 1 is currently ${comp.state}.`;

  const start = async () => {
    setStarting(true);
    const { data } = await api.post("/quiz/start").catch((err) => ({ data: null, err }));
    if (!data?.attempt_id && data === null) {
      setStarting(false);
      return;
    }
    navigate("/quiz/attempt");
  };

  return (
    <section className="mx-auto grid min-h-[85vh] max-w-3xl place-items-center px-4 py-12">
      <div className="w-full">
        <div className="card overflow-hidden animate-fade-in">
          <div className="relative border-b border-line p-7 pb-20">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{ background: "radial-gradient(60% 120% at 50% 0%, rgba(99,102,241,0.16) 0%, transparent 70%)" }}
            />
            <div className="relative">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Badge tone="primary">Round 1 · Individual Quiz</Badge>
                <StatusBadge status={comp?.state ?? "round1_active"} />
              </div>
              <h1 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
                {comp ? comp.name : "Beyond The Syntax 2026"}
              </h1>
              <p className="mt-2 max-w-lg text-sm text-muted">
                30 MCQs on C programming — syntax, control flow, arrays, functions, pointers and recursion.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-px border-b border-line bg-soft sm:grid-cols-4">
            {[
              { k: comp ? `${Math.floor(comp.round1_duration_seconds / 60)} min` : "30 min", v: "Duration" },
              { k: comp ? `${comp.round1_questions}` : "15", v: "Questions" },
              { k: "Random", v: "Order per participant" },
              { k: "Auto-submit", v: "At 00:00" },
            ].map((s) => (
              <div key={s.v} className="bg-surface px-4 py-4 text-center">
                <p className="font-mono text-lg font-semibold text-primary">{s.k}</p>
                <p className="mt-0.5 text-[11px] text-muted">{s.v}</p>
              </div>
            ))}
          </div>

          <div className="p-7">
            <div className="mb-6 rounded-xl border border-line bg-soft p-4 text-sm text-muted">
              {stateCopy}
            </div>

            <div className="space-y-3 rounded-xl border border-line bg-soft p-4 text-sm text-muted">
              <p className="flex gap-3"><span className="text-success">✓</span> Questions and options are shuffled uniquely for you.</p>
              <p className="flex gap-3"><span className="text-success">✓</span> Holders of skipped questions are marked clearly in the navigator.</p>
              <p className="flex gap-3"><span className="text-warning">⚠</span> Switching tabs or leaving fullscreen is recorded and may be reviewed.</p>
              <p className="flex gap-3"><span className="text-danger">✕</span> Once submitted, you cannot retake the quiz.</p>
            </div>

            {submitted ? (
              <div className="mt-6 space-y-4">
                <div className="rounded-xl border border-success/30 bg-success/10 p-4 text-center">
                  <p className="text-xs uppercase tracking-wider text-muted">Round 1 completed</p>
                  <p className="mt-2 text-sm text-success">
                    Your answers were submitted successfully. Results are shared by the organizers after the round.
                  </p>
                </div>
                <button className="btn-secondary w-full py-3" onClick={() => navigate("/")}>Back to home</button>
              </div>
            ) : roundOpen ? (
              <>
                <button className="btn-primary mt-6 w-full py-3 text-base" onClick={start} disabled={starting}>
                  {starting ? "Starting…" : attempt ? "Resume quiz →" : "Start quiz →"}
                </button>
                <p className="mt-3 text-center text-xs text-muted">
                  Once submitted, you cannot retake the quiz. Rankings are published by the organizers.
                </p>
              </>
            ) : (
              <div className="mt-6 rounded-xl border border-warning/30 bg-warning/10 p-4 text-center text-sm text-warning">
                The quiz is not open yet — the organizers will launch Round 1 here.
              </div>
            )}
          </div>
        </div>
        {!comp && (
          <div className="mt-6"><SkeletonLines lines={2} /></div>
        )}
      </div>

      <Modal
        open={selectedPopup}
        onClose={dismissSelected}
        title="You're selected for Round 2! 🎉"
        footer={
          <>
            <button className="btn-secondary" onClick={dismissSelected}>Later</button>
            <button className="btn-primary" onClick={() => { dismissSelected(); navigate("/team"); }}>
              {teamStatus === "none" ? "Form your team →" : "Go to your team →"}
            </button>
          </>
        }
      >
        <p className="text-sm">
          Congratulations — you've made it to Round 2: the coding relay.
        </p>
        {teamStatus === "none" ? (
          <>
            <p className="mt-2 text-sm">
              Form a team of 3 qualified members (team name + member names) and submit it for admin approval.
            </p>
            <p className="mt-2 text-sm text-muted">
              Your team gets <span className="font-semibold text-text">45 minutes total — 15 minutes each</span>.
              When a member's time ends, their editor locks and the next member takes over.
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted">
            Your team has been {teamStatus === "pending" ? "submitted for admin approval — the organizers will start your relay once they approve it." : "approved — get ready for the coding relay."}
          </p>
        )}
      </Modal>
    </section>
  );
}