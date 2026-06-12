export type InvoiceStatus =
  | "draft"
  | "sent"
  | "unpaid"
  | "overdue"
  | "partially_paid"
  | "paid"
  | "void";

export type InvoiceTemplate = "classic" | "modern" | "minimal";

export type Customer = {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  billingAddress: string;
  notes: string;
};

export type Item = {
  id: string;
  name: string;
  description: string;
  unitPriceMinor: number;
  taxRateBps: number;
  defaultQuantity: number;
};

export type InvoiceLineItem = {
  id: string;
  itemId?: string;
  description: string;
  quantity: number;
  unitPriceMinor: number;
  taxRateBps: number;
  discountMinor: number;
  lineSubtotalMinor: number;
  lineTaxMinor: number;
  lineTotalMinor: number;
};

export type Invoice = {
  id: string;
  customerId: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  status: InvoiceStatus;
  template: InvoiceTemplate;
  subtotalMinor: number;
  taxTotalMinor: number;
  discountTotalMinor: number;
  totalMinor: number;
  currency: string;
  notes: string;
  terms: string;
  lineItems: InvoiceLineItem[];
  createdAt: string;
  updatedAt: string;
};

export type Payment = {
  id: string;
  invoiceId: string;
  amountMinor: number;
  paidAt: string;
  method: string;
  note: string;
  createdAt: string;
};

export type EstimateStatus = "draft" | "sent" | "accepted" | "rejected" | "expired";

export type Estimate = {
  id: string;
  customerId: string;
  estimateNumber: string;
  issueDate: string;
  expiresDate: string;
  status: EstimateStatus;
  subtotalMinor: number;
  taxTotalMinor: number;
  discountTotalMinor: number;
  totalMinor: number;
  currency: string;
  notes: string;
  terms: string;
  lineItems: InvoiceLineItem[];
  createdAt: string;
  updatedAt: string;
};

export type RecurringFrequency = "weekly" | "monthly" | "quarterly" | "yearly";

export type RecurringTemplate = {
  id: string;
  customerId: string;
  name: string;
  frequency: RecurringFrequency;
  interval: number;
  nextIssueDate: string;
  active: boolean;
  currency: string;
  notes: string;
  terms: string;
  lineItems: InvoiceLineItem[];
  createdAt: string;
  updatedAt: string;
};

export type ActivityLog = {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  details: string;
  createdAt: string;
};

export type BusinessSettings = {
  businessName: string;
  businessEmail: string;
  businessPhone: string;
  businessAddress: string;
  brandColor: string;
  logoDataUrl: string;
  defaultCurrency: string;
  defaultTerms: string;
  defaultNotes: string;
  invoicePrefix: string;
  nextInvoiceNumber: number;
};

export type InvoiceCreatorState = {
  settings: BusinessSettings;
  customers: Customer[];
  items: Item[];
  invoices: Invoice[];
  payments: Payment[];
  estimates: Estimate[];
  recurringTemplates: RecurringTemplate[];
  activityLogs: ActivityLog[];
};
