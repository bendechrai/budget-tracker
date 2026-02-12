#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

usage() {
  echo "Usage: ./ralph.sh <plan|build|stop>"
  echo ""
  echo "  ./ralph.sh plan    Run Ralph in plan mode"
  echo "  ./ralph.sh build   Run Ralph in build mode (runs until all tasks are done)"
  echo "  ./ralph.sh stop    Stop Ralph after the current iteration"
  exit 1
}

if [ $# -lt 1 ]; then
  usage
fi

MODE="$1"

if [ "$MODE" = "stop" ]; then
  touch .ralph-stop
  echo "Stop file created. Ralph will stop after the current iteration."
  exit 0
fi

if [ "$MODE" != "plan" ] && [ "$MODE" != "build" ]; then
  echo "Error: mode must be 'plan', 'build', or 'stop'"
  usage
fi

# Render devports templates
PROJECT=$(basename "$(pwd)")
devports render --project "$PROJECT" --output .env .env.devports
devports render --project "$PROJECT" --output docker-compose.yml docker-compose.yml.devports

# Check that web + db are running
if ! docker compose ps --status running web | grep -q web; then
  echo "Error: web container is not running. Start it first with: ./dev.sh"
  exit 1
fi

# Clear any stale stop file from a previous run
rm -f .ralph-stop

op run --env-file=.env -- docker compose --profile ralph run --rm --build \
  -e RALPH_MODE="$MODE" \
  ralph
