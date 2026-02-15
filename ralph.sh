#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

ROOT="$(pwd)"
PLAN="$ROOT/IMPLEMENTATION_PLAN.md"
LOGS_DIR="$ROOT/logs/ralph"

PROGRESS_STEP=0
PROGRESS_TOTAL=9
progress() {
  PROGRESS_STEP=$((PROGRESS_STEP + 1))
  local filled=$((PROGRESS_STEP * 20 / PROGRESS_TOTAL))
  local empty=$((20 - filled))
  local bar=""
  for ((j=0; j<filled; j++)); do bar+="#"; done
  for ((j=0; j<empty; j++)); do bar+="."; done
  printf '\r\033[K[%s] %s' "$bar" "$1" >&2
}
progress_done() {
  printf '\r\033[K' >&2
}

gather_status() {
  echo "=== RALPH STATUS REPORT ==="
  echo "Generated: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  echo ""

  # ── Task Progress ──────────────────────────────────────────────────────
  progress "Reading task progress..."
  echo "--- TASK PROGRESS ---"
  if [[ -f "$PLAN" ]]; then
    local completed backlog total pct
    completed=$(grep -c '^\- \[x\]' "$PLAN" 2>/dev/null || true)
    completed=${completed:-0}
    backlog=$(grep -c '^\- \[ \]' "$PLAN" 2>/dev/null || true)
    backlog=${backlog:-0}
    total=$((completed + backlog))
    if [[ $total -gt 0 ]]; then
      pct=$((completed * 100 / total))
    else
      pct=0
    fi
    echo "completed: $completed"
    echo "backlog: $backlog"
    echo "total: $total"
    echo "percent_complete: $pct%"
    echo ""

    # Per-spec breakdown
    echo "--- TASK BREAKDOWN BY SPEC ---"
    local current_spec="" spec_done=0 spec_todo=0

    while IFS= read -r line; do
      if [[ "$line" =~ ^###\ (.+) ]]; then
        if [[ -n "$current_spec" ]]; then
          echo "  $current_spec: $spec_done done, $spec_todo remaining"
        fi
        current_spec="${BASH_REMATCH[1]}"
        spec_done=0
        spec_todo=0
      elif [[ "$line" =~ ^\-\ \[x\] ]]; then
        spec_done=$((spec_done + 1))
      elif [[ "$line" =~ ^\-\ \[\ \] ]]; then
        spec_todo=$((spec_todo + 1))
      fi
    done < "$PLAN"
    if [[ -n "$current_spec" ]]; then
      echo "  $current_spec: $spec_done done, $spec_todo remaining"
    fi

    # Completed tasks list
    echo ""
    echo "--- COMPLETED TASKS ---"
    grep '^\- \[x\] \*\*' "$PLAN" | sed 's/- \[x\] \*\*/  - /;s/\*\*//' || true

    # In-progress tasks
    local in_progress_section=false
    echo ""
    echo "--- IN PROGRESS TASKS ---"
    while IFS= read -r line; do
      if [[ "$line" == "## In Progress" ]]; then
        in_progress_section=true
        continue
      fi
      if $in_progress_section; then
        if [[ "$line" =~ ^## ]]; then
          break
        fi
        if [[ "$line" == *"- [ ] "* ]]; then
          echo "  $line" | sed 's/- \[ \] \*\*/  - /;s/\*\*//'
        fi
      fi
    done < "$PLAN"

    # Next up (first 3 backlog tasks)
    echo ""
    echo "--- NEXT UP (first 3 backlog) ---"
    grep '^\- \[ \] \*\*' "$PLAN" | head -3 | sed 's/- \[ \] \*\*/  - /;s/\*\*//' || true
  else
    echo "No IMPLEMENTATION_PLAN.md found"
  fi

  echo ""

  # ── Git History (Ralph's commits) ──────────────────────────────────────
  progress "Reading git history..."
  echo "--- RALPH GIT COMMITS ---"
  git -C "$ROOT" log --author="Ralph" --format="  %h %ai %s" 2>/dev/null || echo "  No commits found"
  echo ""

  local total_commits
  total_commits=$(git -C "$ROOT" log --author="Ralph" --oneline 2>/dev/null | wc -l | tr -d ' ')
  echo "total_ralph_commits: $total_commits"

  # Files Ralph has touched
  progress "Counting files changed by Ralph..."
  echo ""
  echo "--- FILES CHANGED BY RALPH ---"
  local ralph_files ralph_file_count
  ralph_files=$(git -C "$ROOT" log --author="Ralph" --pretty=format: --name-only 2>/dev/null | sort -u | grep -v '^$' || true)
  ralph_file_count=$(echo "$ralph_files" | grep -c . 2>/dev/null || true)
  ralph_file_count=${ralph_file_count:-0}
  echo "total_files_touched: $ralph_file_count"
  echo "$ralph_files" | head -30 | sed 's/^/  /'
  if [[ $ralph_file_count -gt 30 ]]; then
    echo "  ... and $((ralph_file_count - 30)) more"
  fi

  echo ""

  # ── Ralph Runtime Status ──────────────────────────────────────────────
  progress "Checking runtime status..."
  echo "--- RALPH RUNTIME STATUS ---"
  local latest_log ralph_running=false
  latest_log=$(ls -t "$LOGS_DIR"/*.log 2>/dev/null | head -1)

  # Check if ralph docker container is running
  if docker compose ps --status running ralph 2>/dev/null | grep -q ralph; then
    ralph_running=true
  fi
  # Fallback: check if latest log was modified in the last 5 minutes
  if ! $ralph_running && [[ -n "$latest_log" ]]; then
    if find "$latest_log" -mmin -5 -print -quit 2>/dev/null | grep -q .; then
      ralph_running=true
    fi
  fi

  echo "ralph_running: $ralph_running"

  # If running, extract current task from the latest log
  if $ralph_running && [[ -n "$latest_log" ]]; then
    echo "current_session: $(basename "$latest_log")"
    local current_task
    current_task=$(python3 -c "
import json, sys, re
with open(sys.argv[1]) as f:
    for line in f:
        try:
            d = json.loads(line)
            if d.get('type') == 'assistant':
                for c in d.get('message',{}).get('content',[]):
                    text = c.get('text','')
                    if 'unchecked task' in text.lower():
                        m = re.search(r'\*\*[\"\u201c]?([^*\"\u201d]+)[\"\u201d]?\*\*', text)
                        if m:
                            print(m.group(1))
                            sys.exit(0)
        except: pass
" "$latest_log" 2>/dev/null)
    if [[ -n "$current_task" ]]; then
      echo "current_task: $current_task"
    fi
  fi
  echo ""

  # ── Build Sessions ─────────────────────────────────────────────────────
  progress "Scanning build sessions..."
  echo "--- BUILD SESSIONS ---"
  if [[ -d "$LOGS_DIR" ]]; then
    local plan_count build_count
    plan_count=$(ls "$LOGS_DIR"/*-plan-*.log 2>/dev/null | wc -l | tr -d ' ')
    build_count=$(ls "$LOGS_DIR"/*-build-*.log 2>/dev/null | wc -l | tr -d ' ')
    echo "plan_sessions: $plan_count"
    echo "build_sessions: $build_count"

    # Aggregate health stats across all sessions
    local total_reverts=0 failed_sessions=0 reverts
    for logfile in "$LOGS_DIR"/*.log; do
      [[ -e "$logfile" ]] || continue
      reverts=$(grep -cE 'git revert|git reset|reverting' "$logfile" 2>/dev/null || true)
      reverts=${reverts:-0}
      total_reverts=$((total_reverts + reverts))
      if grep -q '"subtype":"error"' "$logfile" 2>/dev/null; then
        failed_sessions=$((failed_sessions + 1))
      fi
    done
    echo "total_reverts: $total_reverts"
    echo "failed_sessions: $failed_sessions"
    echo ""

    # Recent session outcomes (last 10) with task names from result lines
    progress "Analyzing session outcomes..."
    echo "--- RECENT SESSION OUTCOMES (last 10) ---"
    python3 -c "
import json, os, re, glob, sys

logs = sorted(glob.glob(os.path.join(sys.argv[1], '*.log')))
for logpath in logs[-10:]:
    fname = os.path.basename(logpath)
    result_line = None
    for line in open(logpath):
        try:
            d = json.loads(line)
            if d.get('type') == 'result':
                result_line = d
        except:
            pass

    if result_line:
        status = result_line.get('subtype', 'unknown')
        result_text = result_line.get('result', '')
        m = re.search(r'\*\*([^*]+)\*\*', result_text)
        task = m.group(1).strip('\"') if m else result_text[:60]
        turns = result_line.get('num_turns', '?')
        duration_s = round(result_line.get('duration_ms', 0) / 1000)
        print(f'  {fname}: {status} ({turns} turns, {duration_s}s) -- {task}')
    else:
        print(f'  {fname}: IN PROGRESS (no result yet)')
" "$LOGS_DIR" 2>/dev/null

    # Build loop summary (each -build-1.log starts a new loop)
    echo ""
    echo "--- BUILD LOOPS ---"
    python3 -c "
import json, os, re, glob, sys
from datetime import datetime, timedelta

logs_dir = sys.argv[1]
logs = sorted(glob.glob(os.path.join(logs_dir, '*-build-*.log')))
if not logs:
    print('  No build logs found')
    sys.exit(0)

def parse_ts(fname):
    m = re.match(r'(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})', fname)
    if m:
        return datetime(*[int(g) for g in m.groups()])
    return None

def get_result(logpath):
    result = None
    for line in open(logpath):
        try:
            d = json.loads(line)
            if d.get('type') == 'result':
                result = d
        except: pass
    return result

def fmt_duration(td):
    total_s = int(td.total_seconds())
    if total_s < 60:
        return f'{total_s}s'
    h, rem = divmod(total_s, 3600)
    m, s = divmod(rem, 60)
    if h > 0:
        return f'{h}h{m:02d}m'
    return f'{m}m{s:02d}s'

# Group into loops (each -build-1.log starts a new loop)
loops = []
current_loop = []
for logpath in logs:
    fname = os.path.basename(logpath)
    m = re.search(r'-build-(\d+)\.log$', fname)
    if not m:
        continue
    if int(m.group(1)) == 1 and current_loop:
        loops.append(current_loop)
        current_loop = []
    current_loop.append(logpath)
if current_loop:
    loops.append(current_loop)

print(f'total_build_loops: {len(loops)}')
for i, loop in enumerate(loops, 1):
    first_fname = os.path.basename(loop[0])
    last_fname = os.path.basename(loop[-1])
    start_ts = parse_ts(first_fname)
    last_start_ts = parse_ts(last_fname)

    # Get end time: last session start + its duration from result line
    last_result = get_result(loop[-1])
    is_latest = (i == len(loops))

    if last_result:
        status = 'completed'
        last_duration_ms = last_result.get('duration_ms', 0)
        end_ts = last_start_ts + timedelta(milliseconds=last_duration_ms) if last_start_ts else None
    else:
        status = 'IN PROGRESS' if is_latest else 'unknown'
        end_ts = datetime.utcnow() if is_latest and last_start_ts else last_start_ts

    duration = ''
    if start_ts and end_ts:
        duration = f', ran {fmt_duration(end_ts - start_ts)}'

    start_str = start_ts.strftime('%H:%M') if start_ts else '?'
    date_str = start_ts.strftime('%Y-%m-%d') if start_ts else ''

    print(f'  loop {i}: started {date_str} {start_str}, {len(loop)} iterations{duration} ({status})')
    print(f'    first_log: {first_fname}')
    print(f'    last_log: {last_fname}')
" "$LOGS_DIR" 2>/dev/null
  else
    echo "No logs directory found at $LOGS_DIR"
  fi

  # ── Current Branch & Working Tree ──────────────────────────────────────
  progress "Reading git status..."
  echo "--- GIT STATUS ---"
  local branch uncommitted
  branch=$(git -C "$ROOT" branch --show-current 2>/dev/null || echo "unknown")
  echo "branch: $branch"
  uncommitted=$(git -C "$ROOT" status --porcelain 2>/dev/null | wc -l | tr -d ' ')
  echo "uncommitted_changes: $uncommitted"
  if [[ $uncommitted -gt 0 ]]; then
    echo "changed_files:"
    git -C "$ROOT" status --porcelain 2>/dev/null | sed 's/^/  /'
  fi

  echo ""

  # ── Test Count ─────────────────────────────────────────────────────────
  progress "Counting tests and source files..."
  echo "--- TESTS ---"
  local test_files test_cases
  test_files=$(find "$ROOT/web" \( -name '*.test.ts' -o -name '*.test.tsx' \) -not -path '*/node_modules/*' 2>/dev/null | wc -l | tr -d ' ')
  echo "test_files: $test_files"

  test_cases=0
  if [[ $test_files -gt 0 ]]; then
    test_cases=$(find "$ROOT/web" \( -name '*.test.ts' -o -name '*.test.tsx' \) -not -path '*/node_modules/*' -exec grep -c '^\s*\(it\|test\)(' {} + 2>/dev/null | awk -F: '{s+=$NF} END {print s}')
  fi
  echo "test_cases: $test_cases"

  echo "test_file_list:"
  find "$ROOT/web" \( -name '*.test.ts' -o -name '*.test.tsx' \) -not -path '*/node_modules/*' 2>/dev/null | sort | sed "s|$ROOT/||;s/^/  /"

  echo ""

  # ── Source Stats ───────────────────────────────────────────────────────
  echo "--- SOURCE STATS ---"
  local ts_files css_files migrations
  ts_files=$(find "$ROOT/web" \( -name '*.ts' -o -name '*.tsx' \) -not -path '*/node_modules/*' -not -path '*/generated/*' -not -path '*/.next/*' -not -name '*.test.*' -not -name '*.config.*' 2>/dev/null | wc -l | tr -d ' ')
  echo "source_files_ts: $ts_files"

  css_files=$(find "$ROOT/web" -name '*.module.css' -not -path '*/node_modules/*' -not -path '*/.next/*' 2>/dev/null | wc -l | tr -d ' ')
  echo "css_module_files: $css_files"

  migrations=$(find "$ROOT/web/prisma/migrations" -name 'migration.sql' 2>/dev/null | wc -l | tr -d ' ')
  echo "prisma_migrations: $migrations"

  echo ""
  echo "=== END REPORT ==="
  progress_done
}

usage() {
  echo "Usage: ./ralph.sh <plan|build|stop|status>"
  echo ""
  echo "  ./ralph.sh plan    Run Ralph in plan mode"
  echo "  ./ralph.sh build   Run Ralph in build mode (runs until all tasks are done)"
  echo "  ./ralph.sh stop    Stop Ralph after the current iteration"
  echo "  ./ralph.sh status  Print a human-readable project status report"
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

STATUS_PROMPT="You are Ralph's status reporter. Synthesize this data into a project status report.

Use this format:

# Ralph Status

**Status:** Running — working on *<task>* (loop N, iteration N) | Idle since <time>
**Progress:** N/N tasks (N%) \`Done  ████████████████████░░░░░░░░░░░░░░░░░░░░  47%\`

## What's Been Built

Summarize completed work grouped by feature area (auth, onboarding, etc). Then list the last 3-5 recently completed tasks.

## Remaining Work (N tasks across N specs)

| Spec | Tasks Left |
|------|-----------|
| ... | ... |

## Build Loop History

| Loop | Started | Iterations | Duration | Status |
|------|---------|-----------|----------|--------|
| 1 | MMM dd, HH:MM | ? | ?m | Done |
| ... | MMM dd, HH:MM | ? | ?h ?m | Done |
| N | MMM dd, HH:MM | ? | ?h ?m+ | **Running** |
|   |               |   | <total time > |      |

N total build sessions, last N all successful. Note average time per task if calculable.

## Issues

Reverts, failures, uncommitted changes. Or just \"No issues\" if clean.

## Test Suite

N test files, N test cases — N source files, N CSS modules, N Prisma migrations

---
Keep it concise. No filler. Use the exact section structure above. The progress bar should use block chars (█ and ░) scaled to 40 chars wide."

if [ "$MODE" = "status" ]; then
  status_data=$(gather_status)

  if [[ -n "${CLAUDECODE:-}" ]]; then
    # Inside Claude Code — output raw data + prompt for the calling session to synthesize
    progress_done
    echo "$status_data"
    echo ""
    echo "---"
    echo "Synthesize the above data using this format:"
    echo "$STATUS_PROMPT"
    exit 0
  fi

  if ! command -v claude &>/dev/null; then
    echo "Error: 'claude' CLI is not installed. Install it to use status mode."
    echo "See: https://docs.anthropic.com/en/docs/claude-code"
    exit 1
  fi
  PROGRESS_STEP=8
  progress "Synthesizing report..."
  response=$(echo "$status_data" | claude -p "$STATUS_PROMPT" --output-format text)
  progress_done
  echo "$response"
  exit 0
fi

if [ "$MODE" != "plan" ] && [ "$MODE" != "build" ]; then
  echo "Error: mode must be 'plan', 'build', 'stop', or 'status'"
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

# Check if all op:// secrets from .env are already in the environment
needs_op=false
while IFS= read -r line; do
  [[ "$line" =~ ^[[:space:]]*# ]] && continue
  [[ -z "$line" ]] && continue
  if [[ "$line" == *"op://"* ]]; then
    var_name="${line%%=*}"
    if [[ -z "${!var_name:-}" ]]; then
      needs_op=true
      break
    fi
  fi
done < .env

DOCKER_CMD=(docker compose --profile ralph run --rm --build -e RALPH_MODE="$MODE" ralph)

if $needs_op; then
  op run --env-file=.env -- "${DOCKER_CMD[@]}"
else
  "${DOCKER_CMD[@]}"
fi
