#!/usr/bin/env bash
set -euo pipefail

# This script runs inside the Ralph Docker container. Use ralph.sh to launch it.
if [ ! -f /.dockerenv ]; then
    echo "Error: loop.sh must run inside the Ralph container. Use ./ralph.sh instead."
    exit 1
fi

LOCKFILE="/tmp/ralph.lock"

# Prevent concurrent Ralph runs
if [ -f "$LOCKFILE" ]; then
  echo "Error: Ralph is already running (lockfile exists at $LOCKFILE)."
  echo "If this is stale, remove it manually: rm $LOCKFILE"
  exit 1
fi
trap 'rm -f "$LOCKFILE"' EXIT
touch "$LOCKFILE"

MODE="${RALPH_MODE:-build}"

# Resolve authentication — prefer subscription token over API key
if [ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]; then
  echo "Using Claude subscription token for authentication."
elif [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  echo "Using Anthropic API key for authentication."
else
  echo "Error: No authentication found. Set CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY."
  exit 1
fi

# Select prompt file
if [ "$MODE" = "plan" ]; then
  PROMPT_FILE="/project/PROMPT_plan.md"
elif [ "$MODE" = "build" ]; then
  PROMPT_FILE="/project/PROMPT_build.md"
else
  echo "Error: Unknown mode '$MODE'. Use 'plan' or 'build'."
  exit 1
fi

if [ ! -f "$PROMPT_FILE" ]; then
  echo "Error: Prompt file not found: $PROMPT_FILE"
  exit 1
fi

PROMPT="$(cat "$PROMPT_FILE")"

if [ "$MODE" = "plan" ]; then
  echo "Starting Ralph in plan mode (single shot)..."
else
  echo "Starting Ralph in build mode (runs until all tasks are done)..."
  echo "To stop after the current iteration: ./ralph.sh stop"
fi

cd /project

STOPFILE="/project/.ralph-stop"
LOGDIR="/project/logs/ralph"
mkdir -p "$LOGDIR"

# Plan mode is single-shot; build mode loops until stop file
if [ "$MODE" = "plan" ]; then
  LOGFILE="$LOGDIR/$(date +%Y%m%d-%H%M%S)-plan.log"

  echo ""
  echo "Log: $LOGFILE"
  echo ""

  claude -p "$PROMPT" \
    --dangerously-skip-permissions \
    --output-format=stream-json \
    --model opus \
    --verbose < /dev/null > "$LOGFILE" 2>&1
else
  i=0
  while true; do
    if [ -f "$STOPFILE" ]; then
      echo "Stop file detected. Exiting."
      break
    fi

    i=$((i + 1))
    LOGFILE="$LOGDIR/$(date +%Y%m%d-%H%M%S)-build-${i}.log"

    echo ""
    echo "=== Iteration $i ==="
    echo "Log: $LOGFILE"
    echo ""

    EXIT_CODE=0
    claude -p "$PROMPT" \
      --dangerously-skip-permissions \
      --output-format=stream-json \
      --model opus \
      --verbose < /dev/null > "$LOGFILE" 2>&1 || EXIT_CODE=$?

    if [ "$EXIT_CODE" -ne 0 ]; then
      echo "Warning: Claude exited with code $EXIT_CODE (see log for details)"
    fi

    # Push whatever we have
    git push 2>/dev/null || true

    echo "=== Iteration $i complete ==="

    # Brief pause before next iteration
    echo ""
    echo "Next iteration in 5s — run ./ralph.sh stop to stop after this cycle"
    for s in 5 4 3 2 1; do
      if [ -f "$STOPFILE" ]; then
        echo "Stop file detected. Exiting."
        break 2
      fi
      printf "\r  %d..." "$s"
      sleep 1
    done
    printf "\r       \r"
  done
fi

echo ""
echo "Ralph finished in $MODE mode."
