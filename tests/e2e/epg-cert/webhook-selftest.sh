#!/usr/bin/env bash
#
# EPG webhook self-test
# ---------------------
# Verifies the DEPLOYED /api/webhooks/epg endpoint is reachable and that its
# Basic-auth credentials match your .env.local. It posts a NON-EXISTENT
# customReference, which the handler ignores ("No payment record — ignoring")
# and answers {"ok":true} — so it never touches a real payment/batch.
#
# Usage (from repo root):
#   tests/e2e/epg-cert/webhook-selftest.sh                 # tests the prod alias
#   tests/e2e/epg-cert/webhook-selftest.sh <WEBHOOK_URL>   # tests a specific URL
#   WEBHOOK_URL=https://<ngrok-id>.ngrok-free.dev/api/webhooks/epg \
#     tests/e2e/epg-cert/webhook-selftest.sh               # e.g. dev tunnel
#
# What it CANNOT check: the Converge merchant-portal notification subscription
# (its URL / enabled state / Basic-auth creds). If BOTH checks below PASS but
# real payments still hang at 'pending_authorization', the portal subscription
# is the culprit — it must point at this exact URL, be ENABLED, and use the same
# EPG_WEBHOOK_USERNAME / EPG_WEBHOOK_PASSWORD as below.

ENV_FILE="${ENV_FILE:-.env.local}"
DEFAULT_URL="https://aydt-registration-admin-portal.vercel.app/api/webhooks/epg"
WEBHOOK_URL="${1:-${WEBHOOK_URL:-$DEFAULT_URL}}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "✗ $ENV_FILE not found — run from the repo root or set ENV_FILE=/path/to/.env.local" >&2
  exit 1
fi

# Read a value from the env file and strip surrounding quotes / trailing CR.
read_env() {
  grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- \
    | sed -e 's/\r$//' -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'\$//"
}

U="$(read_env EPG_WEBHOOK_USERNAME)"
P="$(read_env EPG_WEBHOOK_PASSWORD)"
if [[ -z "$U" || -z "$P" ]]; then
  echo "✗ EPG_WEBHOOK_USERNAME / EPG_WEBHOOK_PASSWORD missing in $ENV_FILE" >&2
  exit 1
fi

echo "▶ EPG webhook self-test → $WEBHOOK_URL"
echo

# 1. Unauthenticated POST must be rejected (401).
noauth="$(curl -s -o /dev/null -m 15 -w '%{http_code}' -X POST \
  -H 'Content-Type: application/json' -d '{"test":1}' "$WEBHOOK_URL" 2>/dev/null || echo 000)"
if [[ "$noauth" == "401" ]]; then
  echo "✓ [1/2] No-auth POST rejected (HTTP 401) — auth is enforced"
else
  echo "✗ [1/2] No-auth POST returned HTTP $noauth (expected 401)"
fi

# 2. Authenticated POST with a non-existent reference must be accepted (200)
#    and ignored — proving the endpoint is reachable and the creds match.
resp="$(curl -s -m 15 -w $'\n%{http_code}' -X POST -u "$U:$P" \
  -H 'Content-Type: application/json' \
  -d '{"eventType":"saleCaptured","transaction":{"customReference":"selftest-nonexistent-0000"}}' \
  "$WEBHOOK_URL" 2>/dev/null || printf '\n000')"
code="$(printf '%s' "$resp" | tail -n1)"
body="$(printf '%s' "$resp" | sed '$d')"
if [[ "$code" == "200" ]]; then
  echo "✓ [2/2] Auth POST accepted (HTTP 200) — endpoint reachable & .env.local creds match the deployment"
  echo "        response: $body"
else
  echo "✗ [2/2] Auth POST returned HTTP $code (expected 200) — endpoint unreachable or creds mismatch"
  echo "        response: $body"
fi

echo
if [[ "$noauth" == "401" && "$code" == "200" ]]; then
  echo "RESULT: endpoint OK. If real payments still hang at 'pending_authorization',"
  echo "        the problem is the Converge portal subscription (URL / ENABLED / creds),"
  echo "        not this endpoint."
  exit 0
else
  echo "RESULT: endpoint problem — fix the deployment URL / creds before touching the portal."
  exit 1
fi
