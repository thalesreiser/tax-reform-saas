# One image per official Receita Federal engine (MOT-01.2, ADR 004), from this single Dockerfile.
# The upstream sources come in as build contexts, checked out by CI at the commits pinned in
# engines/versions.env (engines/scripts/check-pins.sh fails if a tag moved). They are built as they
# are: the engines are never modified.
#
#   docker buildx build -f engines/Dockerfile \
#     --build-context regime-regular=<calculadora-rtc-regime-regular checkout> \
#     --build-arg JAR=api-simples-nacional.jar --build-arg HTTP_PORT=8082 --build-arg MGMT_PORT=9103 \
#     <engine checkout>
#
# Base images are pinned by digest; Dependabot (docker ecosystem) proposes updates.

# Build tools: the upstream Maven wrapper (3.2.0) downloads its jar with curl or wget, and the JDK
# image has neither. Only this build stage gets curl; the runtime image does not.
# eclipse-temurin:25.0.5.1_2-jdk-noble
FROM eclipse-temurin:25.0.5.1_2-jdk-noble@sha256:c7eef3dfeb81468533ea48c67bddaa8c7ca916454259e4d0d734d12bcff8e125 AS maven
RUN apt-get update \
 && apt-get install --yes --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*

# Shared database: Flyway SQLite file generated from the regime-regular scripts. The Simples
# repository has none; its README says to use these, so both images carry the same file.
FROM maven AS database
WORKDIR /src
COPY --from=regime-regular . .
RUN --mount=type=cache,target=/root/.m2,id=engines-m2,sharing=locked \
    mkdir -p calculadora/db \
 && ./mvnw --batch-mode --errors --no-transfer-progress flyway:migrate \
      -Dflyway.configFiles=./flyway/flyway-pro.conf

# Jar built with the upstream Maven wrapper. Upstream tests are skipped: they are the publisher's
# responsibility, and CI checks the image against the official example.
FROM maven AS build
ARG JAR
WORKDIR /src
COPY . .
RUN --mount=type=cache,target=/root/.m2,id=engines-m2,sharing=locked \
    ./mvnw --batch-mode --errors --no-transfer-progress -DskipTests package \
 && cp "target/${JAR:?JAR build argument is required}" /engine.jar

# eclipse-temurin:25.0.5.1_2-jre-noble
FROM eclipse-temurin:25.0.5.1_2-jre-noble@sha256:2ec98aa522c472deadfd2b7c5b39bca680e33ef522a53a72f10789bdf89a6bb5 AS runtime
ARG HTTP_PORT
ARG MGMT_PORT
ARG ENGINE_TAG=unknown
ARG ENGINE_COMMIT=unknown
ARG DATABASE_TAG=unknown
LABEL org.opencontainers.image.version="${ENGINE_TAG}" \
      org.opencontainers.image.description="Official Receita Federal tax engine, unmodified, offline profile" \
      trs.engine.commit="${ENGINE_COMMIT}" \
      trs.engine.database-tag="${DATABASE_TAG}"

RUN useradd --system --uid 10001 --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin engine

# The offline profile opens ./calculadora/db/calculadora-pro.db read-only, relative to the working
# directory. Files stay owned by root, so the process can change neither the jar nor the database.
WORKDIR /app
COPY --from=build /engine.jar ./engine.jar
COPY --from=database --chmod=0444 /src/calculadora/db/calculadora-pro.db ./calculadora/db/calculadora-pro.db

# No curl in the image: bash's /dev/tcp probes the engine's own management endpoint.
COPY --chmod=0755 <<'EOF' /usr/local/bin/engine-healthcheck
#!/bin/bash
exec 3<>"/dev/tcp/127.0.0.1/${ENGINE_HEALTH_PORT:?}" || exit 1
printf 'GET /health HTTP/1.0\r\nHost: localhost\r\n\r\n' >&3
IFS= read -r -t 4 status <&3 || exit 1
[[ $status == *" 200"* ]]
EOF

# JVM sized from the container limit (ADR 004); JDK_JAVA_OPTIONS can be replaced at run time.
# The SQLite driver extracts its native library to the temporary directory, which must be writable.
ENV ENGINE_HEALTH_PORT=${MGMT_PORT} \
    JDK_JAVA_OPTIONS="-XX:MaxRAMPercentage=75 -XX:+UseSerialGC -Xss512k -XX:+ExitOnOutOfMemoryError -Djava.io.tmpdir=/tmp"

USER engine
EXPOSE ${HTTP_PORT} ${MGMT_PORT}
# Start-up takes about 15 s on 4 vCPU and longer on small hosts (ADR 004).
HEALTHCHECK --interval=15s --timeout=5s --start-period=90s --start-interval=3s --retries=3 \
  CMD ["engine-healthcheck"]
ENTRYPOINT ["java", "-Dspring.profiles.active=offline", "-jar", "/app/engine.jar"]
