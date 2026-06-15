# Invoice Creator

A focused local invoice workspace built with Next.js and TypeScript.

## Included

- Reusable customer directory.
- Reusable product and service items.
- Invoice builder with quantity, price, tax, discount, totals, notes, and terms.
- Invoice preview and print-ready PDF download.
- Classic, modern, and minimal invoice templates saved per invoice.
- Business logo upload with matching preview and PDF branding.
- Searchable invoice dashboard.
- Manual invoice statuses: draft, sent, unpaid, overdue, partially paid, paid, and void.
- Business details, invoice numbering, currency, and brand color settings.
- Database-backed account creation and login with salted password hashes.
- HTTP-only sessions and first-run business onboarding.
- Separate settings, customers, items, invoices, numbering, and template defaults per account.
- Excel customer-directory export with contact and billing information.
- Prisma-backed persistence with local SQLite and hosted Cloudflare D1.
- Server actions for invoices, customers, items, payments, estimates, recurring templates, and activity logs.

## Deliberately Not Included

- Payment processing or payment links.
- Recurring-invoice scheduling and reminder delivery.
- Automatic tax filing or accounting-platform synchronization.

## Account Storage

When run locally, account credentials, sessions, and business records are stored in `prisma/dev.db`. The hosted Cloudflare deployment uses D1 for business data and KV for uploaded logo images. Session tokens are kept in HTTP-only cookies, and every server action resolves the current account from that session before reading or writing workspace data.

Reliable bulk email delivery is not included because it requires a server-side email provider and authenticated business-domain setup. The Customers screen provides an Excel export instead.

## Run Locally

```powershell
npm.cmd install
npm.cmd run dev
```

The first install creates a local `.env` with the default SQLite database URL when one is not already configured, then applies the included migrations.

Open `http://localhost:3000`.

## Verify

```powershell
npm.cmd run check
```

## Deploy

The primary hosted deployment uses Cloudflare Workers through OpenNext, Cloudflare D1 for relational data, and Cloudflare KV for business logos.

Docker remains available for self-hosting. It stores the SQLite database at `/data/invoice.db`, applies migrations when the container starts, and exposes a health check at `/api/health`.

See [DEPLOYMENT.md](DEPLOYMENT.md) for Cloudflare and container deployment instructions.
