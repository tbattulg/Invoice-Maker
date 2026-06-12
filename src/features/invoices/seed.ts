import { calculateInvoiceTotals, calculateLineItem } from "./calculations";
import type { Invoice, InvoiceCreatorState, InvoiceLineItem } from "./types";

const consultingLine: InvoiceLineItem = calculateLineItem({
  id: "line_consulting",
  itemId: "item_consulting",
  description: "Operations and workflow consulting",
  quantity: 6,
  unitPriceMinor: 12500,
  taxRateBps: 0,
  discountMinor: 0
});

const designLine: InvoiceLineItem = calculateLineItem({
  id: "line_design",
  itemId: "item_design",
  description: "Invoice template and brand setup",
  quantity: 1,
  unitPriceMinor: 65000,
  taxRateBps: 825,
  discountMinor: 5000
});

const supportLine: InvoiceLineItem = calculateLineItem({
  id: "line_support",
  itemId: "item_support",
  description: "Monthly maintenance retainer",
  quantity: 1,
  unitPriceMinor: 45000,
  taxRateBps: 0,
  discountMinor: 0
});

function createSeedInvoice(
  invoice: Omit<
    Invoice,
    "subtotalMinor" | "taxTotalMinor" | "discountTotalMinor" | "totalMinor"
  >
): Invoice {
  return { ...invoice, ...calculateInvoiceTotals(invoice.lineItems) };
}

export const seedState: InvoiceCreatorState = {
  settings: {
    businessName: "Northwind Studio",
    businessEmail: "billing@northwind.example",
    businessPhone: "(312) 555-0148",
    businessAddress: "401 W Lake St\nChicago, IL 60606",
    brandColor: "#176b5b",
    logoDataUrl: "",
    defaultCurrency: "USD",
    defaultTerms: "Payment due within 14 days.",
    defaultNotes: "Thank you for your business.",
    invoicePrefix: "INV",
    nextInvoiceNumber: 1004
  },
  customers: [
    {
      id: "cus_northstar",
      name: "Maya Patel",
      company: "Northstar Labs",
      email: "maya@northstar.example",
      phone: "(312) 555-0199",
      billingAddress: "800 W Fulton Market\nChicago, IL 60607",
      notes: "Prefers invoices by email."
    },
    {
      id: "cus_luma",
      name: "Elliot Ross",
      company: "Luma Floral",
      email: "elliot@lumafloral.example",
      phone: "(773) 555-0181",
      billingAddress: "1550 N Damen Ave\nChicago, IL 60622",
      notes: "Regular monthly client."
    },
    {
      id: "cus_kairo",
      name: "Nadia Brooks",
      company: "Kairo Wellness",
      email: "nadia@kairo.example",
      phone: "(708) 555-0117",
      billingAddress: "212 S State St\nChicago, IL 60604",
      notes: "Send PDFs to the billing email."
    }
  ],
  items: [
    {
      id: "item_consulting",
      name: "Consulting",
      description: "Operations, workflow, and systems consulting",
      unitPriceMinor: 12500,
      taxRateBps: 0,
      defaultQuantity: 1
    },
    {
      id: "item_design",
      name: "Brand setup",
      description: "Template design, logo placement, and invoice styling",
      unitPriceMinor: 65000,
      taxRateBps: 825,
      defaultQuantity: 1
    },
    {
      id: "item_support",
      name: "Maintenance retainer",
      description: "Monthly support and administrative updates",
      unitPriceMinor: 45000,
      taxRateBps: 0,
      defaultQuantity: 1
    }
  ],
  payments: [],
  estimates: [],
  recurringTemplates: [],
  activityLogs: [],
  invoices: [
    createSeedInvoice({
      id: "inv_1001",
      customerId: "cus_northstar",
      invoiceNumber: "INV-1001",
      issueDate: "2026-06-01",
      dueDate: "2026-06-15",
      status: "sent",
      template: "classic",
      currency: "USD",
      notes: "Thanks for the continued partnership.",
      terms: "Payment due within 14 days.",
      lineItems: [consultingLine, designLine],
      createdAt: "2026-06-01T14:00:00.000Z",
      updatedAt: "2026-06-01T14:00:00.000Z"
    }),
    createSeedInvoice({
      id: "inv_1002",
      customerId: "cus_luma",
      invoiceNumber: "INV-1002",
      issueDate: "2026-05-10",
      dueDate: "2026-05-24",
      status: "overdue",
      template: "modern",
      currency: "USD",
      notes: "Includes the May retainer.",
      terms: "Payment due within 14 days.",
      lineItems: [supportLine],
      createdAt: "2026-05-10T12:00:00.000Z",
      updatedAt: "2026-05-10T12:00:00.000Z"
    }),
    createSeedInvoice({
      id: "inv_1003",
      customerId: "cus_kairo",
      invoiceNumber: "INV-1003",
      issueDate: "2026-06-02",
      dueDate: "2026-06-16",
      status: "paid",
      template: "minimal",
      currency: "USD",
      notes: "Thank you for your business.",
      terms: "Payment due within 14 days.",
      lineItems: [designLine],
      createdAt: "2026-06-02T12:00:00.000Z",
      updatedAt: "2026-06-03T10:30:00.000Z"
    })
  ]
};
