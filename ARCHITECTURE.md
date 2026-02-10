# Architecture

This document explains the design of the autonomous AI build agent pattern used in this template. The concepts are stack-agnostic — you can adapt them to any language, framework, or toolchain.

## Core Idea

An LLM builds your software incrementally by following a structured loop:

1. Human works with an LLM in interactive mode to write **specs** describing what to build
2. Agent reads specs and produces an **implementation plan** — a list of atomic tasks
3. Agent picks one task, implements it, validates it, updates the plan with results, commits, and stops
4. Step 3 repeats until all tasks are complete

The key insight: **one task per context window**. Instead of asking the agent to build an entire feature in one shot (where it loses focus, makes compound errors, and produces unvalidated code), we constrain it to small, validated increments.

## Why This Works

LLMs struggle with:
- **Long, compound tasks** — they lose coherence and skip steps
- **Accumulated errors** — one mistake cascades into many
- **Untested code** — they'll claim things work when they don't

This pattern addresses each problem:
- **Atomic tasks** — each task is small enough to fit entirely in the agent's attention
- **Validation gates** — every task must pass type-check, lint, and tests before committing
- **Fresh context** — each iteration starts clean, so errors don't accumulate across tasks
- **Revert on failure** — if validation fails and the agent can't fix it, it reverts everything and stops; a fresh iteration often succeeds where a stuck one couldn't

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  HOST                                                                       │
│  ┌─────────────┐                                                            │
│  │  ralph.sh   │ ─── starts ──▶ ralph container (runs loop.sh)             │
│  │  dev.sh     │ ─── starts ──▶ app container + database                   │
│  └─────────────┘                                                            │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  CONTAINERS                                                                 │
│                                                                             │
│  ┌──────────────────┐      docker exec      ┌──────────────────┐           │
│  │  ralph           │ ───────────────────▶  │  app (web)       │           │
│  │  - Claude Code   │      (validation)     │  - your app      │           │
│  │  - loop.sh       │                       │  - test runner   │           │
│  │  - git           │                       │  - linter        │           │
│  │  - docker cli    │                       │  - type checker  │           │
│  └──────────────────┘                       └──────────────────┘           │
│          │                                            │                     │
│          │ /project (mounted)                         │                     │
│          ▼                                            ▼                     │
│  ┌──────────────────────────────────────────────────────────────┐          │
│  │  PROJECT FILES (shared volume)                               │          │
│  │  specs/ ── IMPLEMENTATION_PLAN.md ── app source ── tests     │          │
│  └──────────────────────────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Container Roles

| Container | Purpose |
|-----------|---------|
| **App** | Runs your application in dev mode. Also hosts the toolchain (type checker, linter, test runner) that the agent uses for validation. |
| **Agent** | Runs the outer loop and invokes Claude Code. Has Docker CLI installed so it can `docker exec` into the app container for validation commands. |
| **Database** | (Optional) If your stack needs a database, it runs here. |

The agent container mounts the Docker socket from the host, allowing it to run `docker exec` commands against the app container. This is "Docker-out-of-Docker" — the agent doesn't run its own Docker daemon; it uses the host's.

## The Loop

```
┌─────────────────────────────────────────────────────────────────┐
│                         loop.sh                                 │
│                                                                 │
│   for i in 1..max_iterations:                                  │
│       if stop_file_exists: break                               │
│       invoke_claude(prompt)                                    │
│       git push                                                 │
│       sleep(countdown)                                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

Each iteration:
1. Checks for a stop signal (allows graceful shutdown)
2. Invokes Claude with a prompt file (plan mode or build mode)
3. Claude reads the plan, picks a task, implements it, validates, commits
4. The loop pushes changes and waits briefly before the next iteration

### Fresh Context Each Iteration

Claude starts each iteration with no memory of previous iterations. This is a feature, not a bug:
- Errors from a stuck iteration don't poison the next one
- The agent re-reads the plan and codebase fresh
- Complex multi-iteration features emerge from simple single-task executions

## Two Modes

### Plan Mode

The agent reads all specs and the current codebase, then produces (or updates) an implementation plan. The plan is a markdown file with three sections:

```markdown
## Completed
- [x] Tasks that are done

## In Progress
- [ ] The one task currently being worked on

