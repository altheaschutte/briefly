#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Usage:
#   source backend/curls/01-login.sh
# Then:
#   echo "$TOKEN"

# shellcheck disable=SC1091
source "${SCRIPT_DIR}/00-env.sh"

require_env SUPABASE_ANON_KEY
require_env SUPABASE_TEST_EMAIL
require_env SUPABASE_TEST_PASSWORD

AUTH_URL="${SUPABASE_PROJECT_URL%/}/auth/v1/token?grant_type=password"

LOGIN_JSON="$(curl -sS -X POST "${AUTH_URL}" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${SUPABASE_TEST_EMAIL}\",\"password\":\"${SUPABASE_TEST_PASSWORD}\"}")"

TOKEN="$(echo "${LOGIN_JSON}" | jq -r '.access_token // empty')"
if [[ -z "${TOKEN}" ]]; then
  echo "Failed to get access_token. Response:" >&2
  echo "${LOGIN_JSON}" | jq . >&2 || true
  exit 1
fi

export TOKEN
echo "TOKEN set (masked): ${TOKEN:0:16}…"

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "Note: run this with 'source' to keep TOKEN in your shell." >&2
fi

