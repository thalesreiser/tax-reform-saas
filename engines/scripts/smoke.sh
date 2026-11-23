#!/usr/bin/env bash
# Starts one official engine jar (offline profile), waits until it is healthy, measures start-up time
# and memory, posts the upstream example and asserts the expected values.
#
# Usage: smoke.sh <engine-dir> <jar> <http-port> <mgmt-port> <case-dir> <label> [java options...]
#   engine-dir  upstream checkout holding target/<jar> and calculadora/db/calculadora-pro.db
#   case-dir    folder with request.json and case.json ({ path, checks: { jq filter: expected } })
#   label       name of this run in the results table (e.g. "default", "512m")
#
# Appends one Markdown table row to $RESULTS_FILE. Only fixture data (official public examples) is
# ever printed.
set -euo pipefail

engine_dir=$1 jar=$2 http_port=$3 mgmt_port=$4 case_dir=$(realpath "$5") label=$6
shift 6
java_opts=("$@")
results=${RESULTS_FILE:?RESULTS_FILE must be set}
ready_timeout=${READY_TIMEOUT:-240}
warm_requests=${WARM_REQUESTS:-50}

cd "$engine_dir"
log="$PWD/engine-$label.log"
response="$PWD/response-$label.json"
path=$(jq -r '.path' "$case_dir/case.json")
url="http://localhost:$http_port$path"

max_heap_mb=$(java "${java_opts[@]}" -XX:+PrintFlagsFinal -version 2>/dev/null |
  awk '$2 == "MaxHeapSize" { printf "%d", $4 / 1048576 }')

start_ns=$(date +%s%N)
java "${java_opts[@]}" -Dspring.profiles.active=offline -jar "target/$jar" >"$log" 2>&1 &
pid=$!
trap 'kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true' EXIT

until curl -fsS -o /dev/null "http://localhost:$mgmt_port/health" 2>/dev/null; do
  if ! kill -0 "$pid" 2>/dev/null; then
    echo "::error::$label: the engine exited before becoming healthy"
    tail -n 80 "$log"
    exit 1
  fi
  if (($(date +%s%N) - start_ns >= ready_timeout * 1000000000)); then
    echo "::error::$label: not healthy after ${ready_timeout}s"
    tail -n 80 "$log"
    exit 1
  fi
  sleep 0.25
done
ready_ms=$((($(date +%s%N) - start_ns) / 1000000))
spring_s=$(grep -oP 'Started \S+ in \K[0-9.]+' "$log" | head -n 1 || true)
rss_idle_kb=$(ps -o rss= -p "$pid" | tr -d ' ')

status=$(curl -sS -o "$response" -w '%{http_code}' -H 'Content-Type: application/json' \
  --data-binary @"$case_dir/request.json" "$url")
first_ms=$(curl -sS -o /dev/null -w '%{time_total}' -H 'Content-Type: application/json' \
  --data-binary @"$case_dir/request.json" "$url" | awk '{ printf "%.0f", $1 * 1000 }')

failures=0
if [[ $status != 200 ]]; then
  echo "::error::$label: POST $path returned HTTP $status"
  failures=1
else
  while IFS=$'\t' read -r filter expected; do
    actual=$(jq -r "$filter" "$response")
    if [[ $actual == "$expected" ]]; then
      echo "ok   $filter = $actual"
    else
      echo "::error::$label: $filter expected $expected, got $actual"
      failures=$((failures + 1))
    fi
  done < <(jq -r '.checks | to_entries[] | [.key, .value] | @tsv' "$case_dir/case.json")
fi

warm_start=$(date +%s%N)
for _ in $(seq "$warm_requests"); do
  curl -sS -o /dev/null -H 'Content-Type: application/json' \
    --data-binary @"$case_dir/request.json" "$url"
done
warm_avg_ms=$(((($(date +%s%N) - warm_start) / 1000000) / warm_requests))

rss_after_kb=$(ps -o rss= -p "$pid" | tr -d ' ')
peak_kb=$(awk '/^VmHWM:/ { print $2 }' "/proc/$pid/status")

mb() { awk -v kb="$1" 'BEGIN { printf "%d", kb / 1024 }'; }
printf '| %s | `%s` | %s | %s | %s | %s | %s | %s | %s | %s | %s |\n' \
  "$label" "${java_opts[*]:-(none)}" "$max_heap_mb" \
  "$(awk -v ms="$ready_ms" 'BEGIN { printf "%.1f", ms / 1000 }')" "${spring_s:-?}" \
  "$(mb "$rss_idle_kb")" "$(mb "$rss_after_kb")" "$(mb "$peak_kb")" \
  "$first_ms" "$warm_avg_ms" "$([[ $failures == 0 ]] && echo pass || echo FAIL)" >>"$results"

if ((failures > 0)); then
  echo "::error::$label: $failures check(s) failed against the official example"
  exit 1
fi
