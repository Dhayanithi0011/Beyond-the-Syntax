import { useEffect, useMemo, useState } from "react";
import { api } from "../../services/api";
import { PageHeader, Badge, Segmented } from "../../components/ui";
import { Modal } from "../../components/Modal";
import { TableSkeleton } from "../../components/Skeleton";
import { useToast } from "../../components/Toast";

type Question = {
  id: string;
  text: string;
  options: [string, string, string, string];
  correct_option: string;
  category: string;
  difficulty: string;
  marks: number;
  is_enabled: boolean;
};

const DIFF_TONE: Record<string, "success" | "warning" | "danger"> = {
  easy: "success",
  medium: "warning",
  hard: "danger",
};

const emptyForm = { text: "", options: ["", "", "", ""] as [string, string, string, string], correct_option: "A", category: "Data Structures", difficulty: "medium", marks: 1, is_enabled: true };

export default function QuestionsPage() {
  const toast = useToast();
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "easy" | "medium" | "hard">("all");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Question | null>(null);
  const [form, setForm] = useState(emptyForm);

  const load = () => api.get("/admin/questions").then(({ data }) => setQuestions(data.questions));

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const qs = questions ?? [];
    return qs.filter((q) => {
      const okText = q.text.toLowerCase().includes(search.toLowerCase());
      const okDiff = filter === "all" || q.difficulty === filter;
      return okText && okDiff;
    });
  }, [questions, search, filter]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowModal(true);
  };
  const openEdit = (q: Question) => {
    setEditing(q);
    setForm({ text: q.text, options: q.options, correct_option: q.correct_option, category: q.category, difficulty: q.difficulty, marks: q.marks, is_enabled: q.is_enabled });
    setShowModal(true);
  };

  const save = async () => {
    if (!form.text) {
      toast.error("Question text is required.");
      return;
    }
    if (editing) {
      await api.put(`/admin/questions/${editing.id}`, form).catch(() => {});
      toast.success("Question updated.");
    } else {
      await api.post("/admin/questions", form).catch(() => {});
      toast.success("Question added.");
    }
    setQuestions((prev) => (prev ? [...prev] : prev));
    setShowModal(false);
    load();
  };

  const remove = async (q: Question) => {
    await api.delete(`/admin/questions/${q.id}`).catch(() => {});
    toast.success("Question deleted.");
    load();
  };

  const toggle = async (q: Question) => {
    await api.put(`/admin/questions/${q.id}`, { ...q, is_enabled: !q.is_enabled }).catch(() => {});
    load();
  };

  const setOpt = (i: number, value: string) =>
    setForm((f) => ({ ...f, options: f.options.map((o, idx) => (idx === i ? value : o)) as [string, string, string, string] }));

  return (
    <div>
      <PageHeader
        title="Question Bank"
        subtitle={`${questions?.length ?? 0} questions · Round 1 MCQ`}
        actions={<button className="btn-primary" onClick={openCreate}>+ Add question</button>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input className="input max-w-xs" placeholder="Search questions…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search questions" />
        <Segmented<typeof filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "easy", label: "Easy" },
            { value: "medium", label: "Medium" },
            { value: "hard", label: "Hard" },
          ]}
        />
      </div>

      {!questions ? (
        <TableSkeleton rows={8} cols={4} />
      ) : (
        <div className="card overflow-hidden">
          <div className="hidden grid-cols-[1fr_8rem_6rem_5rem_7rem] gap-4 border-b border-line bg-soft px-5 py-3 text-xs font-medium uppercase tracking-wider text-muted md:grid">
            <span>Question</span>
            <span>Category</span>
            <span>Difficulty</span>
            <span>Marks</span>
            <span className="text-right">Actions</span>
          </div>
          {filtered.map((q) => (
            <div key={q.id} className="grid grid-cols-1 gap-2 border-b border-line px-5 py-4 last:border-0 hover:bg-soft md:grid-cols-[1fr_8rem_6rem_5rem_7rem] md:items-center md:gap-4">
              <div className="min-w-0">
                <div className="flex items-start gap-2">
                  {!q.is_enabled && <Badge tone="muted">disabled</Badge>}
                  <p className="text-sm leading-relaxed">{q.text}</p>
                </div>
                <p className="mt-1.5 flex flex-wrap gap-1 font-mono text-xs text-muted">
                  {q.options.map((o, i) => (
                    <span key={i} className={`rounded px-1.5 py-0.5 ${String.fromCharCode(65 + i) === q.correct_option ? "bg-success/15 text-success" : "text-muted"}`}>
                      {String.fromCharCode(65 + i)}.{o}
                    </span>
                  ))}
                </p>
              </div>
              <span className="text-xs text-muted">{q.category}</span>
              <Badge tone={DIFF_TONE[q.difficulty] ?? "muted"}>{q.difficulty}</Badge>
              <span className="font-mono text-sm">{q.marks}</span>
              <div className="flex justify-start gap-2 md:justify-end">
                <button className="btn-ghost px-2 py-1 text-xs" onClick={() => toggle(q)}>{q.is_enabled ? "Disable" : "Enable"}</button>
                <button className="btn-secondary px-2 py-1 text-xs" onClick={() => openEdit(q)}>Edit</button>
                <button className="btn-ghost px-2 py-1 text-xs text-danger hover:bg-danger/10" onClick={() => remove(q)}>Delete</button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && <p className="px-5 py-10 text-center text-sm text-muted">No questions match your filters.</p>}
        </div>
      )}

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? "Edit question" : "Add question"}
        wide
        footer={
          <>
            <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
            <button className="btn-primary" onClick={save}>{editing ? "Save changes" : "Add question"}</button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label">Question text</label>
            <textarea rows={2} className="input resize-none" value={form.text} onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))} placeholder="Which data structure is used in BFS?" />
          </div>
          <div className="space-y-2">
            <label className="label">Options</label>
            {form.options.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-line bg-soft text-xs font-semibold text-muted">
                  {String.fromCharCode(65 + i)}
                </span>
                <input className="input" value={o} onChange={(e) => setOpt(i, e.target.value)} placeholder={`Option ${String.fromCharCode(65 + i)}`} />
                <button
                  className={`shrink-0 rounded-md border px-2.5 py-2 text-xs font-medium ${
                    form.correct_option === String.fromCharCode(65 + i) ? "border-success/40 bg-success/15 text-success" : "border-line bg-soft text-muted"
                  }`}
                  onClick={() => setForm((f) => ({ ...f, correct_option: String.fromCharCode(65 + i) }))}
                >
                  correct
                </button>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="label">Category</label>
              <select className="input" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
                {["Data Structures", "Algorithms", "C Programming", "Python", "Databases", "Operating Systems", "Networking", "OOP"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Difficulty</label>
              <select className="input" value={form.difficulty} onChange={(e) => setForm((f) => ({ ...f, difficulty: e.target.value }))}>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
            <div>
              <label className="label">Marks</label>
              <input type="number" min={1} className="input" value={form.marks} onChange={(e) => setForm((f) => ({ ...f, marks: Number(e.target.value) }))} />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}