import { Fragment, ReactNode } from "react";

/** Minimal, dependency-free CommonMark-ish renderer for problem statements. */
export function Markdown({ children, className = "" }: { children: string; className?: string }) {
  const lines = children.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let para: string[] = [];
  let list: string[] = [];
  let code: string[] = [];
  let inCode = false;

  const flush = (key: number) => {
    if (inCode) {
      blocks.push(
        <pre key={key} className="overflow-x-auto rounded-lg border border-line bg-slate-900 p-3 font-mono text-xs leading-relaxed">
          {code.join("\n")}
        </pre>
      );
      code = [];
      inCode = false;
      return;
    }
    if (para.length) {
      blocks.push(
        <p key={key} className="text-sm leading-relaxed text-text/90">
          {Inline(para.join(" "))}
        </p>
      );
      para = [];
    }
    if (list.length) {
      blocks.push(
        <ul key={key} className="space-y-1.5">
          {list.map((item, i) => (
            <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-text/90">
              <span className="mt-0.5 shrink-0 text-primary">•</span>
              <span>{Inline(item)}</span>
            </li>
          ))}
        </ul>
      );
      list = [];
    }
  };

  lines.forEach((line) => {
    if (line.trim().startsWith("```")) {
      flush(blocks.length);
      inCode = !inCode;
      return;
    }
    if (inCode) {
      code.push(line);
      return;
    }
    if (line.trim() === "") {
      flush(blocks.length);
      return;
    }
    if (line.trim().startsWith("- ")) {
      list.push(line.trim().slice(2));
      return;
    }
    para.push(line);
  });
  flush(blocks.length);

  return <div className={`space-y-4 ${className}`}>{blocks}</div>;
}

function Inline(text: string): ReactNode {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={i} className="rounded bg-soft px-1.5 py-0.5 font-mono text-[12.5px] text-primary">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-semibold text-text">{part.slice(2, -2)}</strong>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

export function SampleIO({ title, input, output }: { title: string; input: string; output: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <p className="border-b border-line bg-soft px-3 py-1.5 text-xs font-medium text-muted">{title}</p>
      <div>
        {input && (
          <div className="border-b border-line p-3">
            <p className="mb-1 text-[10px] uppercase tracking-wider text-muted">Input</p>
            <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed">{input}</pre>
          </div>
        )}
        <div className="p-3">
          <p className="mb-1 text-[10px] uppercase tracking-wider text-muted">Output</p>
          <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-success">{output}</pre>
        </div>
      </div>
    </div>
  );
}