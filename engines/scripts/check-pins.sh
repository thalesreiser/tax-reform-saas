#!/usr/bin/env bash
# Fails if a tag pinned in engines/versions.env no longer points to its pinned commit (ADR 004).
# Usage: check-pins.sh [versions.env]
set -euo pipefail

# shellcheck source=/dev/null
source "${1:-engines/versions.env}"

check() {
  # For an annotated tag the peeled line (^{}) holds the commit; it is listed last.
  local actual
  actual=$(git ls-remote --tags "https://github.com/$1.git" "refs/tags/$2" "refs/tags/$2^{}" | tail -n 1 | cut -f 1)
  if [[ $actual != "$3" ]]; then
    echo "::error::$1 tag $2 points to ${actual:-nothing}, expected $3"
    exit 1
  fi
  echo "ok   $1 $2 = $3"
}

check "$REGIME_REGULAR_REPO" "$REGIME_REGULAR_TAG" "$REGIME_REGULAR_SHA"
check "$SIMPLES_NACIONAL_REPO" "$SIMPLES_NACIONAL_TAG" "$SIMPLES_NACIONAL_SHA"
