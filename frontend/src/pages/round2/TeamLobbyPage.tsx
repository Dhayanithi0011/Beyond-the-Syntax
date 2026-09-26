import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../services/api";
import { Avatar, Badge, StatusBadge } from "../../components/ui";
import { SkeletonLines } from "../../components/Skeleton";
import { useToast } from "../../components/Toast";
import { useAuth } from "../../contexts/AuthContext";

type Member = {
  member_number: number;
  name: string;
  participant_code: string;
  status: string;
};

type Team = {
  id: string;
  name: string;
  color: string;
  icon: string;
  status: string;
  round2_access: boolean;
  current_member_number: number;
  members: Member[];
};

type Round2Status = {
  qualified: boolean;
  qualification_status: string;
  team_status: "none" | "pending" | "active" | "paused" | "completed" | "expired" | string;
  team: Team | null;
  your_member_number: number | null;
  your_participant_code: string | null;
  session?: {
    status: string;
    team_started_at: string | null;
    team_deadline: string | null;
    team_time_remaining_seconds: number | null;
    member_started_at: string | null;
    member_deadline: string | null;
  } | null;
};

const MEMBER_STATE: Record<string, { label: string; cls: string }> = {
  not_started: { label: "Waiting", cls: "border-line bg-soft text-muted" },
  active: { label: "Active", cls: "border-success/40 bg-success/10 text-success" },
  completed: { label: "Completed", cls: "border-primary/40 bg-primary/10 text-primary" },
  expired: { label: "Time expired", cls: "border-danger/40 bg-danger/10 text-danger" },
  paused: { label: "Paused", cls: "border-warning/40 bg-warning/10 text-warning" },
};

