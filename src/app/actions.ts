"use server";

import type { Prisma, PrismaClient } from "@prisma/client";
import { revalidatePath } from "next/cache";
import {
  clearSession,
  createPasswordCredentials,
  createSession,
  getCurrentUser,
  normalizeEmail,
  requireCurrentUser,
  verifyPassword,
  type AuthUser
} from "@/features/auth/server-auth";
import { calculateInvoiceTotals, calculateLineItem, createId } from "@/features/invoices/calculations";
import type {
  BusinessSettings,
  Customer,
  Estimate,
  EstimateStatus,
  Invoice,
  InvoiceCreatorState,
  InvoiceLineItem,
  InvoiceStatus,
  InvoiceTemplate,
  Item,
  RecurringFrequency,
  RecurringTemplate
} from "@/features/invoices/types";
import {
  persistBusinessLogo,
  resolveBusinessLogo,
  validateBusinessLogo
} from "@/lib/business-logo";
import { getPrisma, runPrismaTransaction } from "@/lib/prisma";

type Transaction = Prisma.TransactionClient;
type InvoiceDraftInput = Pick<
  Invoice,
  "customerId" | "issueDate" | "dueDate" | "status" | "template" | "notes" | "terms" | "lineItems"
>;

export type CustomerInput = Omit<Customer, "id"> & { id?: string };
export type ItemInput = Omit<Item, "id"> & { id?: string };
export type PaymentInput = {
  invoiceId: string;
  amountMinor: number;
  paidAt: string;
  method?: string;
  note?: string;
};
export type EstimateInput = Omit<Estimate, "id" | "createdAt" | "updatedAt"> & {
  id?: string;
};
export type RecurringTemplateInput = Omit<
  RecurringTemplate,
  "id" | "createdAt" | "updatedAt"
> & { id?: string };
export type AuthSnapshot = {
  user: AuthUser;
  state: InvoiceCreatorState | null;
};
export type BusinessOnboardingInput = Pick<
  BusinessSettings,
  | "businessName"
  | "businessEmail"
  | "businessPhone"
  | "businessAddress"
  | "defaultCurrency"
  | "invoicePrefix"
>;

function toDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid date: ${value}`);
  return date;
}

function dateInput(value: Date) {
  return value.toISOString().slice(0, 10);
}

function invoiceTemplate(value: string): InvoiceTemplate {
  return value === "modern" || value === "minimal" ? value : "classic";
}

function normalizedLines(lines: InvoiceLineItem[]) {
  return lines.map((line) =>
    calculateLineItem({
      id: line.id || createId("line"),
      itemId: line.itemId,
      description: line.description.trim(),
      quantity: Number(line.quantity) || 0,
      unitPriceMinor: Math.round(Number(line.unitPriceMinor) || 0),
      taxRateBps: Math.round(Number(line.taxRateBps) || 0),
      discountMinor: Math.max(Math.round(Number(line.discountMinor) || 0), 0)
    })
  );
}

function lineData(lines: InvoiceLineItem[]) {
  return normalizedLines(lines).map((line, position) => ({ ...line, position }));
}

async function workspaceForUser(userId: string, client?: Transaction | PrismaClient) {
  const prisma = client ?? (await getPrisma());
  const workspace = await prisma.workspace.findUnique({ where: { ownerId: userId } });
  if (!workspace) throw new Error("Workspace not found.");
  return workspace;
}

async function requireWorkspaceCustomer(
  tx: Transaction,
  workspaceId: string,
  customerId: string
) {
  const customer = await tx.customer.findFirst({ where: { id: customerId, workspaceId } });
  if (!customer) throw new Error("Customer not found.");
}

async function logActivity(
  tx: Transaction,
  workspaceId: string,
  entityType: string,
  entityId: string,
  action: string,
  details: string
) {
  await tx.activityLog.create({
    data: {
      id: createId("activity"),
      workspaceId,
      entityType,
      entityId,
      action,
      details
    }
  });
}

async function createWorkspace(user: AuthUser, input: BusinessOnboardingInput) {
  const prisma = await getPrisma();
  return runPrismaTransaction(prisma, async (tx) => {
    const businessName = input.businessName.trim();
    if (!businessName) throw new Error("Business name is required.");
    if (businessName.length > 120) throw new Error("Business name is too long.");
    const businessEmail = normalizeEmail(input.businessEmail || user.email);
    if (!/^\S+@\S+\.\S+$/.test(businessEmail)) {
      throw new Error("Enter a valid billing email address.");
    }
    const invoicePrefix = input.invoicePrefix.trim().toUpperCase();
    if (!/^[A-Z0-9-]{1,12}$/.test(invoicePrefix)) {
      throw new Error("Use 1 to 12 letters, numbers, or hyphens for the invoice prefix.");
    }
    const supportedCurrencies = new Set(["USD", "CAD", "EUR", "GBP", "AUD"]);
    const defaultCurrency = input.defaultCurrency.trim().toUpperCase();
    if (!supportedCurrencies.has(defaultCurrency)) throw new Error("Currency is not supported.");
    const workspace = await tx.workspace.create({
      data: {
        ownerId: user.id,
        businessName,
        businessEmail,
        businessPhone: input.businessPhone.trim(),
        businessAddress: input.businessAddress.trim(),
        defaultCurrency,
        defaultTerms: "Payment due within 14 days.",
        defaultNotes: "Thank you for your business.",
        invoicePrefix,
        nextInvoiceNumber: 1001
      }
    });

    await logActivity(
      tx,
      workspace.id,
      "workspace",
      workspace.id,
      "created",
      `Created workspace for ${businessName}`
    );
    return workspace;
  });
}

async function readWorkspaceState(userId: string): Promise<InvoiceCreatorState> {
  const prisma = await getPrisma();
  const workspace = await prisma.workspace.findUnique({
    where: { ownerId: userId },
    include: {
      customers: { orderBy: [{ company: "asc" }, { name: "asc" }] },
      items: { orderBy: { name: "asc" } },
      invoices: {
        orderBy: { createdAt: "desc" },
        include: { lineItems: { orderBy: { position: "asc" } } }
      },
      estimates: {
        orderBy: { createdAt: "desc" },
        include: { lineItems: { orderBy: { position: "asc" } } }
      },
      recurringTemplates: {
        orderBy: { createdAt: "desc" },
        include: { lineItems: { orderBy: { position: "asc" } } }
      },
      activityLogs: { orderBy: { createdAt: "desc" }, take: 100 }
    }
  });
  if (!workspace) throw new Error("Workspace not found.");

  const payments = await prisma.payment.findMany({
    where: { invoice: { workspaceId: workspace.id } },
    orderBy: { createdAt: "desc" }
  });

  const mapLine = (line: {
    id: string;
    itemId: string | null;
    description: string;
    quantity: number;
    unitPriceMinor: number;
    taxRateBps: number;
    discountMinor: number;
    lineSubtotalMinor: number;
    lineTaxMinor: number;
    lineTotalMinor: number;
  }): InvoiceLineItem => ({
    id: line.id,
    itemId: line.itemId ?? undefined,
    description: line.description,
    quantity: line.quantity,
    unitPriceMinor: line.unitPriceMinor,
    taxRateBps: line.taxRateBps,
    discountMinor: line.discountMinor,
    lineSubtotalMinor: line.lineSubtotalMinor,
    lineTaxMinor: line.lineTaxMinor,
    lineTotalMinor: line.lineTotalMinor
  });

  return {
    settings: {
      businessName: workspace.businessName,
      businessEmail: workspace.businessEmail,
      businessPhone: workspace.businessPhone,
      businessAddress: workspace.businessAddress,
      brandColor: workspace.brandColor,
      logoDataUrl: await resolveBusinessLogo(workspace.logoDataUrl),
      defaultCurrency: workspace.defaultCurrency,
      defaultTerms: workspace.defaultTerms,
      defaultNotes: workspace.defaultNotes,
      invoicePrefix: workspace.invoicePrefix,
      nextInvoiceNumber: workspace.nextInvoiceNumber
    },
    customers: workspace.customers.map(
      ({ id, name, company, email, phone, billingAddress, notes }) => ({
        id,
        name,
        company,
        email,
        phone,
        billingAddress,
        notes
      })
    ),
    items: workspace.items.map(
      ({ id, name, description, unitPriceMinor, taxRateBps, defaultQuantity }) => ({
        id,
        name,
        description,
        unitPriceMinor,
        taxRateBps,
        defaultQuantity
      })
    ),
    invoices: workspace.invoices.map((invoice) => ({
      id: invoice.id,
      customerId: invoice.customerId,
      invoiceNumber: invoice.invoiceNumber,
      issueDate: dateInput(invoice.issueDate),
      dueDate: dateInput(invoice.dueDate),
      status: invoice.status as InvoiceStatus,
      template: invoiceTemplate(invoice.template),
      subtotalMinor: invoice.subtotalMinor,
      taxTotalMinor: invoice.taxTotalMinor,
      discountTotalMinor: invoice.discountTotalMinor,
      totalMinor: invoice.totalMinor,
      currency: invoice.currency,
      notes: invoice.notes,
      terms: invoice.terms,
      lineItems: invoice.lineItems.map(mapLine),
      createdAt: invoice.createdAt.toISOString(),
      updatedAt: invoice.updatedAt.toISOString()
    })),
    payments: payments.map((payment) => ({
      id: payment.id,
      invoiceId: payment.invoiceId,
      amountMinor: payment.amountMinor,
      paidAt: dateInput(payment.paidAt),
      method: payment.method,
      note: payment.note,
      createdAt: payment.createdAt.toISOString()
    })),
    estimates: workspace.estimates.map((estimate) => ({
      id: estimate.id,
      customerId: estimate.customerId,
      estimateNumber: estimate.estimateNumber,
      issueDate: dateInput(estimate.issueDate),
      expiresDate: dateInput(estimate.expiresDate),
      status: estimate.status as EstimateStatus,
      subtotalMinor: estimate.subtotalMinor,
      taxTotalMinor: estimate.taxTotalMinor,
      discountTotalMinor: estimate.discountTotalMinor,
      totalMinor: estimate.totalMinor,
      currency: estimate.currency,
      notes: estimate.notes,
      terms: estimate.terms,
      lineItems: estimate.lineItems.map(mapLine),
      createdAt: estimate.createdAt.toISOString(),
      updatedAt: estimate.updatedAt.toISOString()
    })),
    recurringTemplates: workspace.recurringTemplates.map((template) => ({
      id: template.id,
      customerId: template.customerId,
      name: template.name,
      frequency: template.frequency as RecurringFrequency,
      interval: template.interval,
      nextIssueDate: dateInput(template.nextIssueDate),
      active: template.active,
      currency: template.currency,
      notes: template.notes,
      terms: template.terms,
      lineItems: template.lineItems.map(mapLine),
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt.toISOString()
    })),
    activityLogs: workspace.activityLogs.map((activity) => ({
      id: activity.id,
      entityType: activity.entityType,
      entityId: activity.entityId,
      action: activity.action,
      details: activity.details,
      createdAt: activity.createdAt.toISOString()
    }))
  };
}

async function refresh(userId: string) {
  revalidatePath("/");
  return readWorkspaceState(userId);
}

export async function registerAccount(input: { email: string; password: string }): Promise<AuthSnapshot> {
  const prisma = await getPrisma();
  const email = normalizeEmail(input.email);
  validateCredentials(email, input.password);
  const credentials = await createPasswordCredentials(input.password);
  let user: AuthUser;
  try {
    user = await prisma.user.create({
      data: { email, ...credentials },
      select: { id: true, email: true }
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      throw new Error("An account with that email already exists.");
    }
    throw error;
  }
  await createSession(user.id);
  return { user, state: null };
}

export async function loginAccount(input: { email: string; password: string }): Promise<AuthSnapshot> {
  const prisma = await getPrisma();
  const email = normalizeEmail(input.email);
  const userRecord = await prisma.user.findUnique({ where: { email } });
  const valid =
    userRecord &&
    (await verifyPassword(input.password, userRecord.passwordSalt, userRecord.passwordHash));
  if (!userRecord || !valid) throw new Error("The email or password is incorrect.");
  await prisma.session.deleteMany({
    where: { userId: userRecord.id, expiresAt: { lte: new Date() } }
  });
  await createSession(userRecord.id);
  const user = { id: userRecord.id, email: userRecord.email };
  const workspace = await prisma.workspace.findUnique({ where: { ownerId: user.id } });
  return { user, state: workspace ? await readWorkspaceState(user.id) : null };
}

export async function logoutAccount() {
  await clearSession();
  revalidatePath("/");
}

export async function getInitialSession(): Promise<AuthSnapshot | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const prisma = await getPrisma();
  const workspace = await prisma.workspace.findUnique({ where: { ownerId: user.id } });
  return { user, state: workspace ? await readWorkspaceState(user.id) : null };
}

export async function getInitialAppState() {
  const prisma = await getPrisma();
  const [initialSession, accountCount] = await Promise.all([
    getInitialSession(),
    prisma.user.count()
  ]);
  return { initialSession, hasAccounts: accountCount > 0 };
}

export async function completeBusinessOnboarding(input: BusinessOnboardingInput) {
  const user = await requireCurrentUser();
  const prisma = await getPrisma();
  const existing = await prisma.workspace.findUnique({ where: { ownerId: user.id } });
  if (!existing) await createWorkspace(user, input);
  return refresh(user.id);
}

function validateCredentials(email: string, password: string) {
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Enter a valid email address.");
  if (password.length < 8) throw new Error("Use at least 8 characters for the password.");
  if (password.length > 128) throw new Error("Use a password no longer than 128 characters.");
}

export async function createInvoice(draft: InvoiceDraftInput) {
  const user = await requireCurrentUser();
  const prisma = await getPrisma();
  const invoiceId = createId("inv");
  await runPrismaTransaction(prisma, async (tx) => {
    const workspace = await workspaceForUser(user.id, tx);
    await requireWorkspaceCustomer(tx, workspace.id, draft.customerId);
    const lines = lineData(draft.lineItems);
    const totals = calculateInvoiceTotals(lines);
    const invoiceNumber = `${workspace.invoicePrefix}-${workspace.nextInvoiceNumber}`;
    await tx.invoice.create({
      data: {
        id: invoiceId,
        workspaceId: workspace.id,
        customerId: draft.customerId,
        invoiceNumber,
        issueDate: toDate(draft.issueDate),
        dueDate: toDate(draft.dueDate),
        status: draft.status,
        template: invoiceTemplate(draft.template),
        currency: workspace.defaultCurrency,
        notes: draft.notes,
        terms: draft.terms,
        ...totals,
        lineItems: { create: lines }
      }
    });
    await tx.workspace.update({
      where: { id: workspace.id },
      data: { nextInvoiceNumber: { increment: 1 } }
    });
    await logActivity(tx, workspace.id, "invoice", invoiceId, "created", `Created ${invoiceNumber}`);
  });
  const state = await refresh(user.id);
  const invoice = state.invoices.find((entry) => entry.id === invoiceId);
  if (!invoice) throw new Error("The invoice could not be loaded after saving.");
  return { state, invoice };
}

export async function updateInvoice(invoice: Invoice) {
  const user = await requireCurrentUser();
  const prisma = await getPrisma();
  await runPrismaTransaction(prisma, async (tx) => {
    const workspace = await workspaceForUser(user.id, tx);
    await requireWorkspaceCustomer(tx, workspace.id, invoice.customerId);
    const lines = lineData(invoice.lineItems);
    const totals = calculateInvoiceTotals(lines);
    const updated = await tx.invoice.updateMany({
      where: { id: invoice.id, workspaceId: workspace.id },
      data: {
        customerId: invoice.customerId,
        issueDate: toDate(invoice.issueDate),
        dueDate: toDate(invoice.dueDate),
        status: invoice.status,
        template: invoiceTemplate(invoice.template),
        currency: invoice.currency,
        notes: invoice.notes,
        terms: invoice.terms,
        ...totals
      }
    });
    if (!updated.count) throw new Error("Invoice not found.");
    await tx.invoiceLineItem.deleteMany({ where: { invoiceId: invoice.id } });
    if (lines.length) {
      await tx.invoiceLineItem.createMany({ data: lines.map((line) => ({ ...line, invoiceId: invoice.id })) });
    }
    await logActivity(tx, workspace.id, "invoice", invoice.id, "updated", `Updated ${invoice.invoiceNumber}`);
  });
  return refresh(user.id);
}

export async function updateInvoiceStatus(invoiceId: string, status: InvoiceStatus) {
  const user = await requireCurrentUser();
  const prisma = await getPrisma();
  await runPrismaTransaction(prisma, async (tx) => {
    const workspace = await workspaceForUser(user.id, tx);
    const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, workspaceId: workspace.id } });
    if (!invoice) throw new Error("Invoice not found.");
    await tx.invoice.update({ where: { id: invoiceId }, data: { status } });
    await logActivity(
      tx,
      workspace.id,
      "invoice",
      invoiceId,
      "status_updated",
      `Changed ${invoice.invoiceNumber} to ${status}`
    );
  });
  return refresh(user.id);
}

export async function duplicateInvoice(invoiceId: string) {
  const user = await requireCurrentUser();
  const prisma = await getPrisma();
  await runPrismaTransaction(prisma, async (tx) => {
    const workspace = await workspaceForUser(user.id, tx);
    const source = await tx.invoice.findFirst({
      where: { id: invoiceId, workspaceId: workspace.id },
      include: { lineItems: { orderBy: { position: "asc" } } }
    });
    if (!source) throw new Error("Invoice not found.");
    const newId = createId("inv");
    const invoiceNumber = `${workspace.invoicePrefix}-${workspace.nextInvoiceNumber}`;
    const issueDate = new Date();
    issueDate.setUTCHours(0, 0, 0, 0);
    const dueDate = new Date(issueDate);
    dueDate.setUTCDate(dueDate.getUTCDate() + 14);
    await tx.invoice.create({
      data: {
        id: newId,
        workspaceId: workspace.id,
        customerId: source.customerId,
        invoiceNumber,
        issueDate,
        dueDate,
        status: "draft",
        template: invoiceTemplate(source.template),
        subtotalMinor: source.subtotalMinor,
        taxTotalMinor: source.taxTotalMinor,
        discountTotalMinor: source.discountTotalMinor,
        totalMinor: source.totalMinor,
        currency: source.currency,
        notes: source.notes,
        terms: source.terms,
        lineItems: {
          create: source.lineItems.map(({ position, itemId, description, quantity, unitPriceMinor, taxRateBps, discountMinor, lineSubtotalMinor, lineTaxMinor, lineTotalMinor }) => ({
            id: createId("line"),
            position,
            itemId,
            description,
            quantity,
            unitPriceMinor,
            taxRateBps,
            discountMinor,
            lineSubtotalMinor,
            lineTaxMinor,
            lineTotalMinor
          }))
        }
      }
    });
    await tx.workspace.update({ where: { id: workspace.id }, data: { nextInvoiceNumber: { increment: 1 } } });
    await logActivity(tx, workspace.id, "invoice", newId, "duplicated", `Duplicated ${source.invoiceNumber} as ${invoiceNumber}`);
  });
  return refresh(user.id);
}

export async function deleteInvoice(invoiceId: string) {
  const user = await requireCurrentUser();
  const prisma = await getPrisma();
  await runPrismaTransaction(prisma, async (tx) => {
    const workspace = await workspaceForUser(user.id, tx);
    const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, workspaceId: workspace.id } });
    if (!invoice) throw new Error("Invoice not found.");
    await tx.invoice.delete({ where: { id: invoiceId } });
    await logActivity(tx, workspace.id, "invoice", invoiceId, "deleted", `Deleted ${invoice.invoiceNumber}`);
  });
  return refresh(user.id);
}

export async function saveCustomer(input: CustomerInput) {
  const user = await requireCurrentUser();
  const prisma = await getPrisma();
  await runPrismaTransaction(prisma, async (tx) => {
    const workspace = await workspaceForUser(user.id, tx);
    const data = {
      name: input.name.trim(),
      company: input.company.trim(),
      email: input.email.trim(),
      phone: input.phone.trim(),
      billingAddress: input.billingAddress.trim(),
      notes: input.notes.trim()
    };
    if (input.id) {
      const updated = await tx.customer.updateMany({ where: { id: input.id, workspaceId: workspace.id }, data });
      if (!updated.count) throw new Error("Customer not found.");
      await logActivity(tx, workspace.id, "customer", input.id, "updated", `Updated ${data.company || data.name}`);
    } else {
      const id = createId("cus");
      await tx.customer.create({ data: { id, workspaceId: workspace.id, ...data } });
      await logActivity(tx, workspace.id, "customer", id, "created", `Created ${data.company || data.name}`);
    }
  });
  return refresh(user.id);
}

export async function saveItem(input: ItemInput) {
  const user = await requireCurrentUser();
  const prisma = await getPrisma();
  await runPrismaTransaction(prisma, async (tx) => {
    const workspace = await workspaceForUser(user.id, tx);
    const data = {
      name: input.name.trim(),
      description: input.description.trim(),
      unitPriceMinor: Math.round(input.unitPriceMinor),
      taxRateBps: Math.round(input.taxRateBps),
      defaultQuantity: Number(input.defaultQuantity) || 1
    };
    if (input.id) {
      const updated = await tx.item.updateMany({ where: { id: input.id, workspaceId: workspace.id }, data });
      if (!updated.count) throw new Error("Item not found.");
      await logActivity(tx, workspace.id, "item", input.id, "updated", `Updated ${data.name}`);
    } else {
      const id = createId("item");
      await tx.item.create({ data: { id, workspaceId: workspace.id, ...data } });
      await logActivity(tx, workspace.id, "item", id, "created", `Created ${data.name}`);
    }
  });
  return refresh(user.id);
}

export async function saveSettings(settings: BusinessSettings) {
  const user = await requireCurrentUser();
  const prisma = await getPrisma();
  const workspace = await workspaceForUser(user.id);
  const logoDataUrl = validateBusinessLogo(settings.logoDataUrl);
  const storedLogo = await persistBusinessLogo(workspace.id, logoDataUrl);
  await runPrismaTransaction(prisma, async (tx) => {
    await tx.workspace.update({
      where: { id: workspace.id },
      data: {
        businessName: settings.businessName,
        businessEmail: settings.businessEmail,
        businessPhone: settings.businessPhone,
        businessAddress: settings.businessAddress,
        brandColor: settings.brandColor,
        logoDataUrl: storedLogo,
        defaultCurrency: settings.defaultCurrency,
        defaultTerms: settings.defaultTerms,
        defaultNotes: settings.defaultNotes,
        invoicePrefix: settings.invoicePrefix,
        nextInvoiceNumber: settings.nextInvoiceNumber
      }
    });
    await logActivity(tx, workspace.id, "workspace", workspace.id, "updated", "Updated business settings");
  });
  const state = await refresh(user.id);
  state.settings.logoDataUrl = logoDataUrl;
  return state;
}

export async function recordPayment(input: PaymentInput) {
  const user = await requireCurrentUser();
  const prisma = await getPrisma();
  await runPrismaTransaction(prisma, async (tx) => {
    const workspace = await workspaceForUser(user.id, tx);
    const invoice = await tx.invoice.findFirst({
      where: { id: input.invoiceId, workspaceId: workspace.id },
      include: { payments: true }
    });
    if (!invoice) throw new Error("Invoice not found.");
    const amountMinor = Math.max(Math.round(input.amountMinor), 0);
    if (!amountMinor) throw new Error("Payment amount must be greater than zero.");
    const paymentId = createId("payment");
    await tx.payment.create({
      data: {
        id: paymentId,
        invoiceId: invoice.id,
        amountMinor,
        paidAt: toDate(input.paidAt),
        method: input.method?.trim() ?? "manual",
        note: input.note?.trim() ?? ""
      }
    });
    const paidMinor = invoice.payments.reduce((sum, payment) => sum + payment.amountMinor, 0) + amountMinor;
    const status: InvoiceStatus = paidMinor >= invoice.totalMinor ? "paid" : "partially_paid";
    await tx.invoice.update({ where: { id: invoice.id }, data: { status } });
    await logActivity(tx, workspace.id, "payment", paymentId, "created", `Recorded payment for ${invoice.invoiceNumber}`);
  });
  return refresh(user.id);
}

export async function saveEstimate(input: EstimateInput) {
  const user = await requireCurrentUser();
  const prisma = await getPrisma();
  await runPrismaTransaction(prisma, async (tx) => {
    const workspace = await workspaceForUser(user.id, tx);
    await requireWorkspaceCustomer(tx, workspace.id, input.customerId);
    const lines = lineData(input.lineItems);
    const totals = calculateInvoiceTotals(lines);
    const data = {
      customerId: input.customerId,
      estimateNumber: input.estimateNumber,
      issueDate: toDate(input.issueDate),
      expiresDate: toDate(input.expiresDate),
      status: input.status,
      currency: input.currency,
      notes: input.notes,
      terms: input.terms,
      ...totals
    };
    const id = input.id ?? createId("est");
    if (input.id) {
      const updated = await tx.estimate.updateMany({ where: { id, workspaceId: workspace.id }, data });
      if (!updated.count) throw new Error("Estimate not found.");
      await tx.estimateLineItem.deleteMany({ where: { estimateId: id } });
      if (lines.length) await tx.estimateLineItem.createMany({ data: lines.map((line) => ({ ...line, estimateId: id })) });
      await logActivity(tx, workspace.id, "estimate", id, "updated", `Updated ${input.estimateNumber}`);
    } else {
      await tx.estimate.create({ data: { id, workspaceId: workspace.id, ...data, lineItems: { create: lines } } });
      await logActivity(tx, workspace.id, "estimate", id, "created", `Created ${input.estimateNumber}`);
    }
  });
  return refresh(user.id);
}

export async function saveRecurringTemplate(input: RecurringTemplateInput) {
  const user = await requireCurrentUser();
  const prisma = await getPrisma();
  await runPrismaTransaction(prisma, async (tx) => {
    const workspace = await workspaceForUser(user.id, tx);
    await requireWorkspaceCustomer(tx, workspace.id, input.customerId);
    const lines = lineData(input.lineItems);
    const data = {
      customerId: input.customerId,
      name: input.name,
      frequency: input.frequency,
      interval: Math.max(Math.round(input.interval), 1),
      nextIssueDate: toDate(input.nextIssueDate),
      active: input.active,
      currency: input.currency,
      notes: input.notes,
      terms: input.terms
    };
    const id = input.id ?? createId("recurring");
    if (input.id) {
      const updated = await tx.recurringTemplate.updateMany({ where: { id, workspaceId: workspace.id }, data });
      if (!updated.count) throw new Error("Recurring template not found.");
      await tx.recurringLineItem.deleteMany({ where: { recurringTemplateId: id } });
      if (lines.length) await tx.recurringLineItem.createMany({ data: lines.map((line) => ({ ...line, recurringTemplateId: id })) });
      await logActivity(tx, workspace.id, "recurring_template", id, "updated", `Updated ${input.name}`);
    } else {
      await tx.recurringTemplate.create({ data: { id, workspaceId: workspace.id, ...data, lineItems: { create: lines } } });
      await logActivity(tx, workspace.id, "recurring_template", id, "created", `Created ${input.name}`);
    }
  });
  return refresh(user.id);
}

export async function appendActivityLog(
  input: { entityType: string; entityId: string; action: string; details: string }
) {
  const user = await requireCurrentUser();
  const prisma = await getPrisma();
  await runPrismaTransaction(prisma, async (tx) => {
    const workspace = await workspaceForUser(user.id, tx);
    await logActivity(
      tx,
      workspace.id,
      input.entityType,
      input.entityId,
      input.action,
      input.details
    );
  });
  return refresh(user.id);
}
