FROM gcc:13-bookworm
RUN useradd --no-create-home --uid 1000 runner
USER runner
WORKDIR /sandbox