export default function TeamLobbyPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const [status, setStatus] = useState<Round2Status | null>(null);
  const [teamName, setTeamName] = useState("");
  const [members, setMembers] = useState(["", "", ""]);
  const [submitting, setSubmitting] = useState(false);
  const teamTimeSeconds = status?.team?.status === "active" ? status?.session?.team_time_remaining_seconds ?? null : null;
  const teamTimeLabel = teamTimeSeconds != null
    ? `${String(Math.floor(teamTimeSeconds / 60)).padStart(2, "0")}:${String(teamTimeSeconds % 60).padStart(2, "0")}`
    : null;

  const load = useCallback(async () => {
    const { data } = await api.get("/teams/status");
    setStatus(data);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /* Pre-fill the first slot with the caller's own name once, so the submitter
     clearly knows they must be Member 1 of their own team. */
  useEffect(() => {
    if (user?.name && members[0] === "") {
      setMembers((prev) => [user.name, prev[1], prev[2]]);
    }
  }, [user?.name, members]);

  const submitTeam = async () => {
    const allMembers = members.map((m) => m.trim()).filter(Boolean);
    if (!teamName.trim()) return void toast.error("Give your team a name.");
    if (allMembers.length !== 3) return void toast.error("You must list all 3 team members.");
    if (new Set(allMembers).size !== 3) return void toast.error("Duplicate member — each member once.");
    setSubmitting(true);
    const { data } = await api
      .post("/teams/register", { name: teamName.trim(), members: allMembers })
      .catch((err) => ({ data: null, err }));
    setSubmitting(false);
    if (!data?.team_id) {
      toast.error("Could not submit the team — check the member names or register numbers.");
      return;
    }
    toast.success("Team submitted — waiting for admin approval.");
    await load();
  };

  if (!status) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <SkeletonLines lines={6} />
      </div>
    );
  }

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
  /* Qualified, no team yet — the "login style" team submission form     */
  /* ------------------------------------------------------------------ */
  if (!status.team) {
    return (
      <section className="mx-auto max-w-xl px-4 py-10 sm:px-6">
        <div className="card animate-fade-in">
          <div className="border-b border-line p-7 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/15 text-2xl" aria-hidden>🎉</div>
            <h1 className="mt-4 text-xl font-semibold tracking-tight">You're in Round 2!</h1>
            <p className="mt-1 text-sm text-muted">
              Form a team of 3 qualified members. Your team will start once an admin approves it.
            </p>
          </div>
          <div className="p-7">
            <div>
              <label className="label">Team name</label>
              <input
                className="input"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="Team Phoenix"
                maxLength={60}
              />
            </div>
            <p className="mt-5 text-sm font-semibold text-muted">Your 3 members (relay order)</p>
            <div className="mt-2 space-y-2">
              {members.map((m, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-8 shrink-0 text-center text-xs font-semibold text-muted">M{i + 1}</span>
                  <input
                    className="input"
                    value={m}
                    onChange={(e) => setMembers((prev) => prev.map((x, idx) => (idx === i ? e.target.value : x)))}
                    placeholder={i === 0 ? "Your name" : "Full name or register number"}
                  />
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">
              Each member can be entered by full name or register number. All 3 must have been selected
              for Round 2. The relay order you list here is the order turns are taken.
            </p>

            <button className="btn-primary mt-6 w-full py-3 text-base" onClick={submitTeam} disabled={submitting}>
              {submitting ? "Submitting…" : "Submit team for approval →"}
            </button>
            <p className="mt-3 text-center text-xs text-muted">
              The 45-minute coding relay starts only after an admin approves your team.
            </p>
          </div>
        </div>
      </section>
    );
  }

  /* ------------------------------------------------------------------ */
  /* Team submitted, not yet approved                                    */
  /* ------------------------------------------------------------------ */
  if (status.team.status === "pending" || status.team.status === "not_started") {
    return (
      <section className="mx-auto max-w-xl px-4 py-10 sm:px-6">
        <div className="card animate-fade-in">
          <div className="flex items-center gap-4 border-b border-line p-7">
            <span
              className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-2xl"
              style={{ background: `${status.team.color}1f`, color: status.team.color }}
              aria-hidden
            >
              {status.team.icon}
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold tracking-tight" style={{ color: status.team.color }}>
                {status.team.name}
              </h1>
              <StatusBadge status="pending" />
            </div>
          </div>
          <div className="p-7 text-center">
            <span className="inline-grid h-12 w-12 place-items-center rounded-full bg-warning/15 text-xl" aria-hidden>⏳</span>
            <h2 className="mt-3 font-semibold">Waiting for admin approval</h2>
            <p className="mt-1 text-sm text-muted">
              Your team has been submitted. The organizer will review it and start your
              coding relay — refresh this page when your turn time approaches.
            </p>
            <button className="btn-secondary mt-6 w-full py-2.5" onClick={load}>Refresh status</button>
          </div>
        </div>
      </section>
    );
  }

  /* ------------------------------------------------------------------ */
  /* Approved / live team — relay lobby with member states               */
  /* ------------------------------------------------------------------ */
  const team = status.team;
  const yourCode = status.your_participant_code;

  const enter = async () => {
    setSubmitting(true);
    navigate("/team/workspace");
    setSubmitting(false);
  };

  return (
    <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="card overflow-hidden animate-fade-in">
        <div className="relative border-b border-line p-7">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: `radial-gradient(60% 120% at 80% 0%, ${team.color}22 0%, transparent 70%)` }}
          />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <span
                className="grid h-14 w-14 place-items-center rounded-2xl text-2xl"
                style={{ background: `${team.color}1f`, color: team.color }}
                aria-hidden
              >
                {team.icon}
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-semibold tracking-tight" style={{ color: team.color }}>{team.name}</h1>
                  <StatusBadge status={team.status} />
                </div>
                <p className="text-sm text-muted">Coding relay · 3 members · 15 minutes each</p>
              </div>
            </div>
            <div className="rounded-xl border border-line bg-soft px-4 py-2.5 text-center">
              <p className="text-[11px] uppercase tracking-wider text-muted">Team time left</p>
              <p className="font-mono text-xl font-semibold tabular-nums">{teamTimeLabel ?? "—"}</p>
              <p className="mt-0.5 text-[10px] text-muted/70">Paused between turns · runs only while a member works</p>
            </div>
          </div>
        </div>
        <div className="p-7">
          <p className="mb-4 text-sm font-semibold text-muted">Relay order</p>
          <div className="space-y-3">
            {team.members.map((m) => {
              const st = MEMBER_STATE[m.status] ?? MEMBER_STATE.not_started;
              const isYou = m.participant_code === yourCode;
              return (
                <div key={m.member_number} className="flex items-center gap-4">
                  <span className="w-8 shrink-0 text-center font-mono text-sm text-muted">M{m.member_number}</span>
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                      team.current_member_number === m.member_number ? "text-success" : "text-primary"
                    } ${team.current_member_number === m.member_number ? "bg-success/15" : "bg-primary/10"}`}
                    aria-hidden
                  >
                    {team.current_member_number === m.member_number ? "●" : m.member_number === 3 ? "⤳" : "→"}
                  </span>
                  <Avatar name={m.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {m.name} {isYou && <Badge tone="primary" className="ml-1">You</Badge>}
                    </p>
                    <p className="text-xs text-muted">{m.participant_code}</p>
                  </div>
                  <span className={`rounded-lg border px-3 py-1 text-xs font-medium ${st.cls}`}>{st.label}</span>
                </div>
              );
            })}
          </div>

          <div className="mt-7 grid gap-px overflow-hidden rounded-xl border border-line bg-soft sm:grid-cols-2">
            <div className="bg-surface p-4">
              <p className="text-xs text-muted">Current member</p>
              <p className="mt-1 text-sm font-semibold">Member {team.current_member_number}</p>
              <p className="font-mono text-xs text-primary">{team.members.find((m) => m.member_number === team.current_member_number)?.name}</p>
            </div>
            <div className="bg-surface p-4">
              <p className="text-xs text-muted">Your session deadline</p>
              <p className="mt-1 font-mono text-sm font-semibold tabular-nums">
                {status.session?.member_deadline ? new Date(status.session.member_deadline).toLocaleTimeString() : "—"}
              </p>
            </div>
          </div>

          {team.status === "active" && status.your_member_number === team.current_member_number ? (
            <>
              <button className="btn-primary mt-7 w-full py-3 text-base" onClick={enter} disabled={submitting}>
                {submitting ? "Opening workspace…" : "Enter coding workspace →"}
              </button>
              <p className="mt-3 flex items-center gap-2 text-xs text-muted">
                <span className="text-warning">⚠</span> Handoff hands over the shared code, test history
                and remaining time. There is no undo.
              </p>
            </>
          ) : (
            <div className="mt-7 rounded-xl border border-warning/30 bg-warning/10 p-4 text-center text-sm text-warning">
              It's not your turn right now — the relay is on Member {team.current_member_number ?? "?"}.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}