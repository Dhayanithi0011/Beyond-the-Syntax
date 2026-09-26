import { useEffect, useState } from "react";
import { api } from "../../services/api";
import { SkeletonLines } from "../../components/Skeleton";

type Rule = { title: string; body: string };

export default function RulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/rules").then(({ data }) => setRules(data.rules)).finally(() => setLoading(false));
  }, []);

  return (
    <section className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Competition Rules</h1>
      <p className="mt-2 text-sm text-muted">
        Read these carefully. All decisions by the organizing committee are final.
      </p>

      <div className="mt-8 space-y-4">
        {loading ? (
          <SkeletonLines lines={8} />
        ) : (
          rules.map((r, i) => (
            <article key={r.title} className="card p-5 animate-fade-in">
              <h2 className="flex items-baseline gap-3 font-semibold">
                <span className="font-mono text-sm text-primary">0{i + 1}</span>
                {r.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">{r.body}</p>
            </article>
          ))
        )}
      </div>

      <aside className="mt-6 rounded-xl border border-warning/25 bg-warning/5 p-5 text-sm text-warning">
        <p className="font-medium">Fair-play notice</p>
        <p className="mt-1 text-warning/80">
          Switching tabs, exiting fullscreen and other suspicious activity is recorded and reviewed.
          Browser protections are a deterrent — competition integrity is enforced server-side.
        </p>
      </aside>
    </section>
  );
}