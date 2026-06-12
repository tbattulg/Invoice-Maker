import { jsPDF } from "jspdf";
import { formatCurrency } from "@/features/invoices/calculations";
import type { BusinessSettings, Customer, Invoice } from "@/features/invoices/types";

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 16;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

export function downloadInvoicePdf({
  invoice,
  customer,
  settings
}: {
  invoice: Invoice;
  customer?: Customer;
  settings: BusinessSettings;
}) {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const brand = hexToRgb(settings.brandColor);
  let y = MARGIN;

  pdf.setFillColor(brand.r, brand.g, brand.b);
  pdf.rect(0, 0, PAGE_WIDTH, 9, "F");

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(20);
  pdf.setTextColor(17, 24, 39);
  pdf.text(settings.businessName, MARGIN, y + 5);

  pdf.setFontSize(24);
  pdf.text("Invoice", PAGE_WIDTH - MARGIN, y + 5, { align: "right" });

  y += 16;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(100, 116, 139);
  y = writeWrappedLines(pdf, settings.businessAddress, MARGIN, y, 84, 4);
  if (settings.businessEmail) {
    pdf.text(settings.businessEmail, MARGIN, y);
    y += 4;
  }
  if (settings.businessPhone) {
    pdf.text(settings.businessPhone, MARGIN, y);
  }

  const metaX = PAGE_WIDTH - MARGIN;
  let metaY = MARGIN + 18;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.setTextColor(17, 24, 39);
  pdf.text(invoice.invoiceNumber, metaX, metaY, { align: "right" });
  metaY += 5;
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(100, 116, 139);
  pdf.text(`Issued ${formatDate(invoice.issueDate)}`, metaX, metaY, { align: "right" });
  metaY += 5;
  pdf.text(`Due ${formatDate(invoice.dueDate)}`, metaX, metaY, { align: "right" });

  y = Math.max(y + 14, 58);
  drawSectionLabel(pdf, "Bill to", MARGIN, y);
  y += 6;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(17, 24, 39);
  pdf.text(customer?.company || customer?.name || "Customer", MARGIN, y);
  y += 5;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(100, 116, 139);
  if (customer?.name && customer.company) {
    pdf.text(customer.name, MARGIN, y);
    y += 4;
  }
  y = writeWrappedLines(pdf, customer?.billingAddress ?? "", MARGIN, y, 86, 4);
  if (customer?.email) {
    pdf.text(customer.email, MARGIN, y);
    y += 4;
  }

  y += 12;
  y = drawLineItems(pdf, invoice, y);
  y += 8;
  y = drawTotals(pdf, invoice, y);

  y += 10;
  y = ensureSpace(pdf, y, 30);
  pdf.setDrawColor(216, 222, 232);
  pdf.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
  y += 8;
  if (invoice.notes.trim()) {
    drawSectionLabel(pdf, "Notes", MARGIN, y);
    y += 5;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(100, 116, 139);
    y = writeWrappedLines(pdf, invoice.notes, MARGIN, y, CONTENT_WIDTH, 4) + 5;
  }
  if (invoice.terms.trim()) {
    drawSectionLabel(pdf, "Terms", MARGIN, y);
    y += 5;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(100, 116, 139);
    writeWrappedLines(pdf, invoice.terms, MARGIN, y, CONTENT_WIDTH, 4);
  }

  pdf.save(`${sanitizeFileName(invoice.invoiceNumber)}.pdf`);
}

function drawLineItems(pdf: jsPDF, invoice: Invoice, y: number): number {
  const columns = {
    description: MARGIN,
    quantity: 118,
    rate: 137,
    tax: 162,
    total: PAGE_WIDTH - MARGIN
  };

  pdf.setFillColor(248, 250, 252);
  pdf.rect(MARGIN, y - 5, CONTENT_WIDTH, 9, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(71, 85, 105);
  pdf.text("Description", columns.description, y);
  pdf.text("Qty", columns.quantity, y, { align: "right" });
  pdf.text("Rate", columns.rate, y, { align: "right" });
  pdf.text("Tax", columns.tax, y, { align: "right" });
  pdf.text("Total", columns.total, y, { align: "right" });
  y += 8;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(17, 24, 39);

  for (const line of invoice.lineItems) {
    y = ensureSpace(pdf, y, 12);
    const descriptionLines = pdf.splitTextToSize(line.description, 82);
    const rowHeight = Math.max(8, descriptionLines.length * 4);
    pdf.text(descriptionLines, columns.description, y);
    pdf.text(String(line.quantity), columns.quantity, y, { align: "right" });
    pdf.text(formatCurrency(line.unitPriceMinor, invoice.currency), columns.rate, y, {
      align: "right"
    });
    pdf.text(formatCurrency(line.lineTaxMinor, invoice.currency), columns.tax, y, {
      align: "right"
    });
    pdf.text(formatCurrency(line.lineTotalMinor, invoice.currency), columns.total, y, {
      align: "right"
    });
    y += rowHeight;
    pdf.setDrawColor(226, 232, 240);
    pdf.line(MARGIN, y - 3, PAGE_WIDTH - MARGIN, y - 3);
  }

  return y;
}

function drawTotals(pdf: jsPDF, invoice: Invoice, y: number): number {
  const labelX = 132;
  const valueX = PAGE_WIDTH - MARGIN;
  const rows = [
    ["Subtotal", invoice.subtotalMinor],
    ["Discount", -invoice.discountTotalMinor],
    ["Tax", invoice.taxTotalMinor],
    ["Total", invoice.totalMinor]
  ] as const;

  for (const [index, [label, value]] of rows.entries()) {
    y = ensureSpace(pdf, y, 8);
    if (index === rows.length - 1) {
      pdf.setDrawColor(216, 222, 232);
      pdf.line(labelX, y - 4, valueX, y - 4);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(12);
      pdf.setTextColor(17, 24, 39);
    } else {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.setTextColor(100, 116, 139);
    }
    pdf.text(label, labelX, y);
    pdf.text(formatCurrency(value, invoice.currency), valueX, y, { align: "right" });
    y += index === rows.length - 1 ? 8 : 6;
  }

  return y;
}

function drawSectionLabel(pdf: jsPDF, label: string, x: number, y: number) {
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(37, 99, 235);
  pdf.text(label.toUpperCase(), x, y);
}

function writeWrappedLines(
  pdf: jsPDF,
  text: string,
  x: number,
  y: number,
  width: number,
  lineHeight: number
): number {
  if (!text.trim()) return y;
  const lines = pdf.splitTextToSize(text, width);
  pdf.text(lines, x, y);
  return y + lines.length * lineHeight;
}

function ensureSpace(pdf: jsPDF, y: number, needed: number): number {
  if (y + needed < PAGE_HEIGHT - MARGIN) return y;
  pdf.addPage();
  return MARGIN + 5;
}

function formatDate(dateInput: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(`${dateInput}T00:00:00`));
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-z0-9-_]+/gi, "_");
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : "2563eb";
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16)
  };
}
