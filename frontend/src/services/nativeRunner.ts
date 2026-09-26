/* In-browser C / C++ execution for the demo judge — Clang compiled to WASM
   (browsercc) linked into a WASI binary, run with @bjorn3/browser_wasi_shim.
   The ~95 MB toolchain streams from the jsDelivr CDN on first use and is then
   cached by the browser. Only printed stdout is graded (output comparison),
   so any correct program passes regardless of implementation. */

const BROWSERCC_URL = "https://cdn.jsdelivr.net/npm/browsercc@0.1.1/dist/index.js";
const WASI_SHIM_URL = "https://cdn.jsdelivr.net/npm/@bjorn3/browser_wasi_shim@0.4.2/+esm";
const COMPILE_TIMEOUT_MS = 240_000;

/* browsercc resolves sysroot.tar/clang.wasm/etc. relative to itself, so a stale
   artifact cached under those URLs can linger across sessions. When the stamp
   changes (or the browser has never warm-loaded them), refetch everything with
   cache:'reload' once to purge corrupt/stale copies, then rely on the HTTP cache. */
const TOOLCHAIN_STAMP = "bs-native-toolchain-v2";
const TOOLCHAIN_ASSETS = [
  "https://cdn.jsdelivr.net/npm/browsercc@0.1.1/dist/index.js",
  "https://cdn.jsdelivr.net/npm/browsercc@0.1.1/dist/clang.js",
  "https://cdn.jsdelivr.net/npm/browsercc@0.1.1/dist/lld.js",
  "https://cdn.jsdelivr.net/npm/browsercc@0.1.1/dist/sysroot.tar",
  "https://cdn.jsdelivr.net/npm/browsercc@0.1.1/dist/clang.wasm",
  "https://cdn.jsdelivr.net/npm/browsercc@0.1.1/dist/lld.wasm",
  "https://cdn.jsdelivr.net/npm/@bjorn3/browser_wasi_shim@0.4.2/+esm",
];

let warmPromise: Promise<void> | null = null;
function warmToolchainCache(): Promise<void> {
  if (!warmPromise) {
    warmPromise = (async () => {
      try {
        const hasLocalStorage = typeof localStorage !== "undefined" && typeof localStorage.getItem === "function";
        if (hasLocalStorage && localStorage.getItem(TOOLCHAIN_STAMP) === "ok") return;
        for (const asset of TOOLCHAIN_ASSETS) {
          const res = await fetch(asset, { cache: "reload" });
          if (res.body) await res.body.cancel();
        }
        if (hasLocalStorage) localStorage.setItem(TOOLCHAIN_STAMP, "ok");
      } catch {
        /* offline — the compile step falls back to simulated judging */
      }
    })();
  }
  return warmPromise;
}

type CompilerModule = {
  compile: (job: { source: string; fileName: string; flags: string[] }) => Promise<{ compileOutput: string; module: WebAssembly.Module | null }>;
};

let compilerPromise: Promise<CompilerModule> | null = null;
let toolchainReadyFlag = false;

/** True once the Clang→WASM toolchain has been downloaded and is reusable. */
export function isNativeToolchainReady(): boolean {
  return toolchainReadyFlag;
}

async function getCompiler(): Promise<CompilerModule> {
  if (!compilerPromise) {
    const specifier: string = BROWSERCC_URL;
    compilerPromise = import(/* @vite-ignore */ specifier)
      .then((m) => m as unknown as CompilerModule)
      .catch((e) => {
        compilerPromise = null;
        throw e;
      });
  }
  return compilerPromise;
}

let shimPromise: Promise<any> | null = null;

async function getShim(): Promise<any> {
  if (!shimPromise) {
    const specifier: string = WASI_SHIM_URL;
    shimPromise = import(/* @vite-ignore */ specifier)
      .then((m) => m as any)
      .catch((e) => {
        shimPromise = null;
        throw e;
      });
  }
  return shimPromise;
}

/* Reuse the previously compiled module when the same source is judged again
   (Run then Submit share the same code — no need to recompile). */
