#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -f "${ROOT_DIR}/.env" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ROOT_DIR}/.env"
  set +a
fi

API_URL="${API_URL:-http://127.0.0.1:3344}"
SUPABASE_PROJECT_URL="${SUPABASE_PROJECT_URL:-http://127.0.0.1:54321}"

export API_URL
export SUPABASE_PROJECT_URL

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required env var: ${name}" >&2
    return 1
  fi
}

