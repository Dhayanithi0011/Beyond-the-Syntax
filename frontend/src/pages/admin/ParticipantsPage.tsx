import { useEffect, useMemo, useState } from "react";
import { api } from "../../services/api";
import { PageHeader, StatusBadge, Segmented } from "../../components/ui";
import { TableSkeleton } from "../../components/Skeleton";
import { useToast } from "../../components/Toast";

type Participant = {
  id: string;
  participant_code: string;
  name: string;
  email: string;
  department: string;
  year: number;
  quiz_status: string;
  score: number | null;
  submitted_at: string | null;
  qualification_status: string;
  team: string | null;
  tab_switches: { round1: number; round2: number };
};

type QualFilter = "all" | "qualified" | "pending" | "not_qualified";

export default function ParticipantsPage() {
  const toast = useToast();
  const [participants, setParticipants] = useState<Participant[] | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<QualFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [working, setWorking] = useState(false);

  useEffect(() => {
    api.get("/admin/participants").then(({ data }) => setParticipants(data.participants)).catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    const ps = participants ?? [];
    const q = search.toLowerCase();
    return ps.filter((p) => {
      const okQ = p.name.toLowerCase().includes(q) || p.participant_code.toLowerCase().includes(q) || p.email.toLowerCase().includes(q);
      const okF = filter === "all" || p.qualification_status === filter;
      return okQ && okF;
    });
  }, [participants, search, filter]);

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected(filtered.length === selected.size ? new Set() : new Set(filtered.map((p) => p.id)));

  const qualify = async () => {
    if (selected.size === 0) return;
    setWorking(true);
    await api.post("/admin/qualify", { participant_ids: Array.from(selected) }).catch(() => {});
    toast.success(`${selected.size} participant${selected.size > 1 ? "s" : ""} qualified for Round 2.`);
    setSelected(new Set());
    setWorking(false);
    setParticipants((prev) =>
      (prev ?? []).map((p) => (selected.has(p.id) ? { ...p, qualification_status: "qualified" } : p))
    );
  };

  return (
    <div>
      <PageHeader
        title="Participants"
        subtitle="Round 1 registrations, quiz status and qualification control"
        actions={
          <button className="btn-primary" onClick={qualify} disabled={selected.size === 0 || working}>
            ★ Qualify selected ({selected.size})
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input className="input max-w-xs" placeholder="Search name, code, email…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search participants" />
        <Segmented<QualFilter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "qualified", label: "Qualified" },
            { value: "pending", label: "Pending" },
            { value: "not_qualified", label: "Not qualified" },
          ]}
        />
        <span className="ml-auto text-xs text-muted">{filtered.length} shown</span>
      </div>

      {!participants ? (
        <TableSkeleton rows={10} cols={6} />
      ) : (
        <div className="card overflow-hidden">
          <div className="hidden grid-cols-[2rem_6rem_1.2fr_1fr_1fr_7rem_5rem_7rem] items-center gap-4 border-b border-line bg-soft px-5 py-3 text-xs font-medium uppercase tracking-wider text-muted lg:grid">
            <input type="checkbox" className="accent-primary" checked={selected.size > 0 && selected.size === filtered.length} onChange={toggleAll} aria-label="Select all" />
            <span>ID</span>
            <span>Name</span>
            <span>Team</span>
            <span>Dept / Year</span>
            <span>Quiz</span>
            <span>Score</span>
            <span className="text-right">Qualification</span>
          </div>
          {filtered.map((p) => (
            <div key={p.id} className="grid grid-cols-1 gap-2 border-b border-line px-5 py-3.5 last:border-0 hover:bg-soft lg:grid-cols-[2rem_6rem_1.2fr_1fr_1fr_7rem_5rem_7rem] lg:items-center lg:gap-4">
              <input type="checkbox" className="accent-primary hidden lg:block" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} aria-label={`Select ${p.name}`} />
              <span className="lg:hidden">
                <input type="checkbox" className="accent-primary" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} /> <span className="ml-2 text-xs text-muted">Select</span>
              </span>
              <span className="font-mono text-xs text-muted">{p.participant_code}</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{p.name}</p>
                <p className="truncate text-xs text-muted">{p.email}</p>
                {(p.tab_switches.round1 > 0 || p.tab_switches.round2 > 0) && (
                  <p className="mt-1 flex flex-wrap gap-1.5">
                    {p.tab_switches.round1 > 0 && (
                      <span className="rounded border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-warning">
                        ⇄ Tab switch · Round 1 × {p.tab_switches.round1}
                      </span>
                    )}
                    {p.tab_switches.round2 > 0 && (
                      <span className="rounded border border-danger/30 bg-danger/10 px-1.5 py-0.5 text-[10px] font-medium text-danger">
                        ⇄ Tab switch · Round 2 × {p.tab_switches.round2}
                      </span>
                    )}
                  </p>
                )}
              </div>
              <span className={p.team ? "flex items-center gap-1.5 truncate text-xs font-medium" : "text-xs text-muted/50"}>
                {p.team ? (
                  <>
                    <span className="grid h-4 w-4 shrink-0 place-items-center rounded bg-primary/15 text-[9px] text-primary">⚡</span>
                    <span className="truncate">{p.team}</span>
                  </>
                ) : (
                  "—"
                )}
              </span>
              <span className="text-xs text-muted">{p.department} · Y{p.year}</span>
              <StatusBadge status={p.quiz_status} />
              <span className="font-mono text-sm lg:text-right">{p.score !== null ? `${p.score}/30` : "—"}</span>
              <div className="flex justify-between gap-2 lg:justify-end">
                <StatusBadge status={p.qualification_status} />
                <span className="lg:hidden text-xs text-muted">{p.score ?? "no score"}</span>
              </div>
            </div>
          ))}
          {filtered.length === 0 && <p className="px-5 py-10 text-center text-sm text-muted">No participants match.</p>}
        </div>
      )}
    </div>
  );
}