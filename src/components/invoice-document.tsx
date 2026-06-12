import type { CSSProperties } from "react";
import type { BusinessSettings, Customer, Invoice } from "@/features/invoices/types";
import { formatCurrency } from "@/features/invoices/calculations";

export function InvoiceDocument({
  invoice,
  customer,
  settings
}: {
  invoice: Invoice;
  customer?: Customer;
  settings: BusinessSettings;
}) {
  const style = { "--invoice-accent": settings.brandColor } as CSSProperties;

  return (
    <article className={`invoice-document invoice-template-${invoice.template}`} style={style}>
      <header className="invoice-doc-header">
        <div className="invoice-business">
          <Logo settings={settings} />
          <div className="invoice-business-copy">
            <h2>{settings.businessName}</h2>
            <p>{settings.businessAddress}</p>
            <p>{settings.businessEmail}</p>
            <p>{settings.businessPhone}</p>
          </div>
        </div>
        <div className="invoice-doc-meta">
          <strong>Invoice</strong>
          <span>{invoice.invoiceNumber}</span>
          <small>Issued {formatDate(invoice.issueDate)}</small>
          <small>Due {formatDate(invoice.dueDate)}</small>
        </div>
      </header>

      <section className="bill-to">
        <span>Bill to</span>
        <strong>{customer?.company || customer?.name || "Customer"}</strong>
        {customer?.company && <p>{customer.name}</p>}
        <p>{customer?.billingAddress}</p>
        <p>{customer?.email}</p>
      </section>

      <div className="document-table-shell">
        <table className="doc-lines">
          <thead>
            <tr><th>Description</th><th>Qty</th><th>Rate</th><th>Tax</th><th>Total</th></tr>
          </thead>
          <tbody>
            {invoice.lineItems.map((line) => (
              <tr key={line.id}>
                <td>{line.description || "Line item"}</td>
                <td>{line.quantity}</td>
                <td>{formatCurrency(line.unitPriceMinor, invoice.currency)}</td>
                <td>{formatCurrency(line.lineTaxMinor, invoice.currency)}</td>
                <td>{formatCurrency(line.lineTotalMinor, invoice.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="doc-totals">
        <div><span>Subtotal</span><strong>{formatCurrency(invoice.subtotalMinor, invoice.currency)}</strong></div>
        {invoice.discountTotalMinor > 0 && (
          <div><span>Discount</span><strong>-{formatCurrency(invoice.discountTotalMinor, invoice.currency)}</strong></div>
        )}
        <div><span>Tax</span><strong>{formatCurrency(invoice.taxTotalMinor, invoice.currency)}</strong></div>
        <div className="doc-balance"><span>Total</span><strong>{formatCurrency(invoice.totalMinor, invoice.currency)}</strong></div>
      </div>

      {(invoice.notes || invoice.terms) && (
        <footer className="doc-footer">
          {invoice.notes && <div><strong>Notes</strong><p>{invoice.notes}</p></div>}
          {invoice.terms && <div><strong>Terms</strong><p>{invoice.terms}</p></div>}
        </footer>
      )}
    </article>
  );
}

function Logo({ settings }: { settings: BusinessSettings }) {
  return (
    <span className={`doc-logo${settings.logoDataUrl ? " has-image" : ""}`}>
      {settings.logoDataUrl ? (
        <img src={settings.logoDataUrl} alt={`${settings.businessName} logo`} />
      ) : (
        initials(settings.businessName)
      )}
    </span>
  );
}

function formatDate(value: string): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(`${value}T00:00:00`));
}

function initials(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase() || "IC";
}
