import { jsPDF } from "jspdf";
import { formatCurrency } from "@/features/invoices/calculations";
import type {
  BusinessSettings,
  Customer,
  Invoice,
  InvoiceTemplate
} from "@/features/invoices/types";

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
  let y = drawHeader(pdf, invoice, settings, brand);

  y = drawBillTo(pdf, customer, y, invoice.template, brand);
  y += 12;
  y = drawLineItems(pdf, invoice, y, brand);
  y += 8;
  y = drawTotals(pdf, invoice, y, brand);

  y += 10;
  y = ensureSpace(pdf, y, 30);
  pdf.setDrawColor(216, 222, 232);
  pdf.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
  y += 8;
  if (invoice.notes.trim()) {
    drawSectionLabel(pdf, "Notes", MARGIN, y, brand);
    y += 5;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(100, 116, 139);
    y = writeWrappedLines(pdf, invoice.notes, MARGIN, y, CONTENT_WIDTH, 4) + 5;
  }
  if (invoice.terms.trim()) {
    drawSectionLabel(pdf, "Terms", MARGIN, y, brand);
    y += 5;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(100, 116, 139);
    writeWrappedLines(pdf, invoice.terms, MARGIN, y, CONTENT_WIDTH, 4);
  }

  pdf.save(`${sanitizeFileName(invoice.invoiceNumber)}.pdf`);
}

function drawHeader(
  pdf: jsPDF,
  invoice: Invoice,
  settings: BusinessSettings,
  brand: Rgb
): number {
  if (invoice.template === "modern") {
    pdf.setFillColor(brand.r, brand.g, brand.b);
    pdf.rect(0, 0, PAGE_WIDTH, 52, "F");
    const logo = drawLogo(pdf, settings.logoDataUrl, MARGIN, 12, 28, 20);
    const businessX = logo ? MARGIN + logo.width + 7 : MARGIN;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(18);
    pdf.setTextColor(255, 255, 255);
    pdf.text(settings.businessName, businessX, 19);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    let infoY = 25;
    infoY = writeWrappedLines(pdf, settings.businessAddress, businessX, infoY, 76, 3.5);
    if (settings.businessEmail) pdf.text(settings.businessEmail, businessX, infoY);
    if (settings.businessPhone) pdf.text(settings.businessPhone, businessX, infoY + 4);
    drawInvoiceMeta(pdf, invoice, PAGE_WIDTH - MARGIN, 18, true);
    return 66;
  }

  const logo = drawLogo(pdf, settings.logoDataUrl, MARGIN, MARGIN, 26, 18);
  const businessX = logo ? MARGIN + logo.width + 7 : MARGIN;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(invoice.template === "minimal" ? 15 : 20);
  pdf.setTextColor(17, 24, 39);
  pdf.text(settings.businessName, businessX, MARGIN + 5);
  drawInvoiceMeta(pdf, invoice, PAGE_WIDTH - MARGIN, MARGIN + 5, false, brand);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.setTextColor(100, 116, 139);
  let infoY = MARGIN + 12;
  infoY = writeWrappedLines(pdf, settings.businessAddress, businessX, infoY, 78, 3.7);
  if (settings.businessEmail) {
    pdf.text(settings.businessEmail, businessX, infoY);
    infoY += 4;
  }
  if (settings.businessPhone) pdf.text(settings.businessPhone, businessX, infoY);

  pdf.setDrawColor(brand.r, brand.g, brand.b);
  pdf.setLineWidth(invoice.template === "minimal" ? 0.5 : 2.4);
  pdf.line(MARGIN, 48, PAGE_WIDTH - MARGIN, 48);
  return 61;
}

function drawInvoiceMeta(
  pdf: jsPDF,
  invoice: Invoice,
  x: number,
  y: number,
  inverse: boolean,
  brand?: Rgb
) {
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(23);
  pdf.setTextColor(inverse ? 255 : 17, inverse ? 255 : 24, inverse ? 255 : 39);
  pdf.text("Invoice", x, y, { align: "right" });
  pdf.setFontSize(10);
  if (!inverse && brand) pdf.setTextColor(brand.r, brand.g, brand.b);
  pdf.text(invoice.invoiceNumber, x, y + 8, { align: "right" });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.setTextColor(inverse ? 235 : 100, inverse ? 245 : 116, inverse ? 242 : 139);
  pdf.text(`Issued ${formatDate(invoice.issueDate)}`, x, y + 14, { align: "right" });
  pdf.text(`Due ${formatDate(invoice.dueDate)}`, x, y + 19, { align: "right" });
}