## Backlog
- [ ] Future tasks in dependency order
```

Planning is **incremental**: completed tasks are never touched, unchanged specs keep their existing tasks, and new tasks are appended for new or changed specs.

### Build Mode

The agent picks the first unchecked task (In Progress, or first Backlog item), implements it, then validates:

```bash
# Validation gate (all must pass)
type-check    # e.g., tsc --noEmit, mypy, cargo check
lint          # e.g., eslint, ruff, clippy
test          # e.g., vitest, pytest, cargo test
build         # e.g., next build, cargo build --release
```

If validation passes: mark task complete in the plan, commit, stop.
If validation fails: fix and retry, or revert and stop (adding a note to the plan about what went wrong so the next iteration can learn from it).

During implementation, if the agent discovers work that needs doing but isn't in the plan, it adds new tasks to the backlog rather than doing them immediately.

The agent never starts a second task. One task, one commit, one iteration.

## Prompts

The agent's behavior is defined by prompt files:

| File | Purpose |
|------|---------|
| `PROMPT_plan.md` | Instructions for plan mode — how to read specs, break work into tasks, update the plan |
| `PROMPT_build.md` | Instructions for build mode — how to pick a task, implement it, validate, handle failures |
| `AGENTS.md` | Reference material — project structure, conventions, available commands |

These prompts encode your team's standards: coding conventions, testing requirements, commit message format, what tools to use, when to bail out.

### Prompt Design Principles

1. **Be explicit about the validation sequence.** List the exact commands in order.
2. **Define failure conditions.** Tell the agent when to stop trying and revert.
3. **Constrain scope.** Emphasize "one task only" repeatedly.
4. **Provide escape hatches.** Stop files, revert commands, how to add notes for the next iteration.

## Specs

Specs live in a `specs/` directory. Each spec is a markdown file describing a feature:

```markdown
# Feature Name

## Overview
What this feature does from the user's perspective.

## Behavior
- User can...
- When X happens, Y should...

## Data Model
- New model `Thing` with fields...

## Edge Cases
- Empty state: ...
- Invalid input: ...

## Acceptance Criteria
- [ ] User can create a thing
- [ ] Things appear sorted by date
```

Specs describe **what**, not **how**. The agent determines implementation details.

### Why Separate Specs from the Plan?

- **Specs are human-authored intent.** They're stable descriptions of desired behavior.
- **The plan is agent-generated work breakdown.** It changes as the agent learns more about the codebase.
- **Separation allows iteration.** You can refine specs without losing completed work in the plan.

## Signal Files

The loop uses files to coordinate:

| File | Purpose |
|------|---------|
| `.ralph-stop` | Tells the loop to exit after the current iteration completes. Created by `ralph.sh stop`. |

You can extend this pattern for other signals (pause, skip, priority changes).

## Adapting to Your Stack

### 1. Replace the App Container

Swap `Dockerfile.web` for your stack:

```dockerfile
# Python example
FROM python:3.12
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]
```

### 2. Update Validation Commands

In `PROMPT_build.md`, change the validation sequence:

```bash
# Python/Django example
docker compose exec app python manage.py check
docker compose exec app ruff check .
docker compose exec app pytest
```

```bash
# Rust example
docker compose exec app cargo check
docker compose exec app cargo clippy -- -D warnings
docker compose exec app cargo test
```

### 3. Adjust the Agent Container

The agent container needs:
- Git (for commits)
- Docker CLI (for `docker exec` into app container)
- Claude Code (or your preferred LLM CLI)

The current `Dockerfile.ralph` works for most setups — you mainly need to update the prompts.

### 4. Customize Prompts for Your Conventions

Edit the prompt files to reflect your team's standards:
- File naming conventions
- Test file locations
- Import styles
- Error handling patterns
- Commit message format

## Common Patterns

### Database Migrations

If your stack has migrations, add a step in `PROMPT_build.md`:

```markdown
If the task involves a database change, create the migration first:
docker compose exec app python manage.py makemigrations
docker compose exec app python manage.py migrate
```

### Environment Variables

When tasks need new env vars, the agent should:
1. Add them to the env template file
2. Add them to the rendered env file (for immediate use)
3. Restart the app container to pick up changes

### Handling External Services

If your app needs external services (Redis, S3, etc.):
1. Add them to `docker-compose.yml`
2. Document the connection patterns in `AGENTS.md`
3. Use health checks so the app waits for dependencies

## Anti-Patterns to Avoid

### Compound Tasks
Bad: "Add user model, API routes, and profile page"
Good: Three separate tasks, each independently testable

### Vague Acceptance Criteria
Bad: "Improve the dashboard"
Good: "Dashboard shows last 7 days of metrics with daily totals"

### Skipping Validation
Never let the agent commit without running the full validation sequence. Broken commits poison future iterations.

### Manual Edits During Agent Run
Don't edit files while the agent is running. It will get confused about what changed. Use the stop signal, make your edits, then restart.

## Debugging

### Agent Gets Stuck

If the agent fails repeatedly on the same task:
1. Check the logs (`logs/ralph/`)
2. Look for patterns — is it the same error each time?
3. Consider splitting the task into smaller pieces
4. Add notes to the task in the plan to guide the next iteration

### Validation Passes But Code Is Wrong

Your validation suite isn't comprehensive enough. Add tests that would have caught the issue, then let the agent try again.

### Agent Ignores Instructions

Prompts may have conflicting or unclear instructions. Review and simplify. The agent follows what it understands, not what you intended.
