#!/usr/bin/env bash

# ⚡ Execute 5-Pillar Agent in 1 Line via cURL
ENDPOINT="${LIATE_ENDPOINT:-http://localhost:7071}"
PROMPT="${1:-What is the current time in Mumbai?}"

echo "🚀 Running Sovereign Agent via cURL ($ENDPOINT)..."

curl -s -X POST "$ENDPOINT/api/agent/run" \
  -H "Content-Type: application/json" \
  -d "{
    \"spec\": $(cat agent.json),
    \"prompt\": \"$PROMPT\"
  }" | jq .
