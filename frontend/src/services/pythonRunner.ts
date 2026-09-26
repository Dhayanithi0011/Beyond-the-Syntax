/* In-browser Python execution via Pyodide (real CPython).
   Used by the demo judge so submitted code is genuinely executed and its
   stdout compared against expected outputs. Loaded lazily from CDN on the
   first run; failures degrade gracefully. */

const PYODIDE_BASE = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";

let runtimePromise: Promise<unknown> | null = null;

function injectScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not download the Python runtime (Pyodide)."));
    document.head.appendChild(s);
  });
}

async function runtime(): Promise<unknown> {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      const w = window as unknown as { loadPyodide?: (opts: { indexURL: string }) => Promise<unknown> };
      if (!w.loadPyodide) await injectScript(`${PYODIDE_BASE}pyodide.js`);
      if (!w.loadPyodide) throw new Error("Pyodide is not available in this browser.");
      return w.loadPyodide!({ indexURL: PYODIDE_BASE });
    })();
  }
  return runtimePromise;
}

export type PythonJudgeOutcome = { actual: string; error: string | null; timedOut?: boolean };

function clean(s: string): string {
  return (s ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trimEnd();
}

// True when the runtime failed to load (e.g. offline) so callers can fall back.
export async function runPythonSource(
  source: string,
  tests: { input: string; expected: string }[],
  timeoutMs = 4000
): Promise<{ outcomes: PythonJudgeOutcome[]; runtimeUnavailable: boolean }> {
  let py: any;
  try {
    py = await runtime();
  } catch {
    return { outcomes: [], runtimeUnavailable: true };
  }

  await py.runPythonAsync("import sys, io, contextlib, traceback");

  const outcomes: PythonJudgeOutcome[] = [];
  const prep = `
import sys, io, contextlib, traceback
in_stream = io.StringIO(__j_in)
out_buf = io.StringIO()
ns = {"__name__": "__main__"}
__j_error = None
old_stdin = sys.stdin
sys.stdin = in_stream
try:
    with contextlib.redirect_stdout(out_buf):
        exec(__j_src, ns)
except BaseException:
    __j_error = traceback.format_exc()
finally:
    sys.stdin = old_stdin
__j_out = out_buf.getvalue()
`;

  for (const tc of tests) {
    py.globals.set("__j_in", tc.input);
    py.globals.set("__j_src", source);
    py.globals.set("__j_error", null);

    let verdict: unknown;
    try {
      verdict = await Promise.race([
        py.runPythonAsync(prep),
        new Promise((_, reject) => setTimeout(() => reject(new Error("__JUDGE_TIMEOUT__")), timeoutMs)),
      ]);
    } catch (e) {
      outcomes.push({
        actual: "",
        error: String((e as Error).message === "__JUDGE_TIMEOUT__" ? "Execution timed out." : "Python runtime error."),
        timedOut: (e as Error).message === "__JUDGE_TIMEOUT__",
      });
      continue;
    }
    void verdict;

    const rawOut = (py.globals.get("__j_out") ?? "") as string;
    const rawError = (py.globals.get("__j_error") ?? "") as string;
    outcomes.push({
      actual: clean(rawOut),
      error: rawError ? clean(rawError) : null,
    });
  }

  return { outcomes, runtimeUnavailable: false };
}