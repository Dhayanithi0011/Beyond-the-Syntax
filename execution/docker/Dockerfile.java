FROM eclipse-temurin:21-jdk-jammy
RUN useradd --no-create-home --uid 1000 runner
USER runner
WORKDIR /sandbox
