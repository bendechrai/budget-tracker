# Deploying to Railway

## Prerequisites

- A [Railway](https://railway.app) account
- This repo connected to GitHub

## Setup

1. Create a new Railway project and connect the GitHub repo

2. Add a **PostgreSQL** service: click "+ New" > "Database" > "PostgreSQL"

3. Add a **Web** service from the repo:
   - Set **Root Directory** to `/web`

4. Set environment variables on the web service:
   - `DATABASE_URL` → reference Postgres: `${{Postgres.DATABASE_URL}}`
   - `SESSION_SECRET` → generate a secure random string (32+ chars)
   - `NODE_ENV` → `production`

5. Generate a public domain under Settings > Networking

## What Happens on Deploy

- Railway's Railpack builder auto-detects Node.js from `package.json`
- Runs `npm ci` and `postinstall` (which runs `prisma generate`)
- Runs `npm run build` (Next.js standalone build)
- Before routing traffic: runs `npx prisma migrate deploy` (pre-deploy command)
- Starts the app with `npm run start`

## Verification

- Check deploy logs for successful migration and startup
- Hit the generated domain — you should see the landing page
