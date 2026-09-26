import { useEffect, useMemo, useState } from "react";
import { api } from "../../services/api";
import { Badge, PageHeader, Segmented, StatusBadge } from "../../components/ui";
import { TableSkeleton } from "../../components/Skeleton";
import { useToast } from "../../components/Toast";

type R1Entry = {
  rank: number;
  id: string;
  name: string;
  participant_code: string;
  department: string;
  score: number;
  total: number;
  time_taken_seconds: number;
  qualification_status: string;
};

type R2Entry = {
  rank: number;
  team_id: string;
  name: string;
  color: string;
  score: number;
  time_seconds: number;
  status: string;
};

const fmtTime = (s: number) => {
  if (s <= 0) return "—";
  const m = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, "0");
  return `${m}:${ss}`;
};

const MEDAL = (rank: number) => (rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : String(rank).padStart(2, "0"));

export default function AdminLeaderboardPage() {
  const toast = useToast();
  const [tab, setTab] = useState<"round1" | "round2">("round1");
  const [r1, setR1] = useState<R1Entry[] | null>(null);
  const [r2, setR2] = useState<R2Entry[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [topN, setTopN] = useState<string>("");
  const [working, setWorking] = useState(false);

  const refresh = () => {
    api.get("/admin/leaderboard/round1").then(({ data }) => setR1(data.entries)).catch(() => setR1([]));
    api.get("/admin/leaderboard/round2").then(({ data }) => setR2(data.entries)).catch(() => setR2([]));
  };

  useEffect(() => {
    refresh();
  }, []);

  const unqualified = useMemo(() => (r1 ?? []).filter((e) => e.qualification_status !== "qualified"), [r1]);

  const selectTopN = () => {
    const n = Math.max(0, parseInt(topN || "0", 10) || 0);
    setSelected(new Set(unqualified.slice(0, n).map((e) => e.id)));
    setTopN("");
  };

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const selectAllUnqualified = () => setSelected(new Set(unqualified.map((e) => e.id)));

  const qualify = async () => {
    if (selected.size === 0) return;
    setWorking(true);
    await api.post("/admin/qualify", { participant_ids: Array.from(selected) }).catch(() => {});
    toast.success(`${selected.size} participant${selected.size > 1 ? "s" : ""} qualified for Round 2.`);
    setSelected(new Set());
    setWorking(false);
    setR1((prev) =>
      (prev ?? []).map((e) =>
        selected.has(e.id) ? { ...e, qualification_status: "qualified" } : e
      )
    );
  };

  const gridCols = "grid-cols-[3rem_2.5rem_1fr_5rem_6rem_7rem]";

  return (
    <div>
      <PageHeader
        title="Leaderboard"
        subtitle="Round 1 quiz standings — select the top students and qualify them for Round 2"
        actions={
          <Segmented<typeof tab>
            value={tab}
            onChange={setTab}
            options={[
              { value: "round1", label: "Round 1 · Quiz" },
              { value: "round2", label: "Round 2 · Relay" },
            ]}
          />
        }
      />

      {tab === "round1" ? (
        !r1 ? (
          <TableSkeleton rows={8} cols={6} />
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <input
                type="number"
                min={1}
                className="input w-24"
                placeholder="N"
                value={topN}
                onChange={(e) => setTopN(e.target.value)}
                aria-label="Number of top students to select"
              />
              <button className="btn-secondary" onClick={selectTopN}>Select top N</button>
              <button className="btn-secondary" onClick={selectAllUnqualified}>Select all unqualified</button>
              <span className="text-xs text-muted">{selected.size} selected</span>
              <button className="btn-primary ml-auto" onClick={qualify} disabled={selected.size === 0 || working}>
                ★ Qualify selected ({selected.size})
              </button>
            </div>

            <div className="card overflow-hidden">
              <div className={`grid ${gridCols} items-center gap-4 border-b border-line bg-soft px-5 py-3 text-xs font-medium uppercase tracking-wider text-muted`}>
                <span>Rank</span>
                <span aria-hidden />
                <span>Participant</span>
                <span className="text-right">Score</span>
                <span className="text-right">Time</span>
                <span className="text-right">Qualification</span>
              </div>
              {r1.map((e) => (
                <div
                  key={e.participant_code}
                  className={`grid ${gridCols} items-center gap-4 border-b border-line px-5 py-3.5 text-sm last:border-0 hover:bg-soft`}
                >
                  <span className="font-mono font-semibold">{MEDAL(e.rank)}</span>
                  <input
                    type="checkbox"
                    className="accent-primary"
                    checked={selected.has(e.id)}
                    disabled={e.qualification_status === "qualified"}
                    onChange={() => toggleSelect(e.id)}
                    aria-label={`Select ${e.name}`}
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{e.name}</span>
                    <span className="block text-xs text-muted">{e.participant_code} · {e.department}</span>
                  </span>
                  <span className="text-right font-mono font-semibold text-primary">
                    {e.score}<span className="text-xs text-muted">/{e.total}</span>
                  </span>
                  <span className="text-right font-mono text-muted">⏱ {fmtTime(e.time_taken_seconds)}</span>
                  <span className="flex justify-end">
                    {e.qualification_status === "qualified" ? (
                      <Badge tone="success">Qualified</Badge>
                    ) : (
                      <StatusBadge status={e.qualification_status} />
                    )}
                  </span>
                </div>
              ))}
              {r1.length === 0 && <p className="px-5 py-10 text-center text-sm text-muted">No submitted quizzes yet.</p>}
            </div>
          </>
        )
      ) : !r2 ? (
        <TableSkeleton rows={8} cols={4} />
      ) : (
        <div className="card overflow-hidden">
          <div className="grid grid-cols-[3rem_1fr_auto_auto] items-center gap-4 border-b border-line bg-soft px-5 py-3 text-xs font-medium uppercase tracking-wider text-muted sm:grid-cols-[3rem_1fr_6rem_6rem]">
            <span>Rank</span>
            <span>Team</span>
            <span className="text-right">Score</span>
            <span className="text-right">Time</span>
          </div>
          {r2.map((e) => (
            <div
              key={e.team_id}
              className="grid grid-cols-[3rem_1fr_auto_auto] items-center gap-4 border-b border-line px-5 py-4 text-sm last:border-0 hover:bg-soft sm:grid-cols-[3rem_1fr_6rem_6rem]"
            >
              <span className="font-mono font-semibold">{MEDAL(e.rank)}</span>
              <span className="flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ background: `${e.color}20`, color: e.color }} aria-hidden>▲</span>
                <span className="font-medium" style={{ color: e.color }}>{e.name}</span>
                {e.status === "completed" && <Badge tone="success">Done</Badge>}
              </span>
              <span className="text-right font-mono font-semibold text-primary">{e.score.toLocaleString()}</span>
              <span className="text-right font-mono text-muted">⏱ {fmtTime(e.time_seconds)}</span>
            </div>
          ))}
          {r2.length === 0 && <p className="px-5 py-10 text-center text-sm text-muted">No team submissions yet.</p>}
        </div>
      )}
    </div>
  );
}