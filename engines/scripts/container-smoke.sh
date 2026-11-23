#!/usr/bin/env bash
# Checks one running engine container (MOT-01.2): the version endpoint shows the pinned tag and the
# database version, the upstream example returns the expected values, and memory stays under the
# container's real limit after a burst of requests.
#
# Usage: container-smoke.sh <container> <base-url> <version-path> <expected-tag> <case-dir> <label>
#
# Appends one Markdown table row to $RESULTS_FILE and writes "<label>=<database version>" to
# $DB_VERSIONS_FILE. Only fixture data (official public examples) is ever printed.
set -euo pipefail

container=$1 base_url=$2 version_path=$3 expected_tag=$4 case_dir=$5 label=$6
results=${RESULTS_FILE:?RESULTS_FILE must be set}
db_versions=${DB_VERSIONS_FILE:?DB_VERSIONS_FILE must be set}
warm_requests=${WARM_REQUESTS:-200}
work=$(mktemp -d)
failures=0
fail() {
  echo "::error::$label: $1"
  failures=$((failures + 1))
}

# Version endpoint: application version (the release tag) and database version.
curl -fsS -o "$work/version.json" "$base_url$version_path"
echo "$label $version_path: $(jq -c . "$work/version.json")"
app_version=$(jq -r '.versaoApp // empty' "$work/version.json")
db_version=$(jq -r '.versaoDb // empty' "$work/version.json")
[[ $app_version == "$expected_tag" ]] || fail "versaoApp is '$app_version', expected $expected_tag"
[[ -n $db_version ]] || fail "versaoDb is empty"
echo "$label=$db_version" >>"$db_versions"

# Official example.
path=$(jq -r '.path' "$case_dir/case.json")
url="$base_url$path"
status=$(curl -sS -o "$work/response.json" -w '%{http_code}' -H 'Content-Type: application/json' \
  --data-binary @"$case_dir/request.json" "$url")
if [[ $status != 200 ]]; then
  fail "POST $path returned HTTP $status"
else
  while IFS=$'\t' read -r filter expected; do
    actual=$(jq -r "$filter" "$work/response.json")
    if [[ $actual == "$expected" ]]; then
      echo "ok   $filter = $actual"
    else
      fail "$filter expected $expected, got $actual"
    fi
  done < <(jq -r '.checks | to_entries[] | [.key, .value] | @tsv' "$case_dir/case.json")
fi

# Burst of requests, then memory as the container's cgroup and the JVM process see it.
for _ in $(seq "$warm_requests"); do
  curl -fsS -o /dev/null -H 'Content-Type: application/json' \
    --data-binary @"$case_dir/request.json" "$url" || fail "a warm-up request failed"
done

cg() { docker exec "$container" cat "/sys/fs/cgroup/$1" 2>/dev/null || echo 0; }
mb() { awk -v b="$1" 'BEGIN { printf "%d", b / 1048576 }'; }
limit=$(cg memory.max)
current=$(cg memory.current)
peak=$(cg memory.peak)
oom_kills=$(cg memory.events | awk '$1 == "oom_kill" { print $2 }')
jvm_peak_kb=$(docker exec "$container" cat /proc/1/status | awk '/^VmHWM:/ { print $2 }')
spring_s=$(docker logs "$container" 2>&1 | grep -oP 'Started \S+ in \K[0-9.]+' | head -n 1 || true)
read -r oom_killed restarts < <(docker inspect -f '{{.State.OOMKilled}} {{.RestartCount}}' "$container")

[[ $limit =~ ^[0-9]+$ ]] || fail "no memory limit on the container (memory.max = $limit)"
[[ ${oom_kills:-0} == 0 && $oom_killed == false && $restarts == 0 ]] ||
  fail "out of memory (oom_kill=$oom_kills, OOMKilled=$oom_killed, restarts=$restarts)"

printf '| %s | %s | %s | %s | %s | %s | %s | %s | %s | %s |\n' \
  "$label" "$app_version" "$db_version" "${spring_s:-?}" \
  "$([[ $failures == 0 ]] && echo pass || echo FAIL)" "$warm_requests" \
  "$(mb "$current")" "$(mb "$peak")" "$((jvm_peak_kb / 1024))" "$(mb "$limit")" >>"$results"

if ((failures > 0)); then
  echo "::error::$label: $failures check(s) failed"
  exit 1
fi
