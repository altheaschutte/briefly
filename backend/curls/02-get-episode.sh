#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Usage:
#   source backend/curls/01-login.sh
#   backend/curls/02-get-episode.sh <episode_id>

# shellcheck disable=SC1091
source "${SCRIPT_DIR}/00-env.sh"

require_env TOKEN

EPISODE_ID="${1:-}"
if [[ -z "${EPISODE_ID}" ]]; then
  echo "Usage: $0 <episode_id>" >&2
  exit 2
fi

curl -sS \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  "${API_URL%/}/episodes/${EPISODE_ID}" \
  | jq .

