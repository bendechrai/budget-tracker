# Agents Guide

> This file is Ralph's in-container reference. For the interactive Claude Code workflow (writing specs, running Ralph, manual development), see `CLAUDE.md`.

## Tech Stack

- **Framework**: Next.js (App Router, TypeScript)
- **Database**: PostgreSQL via Prisma ORM
- **Testing**: Vitest + React Testing Library
- **Styling**: CSS Modules (no Tailwind)
- **Runtime**: Node.js 20, Docker Compose

## Project Structure

```
/
├── web/                    # Next.js application
│   ├── app/                # App Router pages and layouts
│   │   ├── (app)/          # Route group — all authenticated pages (shared header/nav layout)
│   │   │   ├── layout.tsx  # Header, nav, AIBar wrapper
│   │   │   ├── dashboard/
│   │   │   ├── income/
│   │   │   ├── obligations/
│   │   │   ├── suggestions/
│   │   │   ├── import/
│   │   │   └── transactions/
│   ├── lib/prisma.ts       # Prisma client singleton
│   ├── prisma/
│   │   └── schema.prisma   # Database schema
│   ├── prisma.config.ts    # Prisma configuration
│   ├── vitest.config.ts    # Test configuration
│   └── package.json
├── specs/                  # Feature specifications
├── Dockerfile.web          # Web container
├── Dockerfile.ralph        # Ralph container
├── .env.devports           # Environment template (EDIT THIS, not .env)
├── docker-compose.yml.devports  # Compose template (EDIT THIS, not docker-compose.yml)
├── .env                    # GENERATED — do not edit (rendered from .env.devports)
├── docker-compose.yml      # GENERATED — do not edit (rendered from docker-compose.yml.devports)
├── dev.sh                  # Start web + db
├── ralph.sh                # Run Ralph
├── loop.sh                 # Ralph's inner loop
├── PROMPT_build.md         # Ralph build prompt
├── PROMPT_plan.md          # Ralph plan prompt
└── IMPLEMENTATION_PLAN.md  # Task tracking
```

## Conventions

- No Tailwind — use CSS Modules or global CSS
- ESLint must pass — no `any` types
- Prisma: always use migrations, never `prisma db push`
- Tests live alongside code in `__tests__/` directories
- Git commits: no attribution in messages
- Error logging: use `logError()` from `@/lib/logging` in catch blocks — never silently swallow errors

## Docker Compose Exec Commands

Ralph runs in its own container but executes validation in the web container:

| Action | Command |
|--------|---------|
| Run tests | `docker compose -f /project/docker-compose.yml exec web npm test` |
| Run tests (verbose) | `docker compose -f /project/docker-compose.yml exec web npm run test:ci` |
| Type check | `docker compose -f /project/docker-compose.yml exec web npx tsc --noEmit` |
| Lint | `docker compose -f /project/docker-compose.yml exec web npm run lint` |
| Build check | `docker compose -f /project/docker-compose.yml exec web npm run build` |
| Run migrations | `docker compose -f /project/docker-compose.yml exec web npx prisma migrate dev --name <desc>` |
| Generate client | `docker compose -f /project/docker-compose.yml exec web npx prisma generate` |

## Specs

Ralph reads feature specs from `specs/` during planning. Each spec should be one markdown file covering:

- **User-facing behavior** — what the user sees and does
- **Data model changes** — new models, fields, relations
- **Edge cases** — empty states, errors, limits
- **Acceptance criteria** — concrete conditions for "done"

Specs describe *what*, not *how*. Ralph determines the implementation approach and breaks specs into atomic tasks in `IMPLEMENTATION_PLAN.md`.

## Generated Files — Do Not Edit Directly

`.env` and `docker-compose.yml` are **generated** from their `.devports` templates and are gitignored. They get overwritten every time `dev.sh` or `ralph.sh` runs.

| Template (edit this) | Generated (do not edit) |
|----------------------|------------------------|
| `.env.devports` | `.env` |
| `docker-compose.yml.devports` | `docker-compose.yml` |

To add or change environment variables, edit `.env.devports` **and** add them to the appropriate service's `environment:` block in `docker-compose.yml.devports` so they get passed into the container. The `{devports:...}` placeholders are resolved at render time; regular values are copied as-is.

## Database

- Connection managed via `DATABASE_URL` environment variable
- Prisma client singleton in `web/lib/prisma.ts`
- Schema in `web/prisma/schema.prisma`
- Migrations in `web/prisma/migrations/`
