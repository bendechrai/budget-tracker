#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

# Render devports templates (ensures template changes take effect)
PROJECT=$(basename "$(pwd)")
devports render --project "$PROJECT" --output .env .env.devports
devports render --project "$PROJECT" --output docker-compose.yml docker-compose.yml.devports

if [ "${1:-}" = "down" ]; then
  op run --env-file=.env -- docker compose down
  exit 0
fi

op run --env-file=.env -- docker compose up --build "$@"
