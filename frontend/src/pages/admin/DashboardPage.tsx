import { useEffect, useState } from "react";
import { api } from "../../services/api";
import { StatCard, PageHeader } from "../../components/ui";
import { SkeletonLines } from "../../components/Skeleton";
import { Link } from "react-router-dom";

type Dashboard = {
  stats: {
    total_participants: number;
    quiz_completed: number;
    qualified: number;
    round2_sessions: number;
    active_round2: number;
    completed_round2: number;
    expired_round2: number;
    avg_quiz_score: number;
    highest_quiz_score: number;
    total_submissions: number;
    accepted_submissions: number;
  };
  score_distribution: { range: string; count: number }[];
  recent_activity: { id: number; actor: string; action: string; target: string; at: string }[];
};

export default function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);

  useEffect(() => {
    api.get("/admin/dashboard").then(({ data }) => setData(data)).catch(() => {});
  }, []);

  if (!data) {
    return (
      <div>
        <SkeletonLines lines={3} />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card h-28 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const s = data.stats;
  const maxDist = Math.max(...data.score_distribution.map((d) => d.count), 1);

  return (
    <div>
      <PageHeader
        title="Competition Dashboard"
        subtitle="Beyond The Syntax 2026 · live overview of both rounds"
        actions={
          <Link to="/admin/live" className="btn-primary">Open Live Monitor</Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total participants" value={s.total_participants} icon="◉" tone="primary" />
        <StatCard label="Quiz completed" value={s.quiz_completed} icon="✓" tone="success" hint={`${Math.round((s.quiz_completed / s.total_participants) * 100)}% of registered`} />
        <StatCard
          label="Round 2"
          value={s.round2_sessions}
          icon="◧"
          tone="warning"
          hint={`${s.active_round2} active · ${s.completed_round2} completed · ${s.expired_round2} expired`}
        />
        <StatCard label="Qualified" value={s.qualified} icon="★" tone="primary" hint="Round 2 eligible" />
        <StatCard label="Average quiz score" value={s.avg_quiz_score.toFixed(1)} icon="📊" tone="primary" hint="out of 30" />
        <StatCard label="Highest quiz score" value={`${s.highest_quiz_score}/30`} icon="🏆" tone="success" />
        <StatCard label="Total submissions" value={s.total_submissions} icon="⌨" tone="info" hint="across Round 2 participants" />
        <StatCard label="Accepted" value={s.accepted_submissions} icon="%" tone="success" hint={`${Math.round((s.accepted_submissions / Math.max(s.total_submissions, 1)) * 100)}% acceptance`} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {/* Score distribution */}
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Quiz score distribution</h2>
            <span className="text-xs text-muted">{s.quiz_completed} submissions</span>
          </div>
          <div className="mt-6 space-y-3">
            {data.score_distribution.map((d) => (
              <div key={d.range} className="flex items-center gap-3">
                <span className="w-10 shrink-0 font-mono text-xs text-muted">{d.range}</span>
                <div className="h-6 flex-1 overflow-hidden rounded-md bg-soft">
                  <div
                    className="flex h-full items-center rounded-md bg-primary/70 transition-all"
                    style={{ width: `${(d.count / maxDist) * 100}%` }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right font-mono text-xs">{d.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Completion + activity */}
        <div className="flex flex-col gap-4">
          <div className="card p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Round 1 completion</h2>
              <span className="font-mono text-2xl font-semibold text-primary">{Math.round((s.quiz_completed / s.total_participants) * 100)}%</span>
            </div>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-soft">
              <div className="h-full rounded-full bg-gradient-to-r from-primary to-success transition-all" style={{ width: `${(s.quiz_completed / s.total_participants) * 100}%` }} />
            </div>
            <div className="mt-3 flex justify-between text-xs text-muted">
              <span>{s.quiz_completed} completed</span>
              <span>{s.total_participants} registered</span>
            </div>
          </div>

          <div className="card flex-1 p-6">
            <h2 className="mb-4 font-semibold">Recent activity</h2>
            <ul className="space-y-3">
              {data.recent_activity.map((a) => (
                <li key={a.id} className="flex items-center gap-3 text-sm">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-soft text-[10px] text-muted">
                    {a.action === "ROUND2_COMPLETED" ? "🏁" : a.action.startsWith("ROUND2") ? "★" : a.action === "CODE_SUBMITTED" ? "⌨" : "✓"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate">
                      <span className="font-medium text-text">{a.actor}</span> <span className="text-muted">{a.action.replace(/_/g, " ").toLowerCase()}</span>
                    </p>
                    <p className="truncate text-xs text-muted">{a.target}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted">{new Date(a.at).toLocaleTimeString()}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}