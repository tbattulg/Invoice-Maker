# Deployment

## Cloudflare Workers

The hosted version uses:

- Cloudflare Workers for the Next.js application.
- Cloudflare D1 database `invoice-creator-production` for accounts and invoice records.
- Cloudflare KV namespace `invoice-creator-logos` for uploaded business logos.
- The free `workers.dev` HTTPS address for secure production sessions.

Build and verify the Worker bundle:

```powershell
npm.cmd run cf:build
```

Apply pending D1 migrations, then deploy:

```powershell
npm.cmd run cf:migrate
npm.cmd run cf:deploy
```

For a local Cloudflare preview, apply the local D1 migrations and run:

```powershell
npm.cmd run cf:migrate:local
npm.cmd run cf:preview
```

Run `npm.cmd run cf:typegen` after changing bindings in `wrangler.jsonc`.

## Docker

Docker is the self-hosted alternative. It requires one long-running instance and a persistent disk mounted at `/data`.

Build the image:

```powershell
docker build -t invoice-creator .
```

Run it with a named persistent volume:

```powershell
docker volume create invoice-creator-data
docker run --name invoice-creator -p 3000:3000 -v invoice-creator-data:/data invoice-creator
```

Open `http://localhost:3000`. The health endpoint is `http://localhost:3000/api/health`.

For a hosted container service, configure:

- Container port: `3000`
- Persistent disk mount: `/data`
- Instance count: `1`
- Health check path: `/api/health`
- Environment variable: `DATABASE_URL=file:/data/invoice.db`

The container runs pending Prisma migrations before starting the web server.

## Node.js Without Docker

Set `DATABASE_URL` to a writable, persistent SQLite path before installing or starting the app. Then run:

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd run start
```

The start command applies pending migrations and regenerates the Prisma client before launching Next.js.

## Release Checklist

1. Run `npm.cmd run check`.
2. Run `npm.cmd run cf:build` for Cloudflare releases.
3. Apply D1 migrations before publishing a new Worker version.
4. Confirm the public URL uses HTTPS.
5. Confirm `/api/health` returns `{"status":"ok"}`.
6. Create an account, upload a logo, and save an invoice using each template.
7. For Docker releases, confirm `/data` is persistent and back up the SQLite database before schema upgrades.
