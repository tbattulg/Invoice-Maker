# Invoice Creator

A focused local invoice workspace built with Next.js and TypeScript.

## Included

- Reusable customer directory.
- Reusable product and service items.
- Invoice builder with quantity, price, tax, discount, totals, notes, and terms.
- Invoice preview and print-ready PDF download.
- Searchable invoice dashboard.
- Manual invoice statuses: draft, sent, unpaid, overdue, partially paid, paid, and void.
- Business details, invoice numbering, currency, and brand color settings.
- Database-backed account creation and login with salted password hashes.
- HTTP-only sessions and first-run business onboarding.
- Separate settings, customers, items, invoices, numbering, and template defaults per account.
- Excel customer-directory export with contact and billing information.
- Prisma-backed SQLite persistence for business data.
- Server actions for invoices, customers, items, payments, estimates, recurring templates, and activity logs.

## Deliberately Not Included

- Payment processing or payment links.
- Recurring-invoice scheduling and reminder delivery.
- Hosted database deployment or cloud synchronization.

## Account Storage

Account credentials, sessions, and business records are stored in `prisma/dev.db`. Session tokens are kept in HTTP-only cookies, and every server action resolves the current account from that session before reading or writing workspace data.

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
