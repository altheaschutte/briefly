#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Usage:
#   source backend/curls/01-login.sh
#   backend/curls/03-generate-episode.sh [duration_minutes]

# shellcheck disable=SC1091
source "${SCRIPT_DIR}/00-env.sh"

require_env TOKEN

DURATION_MINUTES="${1:-}"

if [[ -z "${DURATION_MINUTES}" ]]; then
  curl -sS -X POST \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{}' \
    "${API_URL%/}/episodes" \
    | jq .
  exit 0
fi

if [[ "${DURATION_MINUTES}" =~ ^[0-9]+$ ]]; then
  curl -sS -X POST \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"duration\":${DURATION_MINUTES}}" \
    "${API_URL%/}/episodes" \
    | jq .
  exit 0
fi

echo "Duration must be an integer minutes value (got: ${DURATION_MINUTES})" >&2
exit 2

