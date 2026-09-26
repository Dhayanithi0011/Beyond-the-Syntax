import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../services/api";
import { Badge, StatusBadge } from "../../components/ui";
import { SkeletonLines } from "../../components/Skeleton";

type Competition = {
  name: string;
  tagline: string;
  state: string;
  round1_duration_seconds: number;
  round2_team_duration_seconds: number;
  round1_questions: number;
  round2_problems: number;
  participants_accepted: number;
  round2_ends_at: string | null;
};

const fmtDur = (s: number) =>
  s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : `${Math.floor(s / 60)} minutes`;

export default function LandingPage() {
  const [comp, setComp] = useState<Competition | null>(null);

  useEffect(() => {
    api.get("/competition").then(({ data }) => setComp(data)).catch(() => {});
  }, []);

  return (
    <div>
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(60% 50% at 20% 0%, rgba(99,102,241,0.14) 0%, transparent 60%), radial-gradient(50% 40% at 90% 10%, rgba(34,197,94,0.07) 0%, transparent 60%)",
          }}
        />
        <div className="relative mx-auto max-w-7xl px-4 pb-20 pt-16 sm:px-6 sm:pt-24">
          <div className="mx-auto max-w-3xl text-center">
            <Badge tone="primary" className="mb-5">
              Inter-college coding championship · 2026
            </Badge>
            <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
              Beyond The <span className="text-primary">Syntax</span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-lg text-muted">
              A two-round competitive programming experience — an individual technical quiz, then a
              three-member <span className="font-medium text-text">coding relay</span> on a shared timer.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link to="/quiz" className="btn-primary px-6 py-3 text-base">Enter Round 1</Link>
              <Link to="/team" className="btn-secondary px-6 py-3 text-base">Round 2 — Coding Relay</Link>
            </div>
            {comp ? (
              <div className="mx-auto mt-10 max-w-md">
                <div className="card flex items-center justify-between p-4 text-left">
                  <div>
                    <p className="text-xs text-muted">Relay team budget</p>
                    <p className="text-2xl font-semibold tabular-nums text-text">
                      {fmtDur(comp.round2_team_duration_seconds)}
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted/70">Runs only while a member is working — pauses on handoff</p>
                  </div>
                  <StatusBadge status={comp.state} />
                </div>
              </div>
            ) : (
              <div className="mx-auto mt-10 max-w-md"><SkeletonLines lines={2} /></div>
            )}
          </div>
        </div>
      </section>

      {comp && (
        <section className="border-y border-line bg-surface/40">
          <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-4 py-8 sm:grid-cols-3 sm:px-6 lg:grid-cols-5">
            {[
              { k: `${comp.participants_accepted}`, v: "Registered" },
              { k: `${comp.round1_questions}`, v: "Quiz questions" },
              { k: fmtDur(comp.round1_duration_seconds), v: "Round 1 duration" },
              { k: `${comp.round2_problems}`, v: "Relay problems" },
              { k: fmtDur(comp.round2_team_duration_seconds), v: "Team budget" },
            ].map((s) => (
              <div key={s.v} className="text-center">
                <p className="text-2xl font-semibold tabular-nums text-primary">{s.k}</p>
                <p className="mt-1 text-xs text-muted">{s.v}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">How the competition flows</h2>
        <p className="mx-auto mt-2 max-w-lg text-center text-sm text-muted">
          Two rounds, one championship. Every decision — timers, grading, rankings — is enforced by the server.
        </p>

        <div className="mt-10 grid gap-4 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-stretch">
          <RoundCard
            tag="ROUND 1"
            title="Individual Quiz"
            tone="primary"
            points={["30-minute technical MCQ round", "Randomized questions & options per participant", "Auto-submit at time, rankings shared after the round"]}
          />
          <Arrow />
          <RoundCard
            tag="QUALIFY"
            title="Admin Selects"
            tone="warning"
            points={["Qualification is explicit, never automatic", "Score first, fastest time breaks ties", "Round 2 access granted server-side"]}
          />
          <Arrow />
          <RoundCard
            tag="ROUND 2"
            title="Coding Relay"
            tone="success"
            points={["Teams of 3, one shared 45-minute budget", "Clock runs only during a member's turn — pauses on handoff", "C / C++ / Java / Python in a Monaco editor"]}
          />
        </div>
      </section>

      <section className="border-t border-line bg-surface/40">
        <div className="mx-auto max-w-7xl px-4 py-16 text-center sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight">Ready when you are</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            Qualified participants receive access to their team's relay workspace from the organizers.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link to="/quiz" className="btn-primary px-6 py-3">Start Round 1</Link>
            <Link to="/rules" className="btn-secondary px-6 py-3">Read the rules</Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function RoundCard({ tag, title, tone, points }: { tag: string; title: string; tone: "primary" | "warning" | "success"; points: string[] }) {
  return (
    <div className="card p-6 animate-fade-in">
      <Badge tone={tone} className="mb-4">{tag}</Badge>
      <h3 className="text-lg font-semibold">{title}</h3>
      <ul className="mt-4 space-y-2.5 text-sm text-muted">
        {points.map((p) => (
          <li key={p} className="flex gap-2.5">
            <span className="mt-0.5 text-primary">▹</span>
            {p}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Arrow() {
  return (
    <div className="hidden items-center justify-center text-2xl text-primary/60 md:flex" aria-hidden>
      →
    </div>
  );
}