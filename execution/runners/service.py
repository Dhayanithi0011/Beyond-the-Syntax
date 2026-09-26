"""
Execution microservice — the ONLY place student code ever actually runs.

Runs as a separate process/container from the main API. Receives a job, launches
a disposable, network-disabled Docker container per execution with strict
CPU/memory/pids/time limits, and returns a bounded result. See
docs/ARCHITECTURE.md section 6 for the full contract this must satisfy before
being wired into `backend/app/services/execution_client.py`.

This file is a structural skeleton for Phase 10 — the actual `docker` SDK calls,
per-language compile/run commands, and output-size truncation are implemented
next, along with the Dockerfiles for each language runner under ../docker/.
"""
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="Beyond The Syntax — Execution Service")

LANGUAGE_IMAGES = {
    "c": "beyond-syntax/runner-c:latest",
    "cpp": "beyond-syntax/runner-cpp:latest",
    "java": "beyond-syntax/runner-java:latest",
    "python": "beyond-syntax/runner-python:latest",
}


class ExecuteRequest(BaseModel):
    language: str
    source_code: str
    stdin: str = ""
    time_limit_ms: int = 2000
    memory_limit_mb: int = 256


class ExecuteResponse(BaseModel):
    status: str  # "ok" | "compilation_error" | "runtime_error" | "tle" | "mle"
    stdout: str
    stderr: str
    time_ms: int
    memory_kb: int


@app.post("/execute", response_model=ExecuteResponse)
async def execute(req: ExecuteRequest):
    """
    Intended flow (implemented in Phase 10):
      1. Write source_code to a temp dir mounted read-only into the container.
      2. `docker run --rm --network none --cpus=0.5 --memory={mb}m
         --memory-swap={mb}m --pids-limit=64 --read-only
         --tmpfs /tmp:rw,size=64m -i {image} <compile+run script>`
      3. Feed stdin, enforce a wall-clock timeout that kills the container
         and reports `tle` on expiry.
      4. Cap captured stdout/stderr at a fixed byte limit.
      5. Parse the runner's reported peak memory (via /usr/bin/time or cgroup
         stats) and classify as `mle` if it exceeds memory_limit_mb.
    """
    raise NotImplementedError("Sandboxed execution implemented in Phase 10")
