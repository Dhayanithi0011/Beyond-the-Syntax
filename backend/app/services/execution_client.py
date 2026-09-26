"""
Thin client for the execution service (see /execution). The API process never
runs student code itself in production — it submits a job description and
waits for a bounded result (see docs/ARCHITECTURE.md section 6 for the sandbox
contract).

In development (`dev_mode=True`), if the execution service is unreachable the
API falls back to a local dev judge that compiles/runs on the host machine
(Python via the current interpreter, C/C++ via gcc/g++, Java via javac, when
Present on PATH). This keeps Round 2 usable on a laptop during an event without
the sandbox service; it is NOT a sandbox — never enable it in production.
"""
import asyncio
import shutil
import sys

import httpx

from app.core.config import settings


class ExecutionResult:
    status: str  # "ok" | "compilation_error" | "runtime_error" | "tle" | "mle"
    stdout: str
    stderr: str
    time_ms: int
    memory_kb: int

    def __init__(self, status, stdout="", stderr="", time_ms=0, memory_kb=0):
        self.status = status
        self.stdout = stdout
        self.stderr = stderr
        self.time_ms = time_ms
        self.memory_kb = memory_kb


def _cap(text: str, limit: int = 32_000) -> str:
    return (text or "")[:limit]


async def _run_subprocess(cmd: list[str], stdin: str, time_limit_ms: int) -> ExecutionResult:
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except FileNotFoundError:
        return ExecutionResult("runtime_error", stderr=f"Local dev judge: command not found: {cmd[0]}")
    try:
        stdout, stderr = await asyncio.wait_for(
            proc.communicate(input=stdin.encode()), timeout=time_limit_ms / 1000 + 2
        )
    except asyncio.TimeoutError:
        proc.kill()
        return ExecutionResult("tle", stderr=f"Time limit of {time_limit_ms} ms exceeded")
    return ExecutionResult(
        "ok" if proc.returncode == 0 else "runtime_error",
        stdout=_cap(stdout.decode("utf-8", errors="replace")),
        stderr=_cap(stderr.decode("utf-8", errors="replace")),
        time_ms=0,
    )


async def dev_local_execute(
    *, language: str, source_code: str, stdin: str, time_limit_ms: int
) -> ExecutionResult:
    """Compile-if-needed then run against stdin. Returns ExecutionResult with a
    compiled binary's stderr surfaced as compilation_error when compilation
    fails. Memory is not measured (no sandbox)."""
    if language == "python":
        return await _run_subprocess(
            [sys.executable, "-I", "-c", source_code], stdin, time_limit_ms
        )

    tool = {
        "c": ("gcc", ["gcc", "-O2", "-o"]),
        "cpp": ("g++", ["g++", "-std=c++17", "-O2", "-o"]),
        "java": ("javac", ["javac"]),
    }.get(language)
    if tool is None or shutil.which(tool[0]) is None:
        return ExecutionResult(
            "compilation_error",
            stderr=f"Local dev judge unavailable for '{language}'. Start the execution service "
            f"({settings.execution_service_url}) or install {tool[0] if tool else 'a toolchain'}.",
        )

    import tempfile
    from pathlib import Path

    with tempfile.TemporaryDirectory() as tmp_dir:
        work = Path(tmp_dir)
        if language in ("c", "cpp"):
            ext = ".c" if language == "c" else ".cpp"
            src = work / ("main" + ext)
            exe = work / ("main" + (".exe" if sys.platform == "win32" else ""))
            src.write_text(source_code, encoding="utf-8")
            compile_cmd = tool[1] + [str(exe), str(src)]
            compile_result = await _run_subprocess(compile_cmd, "", 30_000)
            if compile_result.status != "ok":
                compile_result.status = "compilation_error"
                return compile_result
            return await _run_subprocess([str(exe)], stdin, time_limit_ms)

        # java
        src = work / "Main.java"
        src.write_text(source_code, encoding="utf-8")
        compile_result = await _run_subprocess(["javac", str(src)], "", 30_000)
        if compile_result.status != "ok":
            compile_result.status = "compilation_error"
            return compile_result
        return await _run_subprocess(["java", "-cp", str(work), "Main"], stdin, time_limit_ms)


async def execute_job(
    *, language: str, source_code: str, stdin: str, time_limit_ms: int, memory_limit_mb: int
) -> ExecutionResult:
    try:
        async with httpx.AsyncClient(base_url=settings.execution_service_url, timeout=30) as client:
            resp = await client.post(
                "/execute",
                json={
                    "language": language,
                    "source_code": source_code,
                    "stdin": stdin,
                    "time_limit_ms": time_limit_ms,
                    "memory_limit_mb": memory_limit_mb,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            return ExecutionResult(**data)
    except httpx.HTTPError:
        if not settings.dev_mode:
            raise
        return await dev_local_execute(
            language=language, source_code=source_code, stdin=stdin, time_limit_ms=time_limit_ms
        )