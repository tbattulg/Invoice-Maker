import type { Invoice, InvoiceLineItem, InvoiceStatus } from "./types";

export function dollarsToMinor(value: string | number): number {
  const numeric = typeof value === "number" ? value : Number(value || 0);
  return Number.isFinite(numeric) ? Math.round(numeric * 100) : 0;
}

export function minorToDollars(value: number): string {
  return (value / 100).toFixed(2);
}

export function percentToBps(value: string | number): number {
  const numeric = typeof value === "number" ? value : Number(value || 0);
  return Number.isFinite(numeric) ? Math.round(numeric * 100) : 0;
}

export function bpsToPercent(value: number): string {
  return (value / 100).toFixed(2).replace(/\.00$/, "");
}

export function discountRateBps(lineSubtotalMinor: number, discountMinor: number): number {
  if (lineSubtotalMinor <= 0 || discountMinor <= 0) return 0;
  return Math.min(Math.round((discountMinor * 10000) / lineSubtotalMinor), 10000);
}

export function discountMinorFromPercent(
  lineSubtotalMinor: number,
  value: string | number
): number {
  const rateBps = Math.min(Math.max(percentToBps(value), 0), 10000);
  return Math.round((Math.max(lineSubtotalMinor, 0) * rateBps) / 10000);
}

export function formatCurrency(valueMinor: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2
  }).format(valueMinor / 100);
}

export function calculateLineItem(
  line: Omit<InvoiceLineItem, "lineSubtotalMinor" | "lineTaxMinor" | "lineTotalMinor">
): InvoiceLineItem {
  const lineSubtotalMinor = Math.round(line.quantity * line.unitPriceMinor);
  const taxableMinor = Math.max(lineSubtotalMinor - line.discountMinor, 0);
  const lineTaxMinor = Math.round((taxableMinor * line.taxRateBps) / 10000);

  return {
    ...line,
    lineSubtotalMinor,
    lineTaxMinor,
    lineTotalMinor: taxableMinor + lineTaxMinor
  };
}

export function calculateInvoiceTotals(
  lineItems: InvoiceLineItem[]
): Pick<
  Invoice,
  "subtotalMinor" | "taxTotalMinor" | "discountTotalMinor" | "totalMinor"
> {
  return {
    subtotalMinor: lineItems.reduce((total, line) => total + line.lineSubtotalMinor, 0),
    taxTotalMinor: lineItems.reduce((total, line) => total + line.lineTaxMinor, 0),
    discountTotalMinor: lineItems.reduce((total, line) => total + line.discountMinor, 0),
    totalMinor: lineItems.reduce((total, line) => total + line.lineTotalMinor, 0)
  };
}

export function statusLabel(status: InvoiceStatus): string {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function todayInput(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysInput(dateInput: string, days: number): string {
  const date = new Date(`${dateInput}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}
