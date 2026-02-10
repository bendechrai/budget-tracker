# Next.js + Prisma + Ralph Template

A starter template for building web apps with an AI build agent. Write specs, let Ralph plan and build.

## Prerequisites

- [devports](https://github.com/bendechrai/devports)
- [1Password CLI](https://developer.1password.com/docs/cli/) (`op`)
- Container runtime (one of):
  - [OrbStack](https://orbstack.dev/) — fast and lightweight (macOS only, recommended)
  - [Colima](https://github.com/abiosoft/colima) — lightweight Docker runtime (macOS/Linux)
  - [Docker Desktop](https://www.docker.com/) — cross-platform

## Getting Started

```bash
# Start the app and database
./dev.sh

# Stop everything
./dev.sh down
```

The app runs at [http://localhost:3000](http://localhost:3000) (port may vary by devports config).

## Ralph

Ralph is the AI build agent. The workflow:

1. Write feature specs in `specs/`
2. Ralph reads the specs and produces an implementation plan
3. Ralph builds the features iteratively, validating as it goes

```bash
# Generate an implementation plan from specs
./ralph.sh plan

# Build (default 5 iterations)
./ralph.sh build

# Build with a custom iteration count
./ralph.sh build 10
```

The dev environment (`./dev.sh`) must be running before using Ralph.

## Tech Stack

- **Next.js 16** — App Router, TypeScript
- **Prisma 7** — ORM with PostgreSQL 17
- **Vitest** — Unit and component testing with React Testing Library
- **CSS Modules** — No Tailwind

## Project Structure

```
├── web/                  # Next.js application
├── specs/                # Feature specifications (you create these)
├── dev.sh                # Start web + db
├── ralph.sh              # Run Ralph (plan / build)
├── loop.sh               # Ralph's inner loop
├── AGENTS.md             # Conventions and agent guide
├── Dockerfile.web
├── Dockerfile.ralph
└── docker-compose.yml    # Rendered via devports
```

## Code Conventions

- CSS Modules or global CSS — no Tailwind
- ESLint must pass — no `any` types
- Prisma migrations only — never `prisma db push`
- Tests live in `__tests__/` directories alongside source

See [AGENTS.md](AGENTS.md) for full conventions and Docker Compose commands.

## Upgrading Dependencies

The template ships with a working combination of Next.js, Prisma, Vitest, and supporting packages — not just a bare `create-next-app` output. These versions may not be the latest. Before starting a new project, upgrade to current versions:

```bash
cd web

# Check what's outdated
npm outdated

# Update to latest compatible versions
npm update

# For major version upgrades
npx npm-check-updates -u
npm install
```

For Next.js major upgrades, use the official codemod: `npx @next/codemod@latest upgrade`
