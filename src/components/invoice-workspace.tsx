"use client";

import {
  ArrowRight,
  Building2,
  CheckCircle2,
  CircleAlert,
  Copy,
  Download,
  FileSpreadsheet,
  FilePlus2,
  FileText,
  LayoutDashboard,
  LogOut,
  Package,
  Pencil,
  Plus,
  Search,
  Settings,
  Trash2,
  UserRound
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  completeBusinessOnboarding,
  createInvoice as createInvoiceAction,
  deleteInvoice as deleteInvoiceAction,
  duplicateInvoice as duplicateInvoiceAction,
  loginAccount,
  logoutAccount,
  registerAccount,
  saveCustomer,
  saveItem,
  saveSettings,
  updateInvoiceStatus as updateInvoiceStatusAction,
  type AuthSnapshot,
  type BusinessOnboardingInput
} from "@/app/actions";
import { downloadCustomersExcel } from "@/features/customers/excel";
import { AuthScreen, OnboardingScreen } from "@/components/auth-flow";
import { InvoiceDocument } from "@/components/invoice-document";
import {
  ConfirmDialog,
  EmptyState,
  LoadingLabel,
  MetricCard,
  NavButton,
  SectionHeading,
  ToastRegion,
  type ToastMessage
} from "@/components/workspace-ui";
import {
  addDaysInput,
  bpsToPercent,
  calculateInvoiceTotals,
  calculateLineItem,
  createId,
  dollarsToMinor,
  formatCurrency,
  minorToDollars,
  percentToBps,
  statusLabel,
  todayInput
} from "@/features/invoices/calculations";
import { downloadInvoicePdf } from "@/features/invoices/pdf";
import { seedState } from "@/features/invoices/seed";
import type {
  BusinessSettings,
  Customer,
  Invoice,
  InvoiceCreatorState,
  InvoiceLineItem,
  InvoiceStatus,
  Item
} from "@/features/invoices/types";

const STATUS_OPTIONS: InvoiceStatus[] = [
  "draft",
  "sent",
  "unpaid",
  "overdue",
  "partially_paid",
  "paid",
  "void"
];

type View = "dashboard" | "builder" | "customers" | "items" | "settings";
type StatusFilter = "all" | InvoiceStatus;
type DraftInvoice = Pick<
  Invoice,
  "customerId" | "issueDate" | "dueDate" | "status" | "notes" | "terms" | "lineItems"
>;
type CustomerForm = Omit<Customer, "id">;
type ItemForm = Omit<Item, "id" | "unitPriceMinor" | "taxRateBps"> & {
  unitPrice: string;
  taxRate: string;
};
type PendingAction =
  | "invoice"
  | "duplicate"
  | "delete"
  | "customer"
  | "item"
  | "settings"
  | "logout"
  | `status:${string}`
  | null;

const emptyCustomerForm: CustomerForm = {
  name: "",
  company: "",
  email: "",
  phone: "",
  billingAddress: "",
  notes: ""
};

const emptyItemForm: ItemForm = {
  name: "",
  description: "",
  unitPrice: "",
  taxRate: "0",
  defaultQuantity: 1
};

function createBlankDraft(state: InvoiceCreatorState): DraftInvoice {
  const issueDate = todayInput();
  return {
    customerId: state.customers[0]?.id ?? "",
    issueDate,
    dueDate: addDaysInput(issueDate, 14),
    status: "draft",
    notes: state.settings.defaultNotes,
    terms: state.settings.defaultTerms,
    lineItems: [
      calculateLineItem({
        id: createId("line"),
        description: "",
        quantity: 1,
        unitPriceMinor: 0,
        taxRateBps: 0,
        discountMinor: 0
      })
    ]
  };
}

