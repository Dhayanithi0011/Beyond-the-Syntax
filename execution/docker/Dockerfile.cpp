# Minimal, network-isolated C++ runner. Built without any package manager
# access at container run-time — everything needed is baked in at build time.
FROM gcc:13-bookworm

RUN useradd --no-create-home --uid 1000 runner
USER runner
WORKDIR /sandbox

# No ENTRYPOINT that shells out to arbitrary commands — the execution service
# passes the exact compile/run invocation per job, e.g.:
#   g++ -O2 -o /tmp/a.out main.cpp && /tmp/a.out < input.txt
