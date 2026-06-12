# Invoice Creator Project Plan

## Product Goal

Build a fast invoice tool for entering customer details, adding invoice items, organizing invoices, and downloading polished PDF files. Each authenticated account owns a separate business workspace. The product does not connect to payment processors, accounting platforms, or email services.

## Focused Scope

### Included

- Customer directory with contact, billing address, and notes.
- Item library with description, price, tax rate, and default quantity.
- Invoice builder with editable line items, tax, discounts, notes, terms, and totals.
- Live invoice preview.
- Print-ready PDF generation and download.
- Dashboard search and status filtering.
- Manual invoice statuses.
- Business details, invoice numbering, currency, and brand color.
- Database-backed account creation, login, and logout.
- HTTP-only sessions and first-run business onboarding.
- Separate data and template settings for each account.
- Prisma-backed SQLite persistence.
- Excel customer-directory export.

### Excluded

- Payment processing and payment links.
- Automatic payment, balance, or accounting updates.
- Recurring invoices and scheduled jobs.
- Estimates, reminders, receipts, and activity logs.
- Team roles, shared workspaces, and cloud synchronization.
- External email, SMS, storage, and database services.

## Technology

- **Next.js 15** for the application shell and production build.
- **React 19** for stateful screens and forms.
- **TypeScript** for invoice, customer, item, and settings models.
- **CSS Grid and Flexbox** for responsive layouts.
- **jsPDF** for local PDF generation.
- **Lucide React** for interface icons.
- **Prisma and SQLite** for users, sessions, workspaces, and invoice records.
- **Node crypto** for scrypt password hashing and random session tokens.
- **Open XML** workbook generation for dependency-free `.xlsx` customer exports.

This stack keeps installation simple and works without third-party API keys or hosted services.

## Application Structure

```text
src/
  app/
    globals.css
    layout.tsx
    page.tsx
  components/
    invoice-workspace.tsx
  features/auth/
    server-auth.ts
  features/customers/
    excel.ts
  features/invoices/
    calculations.ts
    pdf.ts
    seed.ts
    types.ts
prisma/
  schema.prisma
  migrations/
```

## Core Data

### Customer

- `id`
- `name`
- `company`
- `email`
- `phone`
- `billingAddress`
- `notes`

### Item

- `id`
- `name`
- `description`
- `unitPriceMinor`
- `taxRateBps`
- `defaultQuantity`

### Invoice

- `id`
- `customerId`
- `invoiceNumber`
- `issueDate`
- `dueDate`
- `status`
- calculated subtotal, tax, discount, and total values
- `currency`
- `notes`
- `terms`
- copied line-item values
- created and updated timestamps

### Manual Statuses

- Draft
- Sent
- Unpaid
- Overdue
- Partially paid
- Paid
- Void

Statuses are labels controlled by the user. They do not trigger payment logic or external actions.

## Main User Flow

1. Create an account or log in.
2. Complete first-run business onboarding.
3. Save a customer.
4. Save commonly used products or services.
5. Open New Invoice.
6. Select the customer and choose a manual status.
7. Add or edit line items.
8. Review, save, and optionally download the PDF.

## Responsive Layout Rules

- Dashboard tables scroll horizontally instead of compressing or overlapping cells.
- Invoice line fields reflow from a compact desktop grid to a two-column mobile grid.
- Add-item actions stack on narrow phones.
- Forms and previews use `min-width: 0` and bounded responsive tracks.
- Buttons wrap or stack before their labels can overflow.
- The invoice preview uses fixed table proportions so totals remain visible.

## Quality Checks

- TypeScript type check.
- Next.js production build.
- Desktop dashboard visual check.
- Mobile dashboard visual check.
- Desktop invoice builder visual check with a line item.
- Mobile invoice builder visual check with a line item.
- Mobile customer directory visual check.
- PDF generation smoke test in the browser.

## Future Options

Future additions should preserve the single-user focus. Useful candidates are JSON backup and restore, custom PDF templates, optional customer deletion with invoice snapshots, and a desktop packaging option. Payment and cloud integrations should remain out of scope unless the product direction changes explicitly.