export function InvoiceWorkspace({
  initialSession,
  hasAccounts
}: {
  initialSession: AuthSnapshot | null;
  hasAccounts: boolean;
}) {
  const [state, setState] = useState<InvoiceCreatorState>(initialSession?.state ?? seedState);
  const [activeUser, setActiveUser] = useState<AuthSnapshot["user"] | null>(
    initialSession?.user ?? null
  );
  const [accountsExist, setAccountsExist] = useState(hasAccounts);
  const [workspaceReady, setWorkspaceReady] = useState(Boolean(initialSession?.state));
  const [view, setView] = useState<View>("dashboard");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [draft, setDraft] = useState<DraftInvoice>(() => createBlankDraft(seedState));
  const [selectedItemId, setSelectedItemId] = useState("");
  const [customerForm, setCustomerForm] = useState<CustomerForm>(emptyCustomerForm);
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [itemForm, setItemForm] = useState<ItemForm>(emptyItemForm);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [settingsForm, setSettingsForm] = useState<BusinessSettings>(
    initialSession?.state?.settings ?? seedState.settings
  );
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null);

  useEffect(() => {
    const requestedView = new URLSearchParams(window.location.search).get("view");
    if (["dashboard", "builder", "customers", "items", "settings"].includes(requestedView ?? "")) {
      setView(requestedView as View);
    }
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const customersById = useMemo(() => mapById(state.customers), [state.customers]);
  const totals = useMemo(() => calculateInvoiceTotals(draft.lineItems), [draft.lineItems]);
  const filteredInvoices = useMemo(() => {
    const search = query.trim().toLowerCase();
    return [...state.invoices]
      .filter((invoice) => statusFilter === "all" || invoice.status === statusFilter)
      .filter((invoice) => {
        if (!search) return true;
        const customer = customersById[invoice.customerId];
        return [
          invoice.invoiceNumber,
          customer?.name,
          customer?.company,
          invoice.issueDate,
          invoice.dueDate,
          statusLabel(invoice.status),
          formatCurrency(invoice.totalMinor, invoice.currency)
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(search));
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [customersById, query, state.invoices, statusFilter]);

  const metrics = useMemo(() => {
    const attention = new Set<InvoiceStatus>(["unpaid", "overdue", "partially_paid"]);
    return {
      total: state.invoices.length,
      drafts: state.invoices.filter((invoice) => invoice.status === "draft").length,
      attention: state.invoices.filter((invoice) => attention.has(invoice.status)).length,
      paidTotal: state.invoices
        .filter((invoice) => invoice.status === "paid")
        .reduce((sum, invoice) => sum + invoice.totalMinor, 0)
    };
  }, [state.invoices]);

  const isBusy = pendingAction !== null;

  function showToast(
    tone: ToastMessage["tone"],
    title: string,
    message?: string
  ) {
    setToast({ id: Date.now(), tone, title, message });
  }

  function showError(error: unknown, fallback = "Unable to save changes.") {
    showToast("error", "Something went wrong", error instanceof Error ? error.message : fallback);
  }

  function openBuilder() {
    if (!state.customers.length) {
      showToast("error", "Add a customer first", "Invoices need a customer before they can be created.");
      setView("customers");
      return;
    }
    setDraft(createBlankDraft(state));
    setSelectedItemId("");
    setView("builder");
  }

  function addSelectedItem() {
    const item = state.items.find((entry) => entry.id === selectedItemId);
    if (!item) return;
    setDraft((current) => ({
      ...current,
      lineItems: [
        ...current.lineItems,
        calculateLineItem({
          id: createId("line"),
          itemId: item.id,
          description: item.description || item.name,
          quantity: item.defaultQuantity,
          unitPriceMinor: item.unitPriceMinor,
          taxRateBps: item.taxRateBps,
          discountMinor: 0
        })
      ]
    }));
  }

  function addBlankLine() {
    setDraft((current) => ({
      ...current,
      lineItems: [
        ...current.lineItems,
        calculateLineItem({
          id: createId("line"),
          description: "",
          quantity: 1,
          unitPriceMinor: 0,
          taxRateBps: 0,
          discountMinor: 0
        })
      ]
    }));
  }

  function updateLine(lineId: string, patch: Partial<InvoiceLineItem>) {
    setDraft((current) => ({
      ...current,
      lineItems: current.lineItems.map((line) =>
        line.id === lineId
          ? calculateLineItem({
              ...line,
              ...patch,
              id: line.id,
              description: patch.description ?? line.description,
              quantity: patch.quantity ?? line.quantity,
              unitPriceMinor: patch.unitPriceMinor ?? line.unitPriceMinor,
              taxRateBps: patch.taxRateBps ?? line.taxRateBps,
              discountMinor: patch.discountMinor ?? line.discountMinor
            })
          : line
      )
    }));
  }

  async function saveInvoice(downloadAfterSave: boolean) {
    if (!draft.customerId) {
      showToast("error", "Customer required", "Select a customer before saving the invoice.");
      return;
    }
    if (!draft.lineItems.length || draft.lineItems.some((line) => !line.description.trim())) {
      showToast("error", "Line item required", "Add at least one line item with a description.");
      return;
    }
    if (!activeUser) return;

    setPendingAction("invoice");
    try {
      const result = await createInvoiceAction(draft);
      setState(result.state);
      setSettingsForm(result.state.settings);
      if (downloadAfterSave) {
        downloadInvoicePdf({
          invoice: result.invoice,
          customer: result.state.customers.find(
            (customer) => customer.id === result.invoice.customerId
          ),
          settings: result.state.settings
        });
      }
      setDraft(createBlankDraft(result.state));
      setView("dashboard");
      showToast(
        "success",
        downloadAfterSave ? "Invoice saved and downloaded" : "Invoice saved",
        `${result.invoice.invoiceNumber} is ready.`
      );
    } catch (error) {
      showError(error);
    } finally {
      setPendingAction(null);
    }
  }

  async function updateInvoiceStatus(invoiceId: string, status: InvoiceStatus) {
    if (!activeUser) return;
    const previousState = state;
    setState((current) => ({
      ...current,
      invoices: current.invoices.map((invoice) =>
        invoice.id === invoiceId
          ? { ...invoice, status, updatedAt: new Date().toISOString() }
          : invoice
      )
    }));
    setPendingAction(`status:${invoiceId}`);
    try {
      setState(await updateInvoiceStatusAction(invoiceId, status));
      showToast("success", "Status updated", `Invoice marked ${statusLabel(status).toLowerCase()}.`);
    } catch (error) {
      setState(previousState);
      showError(error);
    } finally {
      setPendingAction(null);
    }
  }

  async function duplicateInvoice(invoice: Invoice) {
    if (!activeUser) return;
    setPendingAction("duplicate");
    try {
      const nextState = await duplicateInvoiceAction(invoice.id);
      setState(nextState);
      setSettingsForm(nextState.settings);
      showToast("success", "Invoice duplicated", `A new draft was created from ${invoice.invoiceNumber}.`);
    } catch (error) {
      showError(error);
    } finally {
      setPendingAction(null);
    }
  }

  async function removeInvoice() {
    if (!activeUser || !invoiceToDelete) return;
    setPendingAction("delete");
    try {
      setState(await deleteInvoiceAction(invoiceToDelete.id));
      showToast("success", "Invoice deleted", `${invoiceToDelete.invoiceNumber} was removed.`);
      setInvoiceToDelete(null);
    } catch (error) {
      showError(error);
    } finally {
      setPendingAction(null);
    }
  }

  async function submitCustomer(event: FormEvent) {
    event.preventDefault();
    if (!customerForm.name.trim() && !customerForm.company.trim()) {
      showToast("error", "Customer name required", "Enter a contact name or company name.");
      return;
    }
    if (!activeUser) return;
    setPendingAction("customer");
    try {
      setState(
        await saveCustomer({
          id: editingCustomerId ?? undefined,
          ...customerForm
        })
      );
      setCustomerForm(emptyCustomerForm);
      setEditingCustomerId(null);
      showToast("success", editingCustomerId ? "Customer updated" : "Customer added");
    } catch (error) {
      showError(error);
    } finally {
      setPendingAction(null);
    }
  }

  function editCustomer(customer: Customer) {
    const { id, ...form } = customer;
    setEditingCustomerId(id);
    setCustomerForm(form);
  }

  async function submitItem(event: FormEvent) {
    event.preventDefault();
    if (!itemForm.name.trim()) {
      showToast("error", "Item name required", "Give this product or service a clear name.");
      return;
    }
    const itemValues = {
      name: itemForm.name,
      description: itemForm.description,
      unitPriceMinor: dollarsToMinor(itemForm.unitPrice),
      taxRateBps: percentToBps(itemForm.taxRate),
      defaultQuantity: Number(itemForm.defaultQuantity) || 1
    };
    if (!activeUser) return;
    setPendingAction("item");
    try {
      setState(
        await saveItem({
          id: editingItemId ?? undefined,
          ...itemValues
        })
      );
      setItemForm(emptyItemForm);
      setEditingItemId(null);
      showToast("success", editingItemId ? "Item updated" : "Item added");
    } catch (error) {
      showError(error);
    } finally {
      setPendingAction(null);
    }
  }

  function editItem(item: Item) {
    setEditingItemId(item.id);
    setItemForm({
      name: item.name,
      description: item.description,
      unitPrice: minorToDollars(item.unitPriceMinor),
      taxRate: bpsToPercent(item.taxRateBps),
      defaultQuantity: item.defaultQuantity
    });
  }

  async function submitSettings(event: FormEvent) {
    event.preventDefault();
    if (!activeUser) return;
    setPendingAction("settings");
    try {
      const nextState = await saveSettings(settingsForm);
      setState(nextState);
      showToast("success", "Settings saved", "New invoices will use these business defaults.");
    } catch (error) {
      showError(error);
    } finally {
      setPendingAction(null);
    }
  }

  function applyAuthSnapshot(snapshot: AuthSnapshot) {
    setActiveUser(snapshot.user);
    setWorkspaceReady(Boolean(snapshot.state));
    if (snapshot.state) {
      setState(snapshot.state);
      setDraft(createBlankDraft(snapshot.state));
      setSettingsForm(snapshot.state.settings);
      setView("dashboard");
    }
  }

  async function login(credentials: { email: string; password: string }) {
    applyAuthSnapshot(await loginAccount(credentials));
    setAccountsExist(true);
  }

  async function createAccount(credentials: { email: string; password: string }) {
    applyAuthSnapshot(await registerAccount(credentials));
    setAccountsExist(true);
  }

  async function finishOnboarding(input: BusinessOnboardingInput) {
    const profile = await completeBusinessOnboarding(input);
    setState(profile);
    setDraft(createBlankDraft(profile));
    setSettingsForm(profile.settings);
    setWorkspaceReady(true);
    setView("dashboard");
  }

  async function logout() {
    setPendingAction("logout");
    try {
      await logoutAccount();
      setActiveUser(null);
      setWorkspaceReady(false);
      setState(seedState);
      setDraft(createBlankDraft(seedState));
      setSettingsForm(seedState.settings);
    } catch (error) {
      showError(error, "Unable to log out.");
    } finally {
      setPendingAction(null);
    }
  }

  const viewMeta = {
    dashboard: { title: "Invoices", description: "Track drafts, payments, and customer activity." },
    builder: { title: "New invoice", description: "Build a clear, professional invoice and preview it live." },
    customers: { title: "Customers", description: "Keep billing contacts and addresses ready for reuse." },
    items: { title: "Items", description: "Save the products and services you bill most often." },
    settings: { title: "Settings", description: "Manage business details and invoice defaults." }
  }[view];

  if (!activeUser) {
    return (
      <AuthScreen
        hasAccounts={accountsExist}
        onCreateAccount={createAccount}
        onLogin={login}
      />
    );
  }

  if (!workspaceReady) {
    return (
      <OnboardingScreen
        email={activeUser.email}
        onComplete={finishOnboarding}
        onLogout={logout}
      />
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <span className="brand-mark"><FileText size={22} /></span>
          <div><strong>Invoice Creator</strong><span>Business workspace</span></div>
        </div>
        <nav className="nav-list" aria-label="Main navigation">
          <NavButton active={view === "dashboard"} icon={<LayoutDashboard size={18} />} onClick={() => setView("dashboard")}>Invoices</NavButton>
          <NavButton active={view === "builder"} icon={<FilePlus2 size={18} />} onClick={openBuilder}>New invoice</NavButton>
          <NavButton active={view === "customers"} icon={<UserRound size={18} />} onClick={() => setView("customers")}>Customers</NavButton>
          <NavButton active={view === "items"} icon={<Package size={18} />} onClick={() => setView("items")}>Items</NavButton>
          <NavButton active={view === "settings"} icon={<Settings size={18} />} onClick={() => setView("settings")}>Settings</NavButton>
          <button className="nav-button mobile-logout" disabled={pendingAction === "logout"} title="Log out" aria-label="Log out" type="button" onClick={() => void logout()}><LogOut size={18} /><span>Log out</span></button>
        </nav>
        <div className="sidebar-foot">
          <Building2 size={17} />
          <div><span>{state.settings.businessName}</span><small>{activeUser.email}</small></div>
          <button className="sidebar-logout" disabled={pendingAction === "logout"} title="Log out" aria-label="Log out" type="button" onClick={() => void logout()}><LogOut size={17} /></button>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="topbar-copy"><p className="eyebrow">Invoice workspace</p><h1>{viewMeta.title}</h1><p>{viewMeta.description}</p></div>
          <div className="topbar-actions">
            {view === "customers" && <button className="secondary-button" disabled={!state.customers.length} onClick={() => downloadCustomersExcel(state.customers, state.settings.businessName)}><FileSpreadsheet size={18} />Export customers</button>}
            {view !== "builder" && <button className="primary-button" onClick={openBuilder}><Plus size={18} />New invoice</button>}
          </div>
        </header>

        {view === "dashboard" && (
          <section className="view-stack view-enter">
            <div className="metric-grid">
              <MetricCard icon={<FileText size={20} />} label="All invoices" value={String(metrics.total)} />
              <MetricCard icon={<FilePlus2 size={20} />} label="Drafts" value={String(metrics.drafts)} />
              <MetricCard icon={<CircleAlert size={20} />} label="Needs attention" tone="warning" value={String(metrics.attention)} />
              <MetricCard icon={<CheckCircle2 size={20} />} label="Marked paid" tone="success" value={formatCurrency(metrics.paidTotal, state.settings.defaultCurrency)} />
            </div>
            {!state.invoices.length ? (
              <div className="welcome-panel">
                <div><span className="welcome-kicker">Ready when you are</span><h2>Create your first invoice</h2><p>Add a customer, optionally save your common services, then build and download a polished PDF.</p></div>
                <div className="welcome-steps">
                  <button type="button" onClick={() => setView("customers")}><span>1</span><div><strong>Add a customer</strong><small>Save billing and contact details</small></div><ArrowRight size={17} /></button>
                  <button type="button" onClick={() => setView("items")}><span>2</span><div><strong>Save an item</strong><small>Reuse products and services</small></div><ArrowRight size={17} /></button>
                  <button type="button" disabled={!state.customers.length} onClick={openBuilder}><span>3</span><div><strong>Create an invoice</strong><small>Preview, save, and download</small></div><ArrowRight size={17} /></button>
                </div>
              </div>
            ) : (
              <>
                <div className="toolbar">
                  <label className="search-field"><Search size={18} /><span className="sr-only">Search invoices</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by invoice, customer, date, or amount" /></label>
                  <label className="filter-field"><span className="sr-only">Filter by status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}><option value="all">All statuses</option>{STATUS_OPTIONS.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label>
                </div>
                <div className="table-shell">
                  <table className="invoice-table">
                    <thead><tr><th>Invoice</th><th>Customer</th><th>Issued</th><th>Due</th><th>Total</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
                    <tbody>
                      {filteredInvoices.map((invoice) => {
                        const customer = customersById[invoice.customerId];
                        const statusBusy = pendingAction === `status:${invoice.id}`;
                        return <tr key={invoice.id}>
                          <td><strong>{invoice.invoiceNumber}</strong></td>
                          <td><strong>{customer?.company || customer?.name || "Customer"}</strong><span>{customer?.name}</span></td>
                          <td>{formatDate(invoice.issueDate)}</td>
                          <td>{formatDate(invoice.dueDate)}</td>
                          <td><strong>{formatCurrency(invoice.totalMinor, invoice.currency)}</strong></td>
                          <td><select disabled={isBusy} aria-busy={statusBusy} aria-label={`Status for ${invoice.invoiceNumber}`} className={`status-select status-${invoice.status}`} value={invoice.status} onChange={(event) => updateInvoiceStatus(invoice.id, event.target.value as InvoiceStatus)}>{STATUS_OPTIONS.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></td>
                          <td><div className="row-actions">
                            <button className="icon-button" title="Download PDF" aria-label={`Download ${invoice.invoiceNumber} PDF`} type="button" onClick={() => downloadInvoicePdf({ invoice, customer, settings: state.settings })}><Download size={17} /></button>
                            <button disabled={isBusy} className="icon-button" title="Duplicate invoice" aria-label={`Duplicate ${invoice.invoiceNumber}`} type="button" onClick={() => duplicateInvoice(invoice)}><Copy size={17} /></button>
                            <button disabled={isBusy} className="icon-button danger" title="Delete invoice" aria-label={`Delete ${invoice.invoiceNumber}`} type="button" onClick={() => setInvoiceToDelete(invoice)}><Trash2 size={17} /></button>
                          </div></td>
                        </tr>;
                      })}
                    </tbody>
                  </table>
                  {!filteredInvoices.length && <EmptyState title="No matching invoices" description="Try a different search term or status filter." />}
                </div>
              </>
            )}
          </section>
        )}

        {view === "builder" && (
          <section className="builder-grid view-enter">
            <div className="builder-form">
              {!state.customers.length && (
                <div className="inline-notice"><CircleAlert size={19} /><div><strong>A customer is required</strong><span>Add a billing contact before saving this invoice.</span></div><button className="secondary-button" type="button" onClick={() => setView("customers")}>Add customer</button></div>
              )}
              <div className="form-band">
                <SectionHeading number="1" title="Invoice details" description="Choose who you are billing and set the invoice dates." />
                <div className="field-grid two">
                  <label>Customer<select value={draft.customerId} onChange={(event) => setDraft({ ...draft, customerId: event.target.value })}><option value="">Select customer</option>{state.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.company || customer.name}</option>)}</select></label>
                  <label>Status<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as InvoiceStatus })}>{STATUS_OPTIONS.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label>
                  <label>Issue date<input type="date" value={draft.issueDate} onChange={(event) => setDraft({ ...draft, issueDate: event.target.value })} /></label>
                  <label>Due date<input type="date" value={draft.dueDate} onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })} /></label>
                </div>
              </div>

              <div className="form-band">
                <SectionHeading number="2" title="Line items" description="Add saved services or enter a one-time charge." />
                <div className="line-toolbar">
                  <label>Saved item<select value={selectedItemId} onChange={(event) => setSelectedItemId(event.target.value)}><option value="">Choose an item</option>{state.items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                  <div className="line-toolbar-actions"><button className="secondary-button" type="button" disabled={!selectedItemId} onClick={addSelectedItem}><Plus size={17} />Add saved</button><button className="secondary-button" type="button" onClick={addBlankLine}><Plus size={17} />Custom line</button></div>
                </div>
                <div className="line-editor">
                  {draft.lineItems.map((line) => <div className="line-row" key={line.id}>
                    <label className="line-description">Description<input value={line.description} onChange={(event) => updateLine(line.id, { description: event.target.value })} /></label>
                    <label>Qty<input type="number" min="0" step="0.01" value={line.quantity} onChange={(event) => updateLine(line.id, { quantity: Number(event.target.value) })} /></label>
                    <label>Price<input type="number" min="0" step="0.01" value={minorToDollars(line.unitPriceMinor)} onChange={(event) => updateLine(line.id, { unitPriceMinor: dollarsToMinor(event.target.value) })} /></label>
                    <label>Tax %<input type="number" min="0" step="0.01" value={bpsToPercent(line.taxRateBps)} onChange={(event) => updateLine(line.id, { taxRateBps: percentToBps(event.target.value) })} /></label>
                    <label>Discount<input type="number" min="0" step="0.01" value={minorToDollars(line.discountMinor)} onChange={(event) => updateLine(line.id, { discountMinor: dollarsToMinor(event.target.value) })} /></label>
                    <div className="line-total"><span>Total</span><strong>{formatCurrency(line.lineTotalMinor, state.settings.defaultCurrency)}</strong></div>
                    <button className="icon-button danger line-remove" type="button" title="Remove line" aria-label="Remove line item" onClick={() => setDraft((current) => ({ ...current, lineItems: current.lineItems.filter((entry) => entry.id !== line.id) }))}><Trash2 size={17} /></button>
                  </div>)}
                  {!draft.lineItems.length && <EmptyState title="No line items yet" description="Add a saved item or create a custom line." compact />}
                </div>
              </div>

              <div className="form-band">
                <SectionHeading number="3" title="Notes and terms" description="Add payment instructions or a short message for your customer." />
                <div className="field-grid two"><label>Notes<textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label><label>Terms<textarea value={draft.terms} onChange={(event) => setDraft({ ...draft, terms: event.target.value })} /></label></div>
              </div>
              <div className="builder-actions"><button className="secondary-button" disabled={pendingAction === "invoice"} type="button" onClick={() => setView("dashboard")}>Cancel</button><button className="secondary-button" disabled={isBusy} type="button" onClick={() => saveInvoice(false)}>{pendingAction === "invoice" ? <LoadingLabel>Saving...</LoadingLabel> : "Save invoice"}</button><button className="primary-button" disabled={isBusy} type="button" onClick={() => saveInvoice(true)}>{pendingAction === "invoice" ? <LoadingLabel>Preparing PDF...</LoadingLabel> : <><Download size={18} />Save and download</>}</button></div>
            </div>
            <aside className="preview-pane">
              <InvoiceDocument invoice={{ id: "preview", invoiceNumber: `${state.settings.invoicePrefix}-${state.settings.nextInvoiceNumber}`, currency: state.settings.defaultCurrency, createdAt: "", updatedAt: "", ...draft, ...totals }} customer={customersById[draft.customerId]} settings={state.settings} />
            </aside>
          </section>
        )}

        {view === "customers" && (
          <section className="directory-grid view-enter">
            <form className="editor-panel" onSubmit={submitCustomer}>
              <SectionHeading title={editingCustomerId ? "Edit customer" : "Add customer"} description="Contact details are reused whenever you create an invoice." />
              <div className="field-grid two"><label>Name<input value={customerForm.name} onChange={(event) => setCustomerForm({ ...customerForm, name: event.target.value })} /></label><label>Company<input value={customerForm.company} onChange={(event) => setCustomerForm({ ...customerForm, company: event.target.value })} /></label></div>
              <label>Email<input type="email" value={customerForm.email} onChange={(event) => setCustomerForm({ ...customerForm, email: event.target.value })} /></label>
              <label>Phone<input value={customerForm.phone} onChange={(event) => setCustomerForm({ ...customerForm, phone: event.target.value })} /></label>
              <label>Billing address<textarea value={customerForm.billingAddress} onChange={(event) => setCustomerForm({ ...customerForm, billingAddress: event.target.value })} /></label>
              <label>Notes<textarea value={customerForm.notes} onChange={(event) => setCustomerForm({ ...customerForm, notes: event.target.value })} /></label>
              <div className="form-actions">{editingCustomerId && <button type="button" className="secondary-button" disabled={pendingAction === "customer"} onClick={() => { setEditingCustomerId(null); setCustomerForm(emptyCustomerForm); }}>Cancel</button>}<button className="primary-button" disabled={isBusy} type="submit">{pendingAction === "customer" ? <LoadingLabel>Saving...</LoadingLabel> : editingCustomerId ? "Save changes" : "Add customer"}</button></div>
            </form>
            <div className="directory-list">{state.customers.map((customer) => <article className="directory-row" key={customer.id}><span className="row-icon"><UserRound size={20} /></span><div><strong>{customer.company || customer.name}</strong><span>{customer.company ? customer.name : customer.email}</span><span>{customer.company ? customer.email : customer.phone}</span></div><button className="icon-button" type="button" title="Edit customer" aria-label={`Edit ${customer.company || customer.name}`} onClick={() => editCustomer(customer)}><Pencil size={17} /></button></article>)}{!state.customers.length && <EmptyState title="No customers yet" description="Add your first customer using the form." />}</div>
          </section>
        )}

        {view === "items" && (
          <section className="directory-grid view-enter">
            <form className="editor-panel" onSubmit={submitItem}>
              <SectionHeading title={editingItemId ? "Edit item" : "Add item"} description="Save products and services to add them to invoices in one click." />
              <label>Name<input value={itemForm.name} onChange={(event) => setItemForm({ ...itemForm, name: event.target.value })} /></label>
              <label>Description<textarea value={itemForm.description} onChange={(event) => setItemForm({ ...itemForm, description: event.target.value })} /></label>
              <div className="field-grid three"><label>Price<input type="number" min="0" step="0.01" value={itemForm.unitPrice} onChange={(event) => setItemForm({ ...itemForm, unitPrice: event.target.value })} /></label><label>Tax %<input type="number" min="0" step="0.01" value={itemForm.taxRate} onChange={(event) => setItemForm({ ...itemForm, taxRate: event.target.value })} /></label><label>Default qty<input type="number" min="0" step="0.01" value={itemForm.defaultQuantity} onChange={(event) => setItemForm({ ...itemForm, defaultQuantity: Number(event.target.value) })} /></label></div>
              <div className="form-actions">{editingItemId && <button type="button" className="secondary-button" disabled={pendingAction === "item"} onClick={() => { setEditingItemId(null); setItemForm(emptyItemForm); }}>Cancel</button>}<button className="primary-button" disabled={isBusy} type="submit">{pendingAction === "item" ? <LoadingLabel>Saving...</LoadingLabel> : editingItemId ? "Save changes" : "Add item"}</button></div>
            </form>
            <div className="directory-list">
              {state.items.map((item) => (
                <article className="directory-row" key={item.id}>
                  <span className="row-icon"><Package size={20} /></span>
                  <div>
                    <strong>{item.name}</strong>
                    <span>{item.description}</span>
                    <span>{formatCurrency(item.unitPriceMinor, state.settings.defaultCurrency)} | Tax {bpsToPercent(item.taxRateBps)}%</span>
                  </div>
                  <button className="icon-button" type="button" title="Edit item" aria-label={`Edit ${item.name}`} onClick={() => editItem(item)}><Pencil size={17} /></button>
                </article>
              ))}
              {!state.items.length && <EmptyState title="No saved items yet" description="Add a reusable product or service using the form." />}
            </div>
          </section>
        )}

        {view === "settings" && (
          <form className="settings-grid view-enter" onSubmit={submitSettings}>
            <div className="editor-panel"><SectionHeading title="Business details" description="Shown in the header of every generated invoice." /><label>Business name<input required value={settingsForm.businessName} onChange={(event) => setSettingsForm({ ...settingsForm, businessName: event.target.value })} /></label><label>Billing email<input required type="email" value={settingsForm.businessEmail} onChange={(event) => setSettingsForm({ ...settingsForm, businessEmail: event.target.value })} /></label><label>Phone<input value={settingsForm.businessPhone} onChange={(event) => setSettingsForm({ ...settingsForm, businessPhone: event.target.value })} /></label><label>Address<textarea value={settingsForm.businessAddress} onChange={(event) => setSettingsForm({ ...settingsForm, businessAddress: event.target.value })} /></label></div>
            <div className="editor-panel"><SectionHeading title="Invoice defaults" description="Applied automatically when you start a new invoice." /><div className="field-grid two"><label>Invoice prefix<input value={settingsForm.invoicePrefix} onChange={(event) => setSettingsForm({ ...settingsForm, invoicePrefix: event.target.value.toUpperCase() })} /></label><label>Next number<input type="number" min="1" value={settingsForm.nextInvoiceNumber} onChange={(event) => setSettingsForm({ ...settingsForm, nextInvoiceNumber: Number(event.target.value) || 1 })} /></label></div><div className="field-grid two"><label>Currency<select value={settingsForm.defaultCurrency} onChange={(event) => setSettingsForm({ ...settingsForm, defaultCurrency: event.target.value })}><option value="USD">USD</option><option value="CAD">CAD</option><option value="EUR">EUR</option><option value="GBP">GBP</option><option value="AUD">AUD</option></select></label><label>Brand color<input type="color" value={settingsForm.brandColor} onChange={(event) => setSettingsForm({ ...settingsForm, brandColor: event.target.value })} /></label></div><label>Default notes<textarea value={settingsForm.defaultNotes} onChange={(event) => setSettingsForm({ ...settingsForm, defaultNotes: event.target.value })} /></label><label>Default terms<textarea value={settingsForm.defaultTerms} onChange={(event) => setSettingsForm({ ...settingsForm, defaultTerms: event.target.value })} /></label></div>
            <div className="settings-actions"><button className="primary-button" disabled={isBusy} type="submit">{pendingAction === "settings" ? <LoadingLabel>Saving settings...</LoadingLabel> : "Save settings"}</button></div>
          </form>
        )}
      </main>
      <ToastRegion toast={toast} onDismiss={() => setToast(null)} />
      <ConfirmDialog
        open={Boolean(invoiceToDelete)}
        title="Delete this invoice?"
        description={`${invoiceToDelete?.invoiceNumber ?? "This invoice"} will be permanently removed. This action cannot be undone.`}
        confirmLabel="Delete invoice"
        busy={pendingAction === "delete"}
        onCancel={() => pendingAction !== "delete" && setInvoiceToDelete(null)}
        onConfirm={() => void removeInvoice()}
      />
    </div>
  );
}


function mapById<T extends { id: string }>(entries: T[]): Record<string, T> {
  return Object.fromEntries(entries.map((entry) => [entry.id, entry]));
}


function formatDate(value: string): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}
