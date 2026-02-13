# Claude Code Guide

This is a project template with an autonomous AI build agent called Ralph. The workflow: you write feature specs, Ralph plans the implementation as atomic tasks, then Ralph builds each task one at a time with full validation. You interact with Ralph through the CLI — your job is writing good specs and reviewing Ralph's output.

## Writing Specs

Create one markdown file per feature in `specs/`. Ralph reads these during planning to break work into tasks.

A good spec covers:

- **User-facing behavior** — what the user sees and does
- **Data model changes** — new models, fields, relations
- **Edge cases** — empty states, errors, limits
- **Acceptance criteria** — how to know it's done

Keep specs focused on *what*, not *how*. Ralph figures out the implementation.

### Revising Implemented Specs

When a spec file is modified and that spec already has completed (`[x]`) tasks in `IMPLEMENTATION_PLAN.md`, the existing implementation may no longer match the spec. Ralph's planner cannot reopen completed tasks — they are append-only.

**Required process:** Before committing changes to an implemented spec, create a **rework spec** that scopes the changes Ralph needs to make to the existing codebase.

1. Edit the original spec (e.g. `specs/09-ai-interaction.md`) with the new requirements
2. Create a rework spec (e.g. `specs/09a-nl-to-claude-api.md`) that:
   - References the original spec and summarizes what changed
   - Lists the specific files/components that need rework
   - Describes what to replace, what to keep, and what to add
   - Has its own acceptance criteria scoped to the rework
3. Commit both together

The rework spec is what Ralph's planner picks up as new work. Without it, the spec changes are invisible to Ralph because the original tasks are already marked complete.

**Claude Code must enforce this.** If you (Claude) have edited a spec file during a conversation, check whether that spec has completed tasks before committing. If it does, prompt the user to create the rework spec. Do not commit spec-only changes that would leave Ralph unaware of required rework.

```markdown
# Feature Name

## Overview
Brief description of what this feature does from the user's perspective.

## Behavior
- User can ...
- When X happens, Y should ...
- If no data exists, show ...

## Data Model
- New model `Thing` with fields: ...
- Add `thingId` relation to existing `User` model

## Edge Cases
- Empty state: ...
- Invalid input: ...

## Acceptance Criteria
- [ ] User can create a thing
- [ ] Things appear in a list sorted by date
- [ ] Empty state shows a message
```

## Using Ralph

Start the dev environment first, then run Ralph in plan or build mode.

```bash
# Start web + db containers
./dev.sh

# Plan: reads specs, writes IMPLEMENTATION_PLAN.md with atomic tasks
./ralph.sh plan

# Review the plan, edit IMPLEMENTATION_PLAN.md if needed

# Build: picks next task, implements, validates (tsc + lint + test), commits
./ralph.sh build        # runs until all tasks are done or ./ralph.sh stop

# Status: human-readable progress report (no Docker needed, requires claude CLI)
./ralph.sh status
```

Each build iteration does one task. If validation fails and Ralph can't fix it, he reverts and stops. The next iteration gets a fresh context.

## Manual Development

When working on things directly instead of through Ralph:

```bash
# Run in the web container via docker compose exec
docker compose exec web npm test              # tests
docker compose exec web npm run lint          # lint
docker compose exec web npx tsc --noEmit      # type check
docker compose exec web npx prisma migrate dev --name <desc>  # migration
docker compose exec web npx prisma generate   # regenerate client
```

- Prisma: always use migrations, never `prisma db push`
- Tests go in `__tests__/` directories alongside source
- CSS Modules for styling, no Tailwind
- No `any` types — ESLint must pass

## Project Structure

See `AGENTS.md` for the full project tree, tech stack, conventions, and Docker commands.

## Key Files

| Path | Purpose |
|------|---------|
| `specs/` | Feature specifications — Ralph's input |
| `IMPLEMENTATION_PLAN.md` | Task list Ralph maintains |
| `AGENTS.md` | Ralph's reference for conventions and commands |
| `dev.sh` | Start the dev environment |
| `ralph.sh` | Run Ralph (plan, build, stop, or status mode) |
