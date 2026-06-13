# Deployment

## Hosting Requirements

- A long-running Docker container or Node.js server.
- Exactly one running application instance; disable horizontal autoscaling.
- A persistent disk mounted at `/data`.
- HTTPS at the public endpoint so production session cookies remain secure.
- Node.js 22 when deploying without Docker.

Do not deploy this SQLite configuration to an ephemeral serverless filesystem. Accounts, sessions, invoices, and logos are stored in the database file and require durable storage.

## Docker

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
2. Confirm the deployment has a persistent disk mounted at `/data`.
3. Confirm the public URL uses HTTPS.
4. Confirm `/api/health` returns `{"status":"ok"}`.
5. Create an account, save an invoice, restart the container, and verify the invoice still exists.
6. Back up the persistent SQLite database before schema upgrades or host migrations.