function drawBillTo(
  pdf: jsPDF,
  customer: Customer | undefined,
  y: number,
  template: InvoiceTemplate,
  brand: Rgb
): number {
  if (template !== "minimal") {
    pdf.setFillColor(247, 249, 249);
    pdf.roundedRect(MARGIN, y - 5, CONTENT_WIDTH, 28, 2, 2, "F");
  }
  drawSectionLabel(pdf, "Bill to", MARGIN + (template === "minimal" ? 0 : 5), y, brand);
  y += 6;
  const x = MARGIN + (template === "minimal" ? 0 : 5);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(17, 24, 39);
  pdf.text(customer?.company || customer?.name || "Customer", x, y);
  y += 5;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(100, 116, 139);
  if (customer?.name && customer.company) {
    pdf.text(customer.name, x, y);
    y += 4;
  }
  y = writeWrappedLines(pdf, customer?.billingAddress ?? "", x, y, 86, 4);
  if (customer?.email) {
    pdf.text(customer.email, x, y);
    y += 4;
  }
  return Math.max(y, template === "minimal" ? y : 84);
}

function drawLineItems(pdf: jsPDF, invoice: Invoice, y: number, brand: Rgb): number {
  const columns = {
    description: MARGIN,
    quantity: 118,
    rate: 137,
    tax: 162,
    total: PAGE_WIDTH - MARGIN
  };

  if (invoice.template === "modern") {
    pdf.setFillColor(brand.r, brand.g, brand.b);
  } else if (invoice.template === "classic") {
    pdf.setFillColor(248, 250, 252);
  }
  if (invoice.template !== "minimal") pdf.rect(MARGIN, y - 5, CONTENT_WIDTH, 9, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(invoice.template === "modern" ? 255 : 71, invoice.template === "modern" ? 255 : 85, invoice.template === "modern" ? 255 : 105);
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
    pdf.text(formatCurrency(line.unitPriceMinor, invoice.currency), columns.rate, y, { align: "right" });
    pdf.text(formatCurrency(line.lineTaxMinor, invoice.currency), columns.tax, y, { align: "right" });
    pdf.text(formatCurrency(line.lineTotalMinor, invoice.currency), columns.total, y, { align: "right" });
    y += rowHeight;
    pdf.setDrawColor(226, 232, 240);
    pdf.line(MARGIN, y - 3, PAGE_WIDTH - MARGIN, y - 3);
  }

  return y;
}

function drawTotals(pdf: jsPDF, invoice: Invoice, y: number, brand: Rgb): number {
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
      if (invoice.template === "modern") {
        pdf.setFillColor(brand.r, brand.g, brand.b);
        pdf.roundedRect(labelX - 5, y - 5, valueX - labelX + 5, 10, 1.5, 1.5, "F");
        pdf.setTextColor(255, 255, 255);
      } else {
        pdf.setDrawColor(216, 222, 232);
        pdf.line(labelX, y - 4, valueX, y - 4);
        pdf.setTextColor(17, 24, 39);
      }
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(12);
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

function drawLogo(
  pdf: jsPDF,
  dataUrl: string,
  x: number,
  y: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } | null {
  if (!dataUrl) return null;
  try {
    const properties = pdf.getImageProperties(dataUrl);
    const scale = Math.min(maxWidth / properties.width, maxHeight / properties.height);
    const width = properties.width * scale;
    const height = properties.height * scale;
    pdf.addImage(dataUrl, properties.fileType, x, y, width, height, undefined, "FAST");
    return { width, height };
  } catch {
    return null;
  }
}

function drawSectionLabel(pdf: jsPDF, label: string, x: number, y: number, brand: Rgb) {
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(brand.r, brand.g, brand.b);
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

type Rgb = { r: number; g: number; b: number };

function hexToRgb(hex: string): Rgb {
  const normalized = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : "176b5b";
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16)
  };
}