const moduleCache = new Map<string, WebAssembly.Module>();
const MODULE_CACHE_LIMIT = 6;

export type NativeOutcome = { actual: string; error: string | null; exitCode?: number };
export type NativeJudgeResult = {
  outcomes: NativeOutcome[];
  compileError?: string;
  compile_ms?: number;
  runtimeUnavailable?: boolean;
};

async function compileToModule(
  language: "c" | "cpp",
  source: string
): Promise<{ module: WebAssembly.Module | null; compileOutput: string; compile_ms: number; timedOut?: boolean }> {
  const compiler = await getCompiler();
  toolchainReadyFlag = true;
  const cacheKey = `${language}\u0000${source}`;
  const cached = moduleCache.get(cacheKey);
  if (cached) return { module: cached, compileOutput: "", compile_ms: 0 };

  const fileName = language === "c" ? "main.c" : "main.cpp";
  /* browsercc always drives clang as "clang++", so even .c files compile in C++
     mode (a C -std flag is rejected) — and it computes link args against a dummy
     sysroot, so the standard libraries are never put on the wasm-ld line for us.
     Keep it simple: no -std, link the std libs explicitly for each language. */
  const flags = language === "c" ? ["-lc"] : ["-std=c++17", "-lc++", "-lc++abi", "-lm", "-lc"];
  const t0 = performance.now();
  let result: { compileOutput: string; module: WebAssembly.Module | null };
  try {
    result = await Promise.race([
      compiler.compile({ source, fileName, flags }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("TOOLCHAIN_TIMEOUT")), COMPILE_TIMEOUT_MS)),
    ]);
  } catch (e) {
    return { module: null, compileOutput: "", compile_ms: Math.round(performance.now() - t0), timedOut: true };
  }
  const compile_ms = Math.round(performance.now() - t0);
  if (result.module) {
    moduleCache.set(cacheKey, result.module);
    if (moduleCache.size > MODULE_CACHE_LIMIT) moduleCache.delete(moduleCache.keys().next().value as string);
  }
  return { module: result.module, compileOutput: result.compileOutput, compile_ms };
}

export async function runNativeCode(
  language: "c" | "cpp",
  source: string,
  tests: { input: string; expected: string }[]
): Promise<NativeJudgeResult> {
  await warmToolchainCache();
  let shim: any;
  try {
    shim = await getShim();
  } catch {
    return { outcomes: [], runtimeUnavailable: true };
  }
  const { WASI, File, OpenFile, ConsoleStdout, WASIProcExit } = shim;

  const compiled = await compileToModule(language, source);
  if (compiled.timedOut) return { outcomes: [], runtimeUnavailable: true };
  if (!compiled.module) {
    return { outcomes: [], compileError: compiled.compileOutput || "Compilation failed with no diagnostic.", compile_ms: compiled.compile_ms };
  }

  const module = compiled.module;
  const decoder = new TextDecoder();
  const outcomes: NativeOutcome[] = [];

  for (const t of tests) {
    const stdin = new TextEncoder().encode(t.input.endsWith("\n") ? t.input : `${t.input}\n`);
    let out = "";
    let err = "";
    const fds = [
      new OpenFile(new File(stdin)),
      new ConsoleStdout((buf: Uint8Array) => {
        out += decoder.decode(buf);
      }),
      new ConsoleStdout((buf: Uint8Array) => {
        err += decoder.decode(buf);
      }),
    ];
    const wasi = new WASI([], [], fds);
    try {
      const instance = await WebAssembly.instantiate(module, { wasi_snapshot_preview1: wasi.wasiImport });
      wasi.start(instance);
      outcomes.push({ actual: out, error: err || null });
    } catch (e: any) {
      if (e instanceof WASIProcExit) {
        const failed = e.code !== undefined && e.code !== 0;
        outcomes.push({ actual: out, error: err || (failed ? `Process exited with code ${e.code}` : null), exitCode: e.code });
      } else {
        outcomes.push({ actual: out, error: err || String(e?.message ?? e) });
      }
    }
  }

  return { outcomes, compile_ms: compiled.compile_ms, compileError: undefined };
}