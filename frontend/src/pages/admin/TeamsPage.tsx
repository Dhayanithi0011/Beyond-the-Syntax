import { useEffect, useState } from "react";
import { api } from "../../services/api";
import { PageHeader, StatusBadge } from "../../components/ui";
import { Modal } from "../../components/Modal";
import { TableSkeleton } from "../../components/Skeleton";
import { useToast } from "../../components/Toast";

type AdminTeam = {
  id: string;
  name: string;
  color: string;
  status: string;
  round2_access: boolean;
  score: number;
  current_member_number: number;
  time_remaining_ms?: number;
  members?: { name: string }[];
};

const fmtMs = (ms?: number) => {
  if (ms == null) return "—";
  const m = Math.floor(ms / 60000);
  const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, "0");
  return `${m}:${s}`;
};

export default function TeamsPage() {
  const toast = useToast();
  const [teams, setTeams] = useState<AdminTeam[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [members, setMembers] = useState(["", "", ""]);

  useEffect(() => {
    api.get("/admin/teams").then(({ data }) => setTeams(data.teams)).catch(() => {});
  }, []);

  const action = async (t: AdminTeam, verb: string, label: string) => {
    await api.post(`/admin/teams/${t.id}/${verb}`, {}).catch(() => {});
    toast.success(`${t.name} → ${label}`);
    api.get("/admin/teams").then(({ data }) => setTeams(data.teams)).catch(() => {});
  };

  const create = async () => {
    const memberNames = members.filter(Boolean);
    if (!name || memberNames.length === 0) {
      toast.error("Team name and at least one member required.");
      return;
    }
    const { data } = await api.post("/admin/teams", { name, member_names: memberNames }).catch(() => ({ data: null }));
    if (data) {
      toast.success(`Team ${name} created. Assign members and grant Round 2 access.`);
      setCreateOpen(false);
      setName("");
      setMembers(["", "", ""]);
      api.get("/admin/teams").then(({ data }) => setTeams(data.teams)).catch(() => {});
    } else {
      toast.error("Could not create team (demo adapter).");
    }
  };

  return (
    <div>
      <PageHeader
        title="Team Management"
        subtitle="Coding relay teams — access, lifecycle and scoring"
        actions={<button className="btn-primary" onClick={() => setCreateOpen(true)}>+ Create team</button>}
      />

      {!teams ? (
        <TableSkeleton rows={4} cols={4} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {teams.map((t) => (
            <div key={t.id} className="card p-5 animate-fade-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: `${t.color}1f`, color: t.color }} aria-hidden>
                    ▲
                  </span>
                  <div>
                    <p className="font-semibold" style={{ color: t.color }}>{t.name}</p>
                    <p className="text-xs text-muted">
                      {t.members?.length ? t.members.map((m) => m.name).join(" · ") : "No members assigned"}
                    </p>
                  </div>
                </div>
                <StatusBadge status={t.status} />
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 rounded-lg border border-line bg-soft p-3 text-center">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted">Access</p>
                  <p className={`mt-0.5 text-sm font-semibold ${t.round2_access ? "text-success" : "text-muted"}`}>{t.round2_access ? "Granted" : "Revoked"}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted">Member</p>
                  <p className="mt-0.5 font-mono text-sm">{t.current_member_number || "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted">Time left</p>
                  <p className={`mt-0.5 font-mono text-sm ${fmtMs(t.time_remaining_ms) === "—" ? "text-muted" : "tabular-nums"}`}>{fmtMs(t.time_remaining_ms)}</p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm text-muted">Score</p>
                <p className="font-mono text-xl font-semibold text-primary">{t.score.toLocaleString()}</p>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {t.status === "pending" ? (
                  <>
                    <button className="btn-success px-3 py-1.5 text-xs" onClick={() => action(t, "approve", "approved & started")}>Approve & start relay</button>
                    <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => action(t, "activate", "started")}>Start only</button>
                  </>
                ) : t.status === "paused" ? (
                  <button className="btn-primary px-3 py-1.5 text-xs" onClick={() => action(t, "activate", "started")}>Activate</button>
                ) : t.status === "active" ? (
                  <>
                    <button className="btn-secondary px-3 py-1.5 text-xs" onClick={() => action(t, "pause", "paused")}>Pause</button>
                    <button className="btn-danger px-3 py-1.5 text-xs" onClick={() => action(t, "reset", "reset")}>Reset</button>
                  </>
                ) : (
                  <button className="btn-secondary px-3 py-1.5 text-xs" onClick={() => action(t, "activate", "restarted")}>Restart</button>
                )}
                {t.round2_access ? (
                  <button className="btn-ghost px-3 py-1.5 text-xs text-danger hover:bg-danger/10" onClick={() => action(t, "revoke-access", "access revoked")}>Revoke access</button>
                ) : (
                  <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => action(t, "grant-access", "access granted")}>Grant access</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create team"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setCreateOpen(false)}>Cancel</button>
            <button className="btn-primary" onClick={create}>Create team</button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label">Team name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Team Phoenix" />
          </div>
          <div>
            <label className="label">Members (3 for a full relay)</label>
            <div className="space-y-2">
              {members.map((m, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-8 shrink-0 text-center text-xs font-semibold text-muted">M{i + 1}</span>
                  <input className="input" value={m} onChange={(e) => setMembers((prev) => prev.map((x, idx) => (idx === i ? e.target.value : x)))} placeholder="Participant name" />
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">Only qualified participants can be added to a team.</p>
          </div>
        </div>
      </Modal>
    </div>
  );
}