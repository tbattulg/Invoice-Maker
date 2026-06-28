"use client";

import {
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  ClipboardList,
  FileCheck2,
  Pencil,
  Plus,
  Repeat2,
  Search,
  Trash2
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { saveEstimate, saveRecurringTemplate } from "@/app/actions";
import {
  addDaysInput,
  bpsToPercent,
  calculateInvoiceTotals,
  calculateLineItem,
  createId,
  discountMinorFromPercent,
  discountRateBps,
  dollarsToMinor,
  formatCurrency,
  minorToDollars,
  percentToBps,
  todayInput
} from "@/features/invoices/calculations";
import type {
  Customer,
  Estimate,
  EstimateStatus,
  InvoiceCreatorState,
  InvoiceLineItem,
  Item,
  RecurringFrequency,
  RecurringTemplate
} from "@/features/invoices/types";
import {
  EmptyState,
  LoadingLabel,
  MetricCard,
  SectionHeading,
  type ToastMessage
} from "@/components/workspace-ui";

const ESTIMATE_STATUS_OPTIONS: EstimateStatus[] = [
  "draft",
  "sent",
  "accepted",
  "rejected",
  "expired"
];

const RECURRING_FREQUENCY_OPTIONS: RecurringFrequency[] = [
  "weekly",
  "monthly",
  "quarterly",
  "yearly"
];

const CURRENCY_OPTIONS = ["USD", "CAD", "EUR", "GBP", "AUD"];

type EstimateStatusFilter = "all" | EstimateStatus;
type RecurringFilter = "all" | "active" | "paused";
type ToastFn = (tone: ToastMessage["tone"], title: string, message?: string) => void;

type EstimateDraft = Pick<
  Estimate,
  | "customerId"
  | "estimateNumber"
  | "issueDate"
  | "expiresDate"
  | "status"
  | "currency"
  | "notes"
  | "terms"
  | "lineItems"
> & { id?: string };

type RecurringDraft = Pick<
  RecurringTemplate,
  | "customerId"
  | "name"
  | "frequency"
  | "interval"
  | "nextIssueDate"
  | "active"
  | "currency"
  | "notes"
  | "terms"
  | "lineItems"
> & { id?: string };

type WorkspaceDocsProps = {
  state: InvoiceCreatorState;
  customersById: Record<string, Customer>;
  onStateChange: (nextState: InvoiceCreatorState) => void;
  showToast: ToastFn;
  showError: (error: unknown, fallback?: string) => void;
  onAddCustomer: () => void;
};

export function EstimateWorkspaceView({
  state,
  customersById,
  onStateChange,
  showToast,
  showError,
  onAddCustomer
}: WorkspaceDocsProps) {
  const [mode, setMode] = useState<"list" | "form">("list");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<EstimateStatusFilter>("all");
  const [selectedEstimateId, setSelectedEstimateId] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [pending, setPending] = useState(false);
  const [draft, setDraft] = useState<EstimateDraft>(() => createBlankEstimateDraft(state));

  const totals = useMemo(() => calculateInvoiceTotals(draft.lineItems), [draft.lineItems]);
  const filteredEstimates = useMemo(() => {
    const search = query.trim().toLowerCase();
    return [...state.estimates]
      .filter((estimate) => statusFilter === "all" || estimate.status === statusFilter)
      .filter((estimate) => {
        if (!search) return true;
        const customer = customersById[estimate.customerId];
        return [
          estimate.estimateNumber,
          customer?.name,
          customer?.company,
          estimate.issueDate,
          estimate.expiresDate,
          labelFromKey(estimate.status),
          formatCurrency(estimate.totalMinor, estimate.currency)
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(search));
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [customersById, query, state.estimates, statusFilter]);

  const selectedEstimate =
    filteredEstimates.find((estimate) => estimate.id === selectedEstimateId) ??
    filteredEstimates[0] ??
    null;

  const metrics = useMemo(() => {
    const openStatuses = new Set<EstimateStatus>(["draft", "sent"]);
    return {
      total: state.estimates.length,
      open: state.estimates.filter((estimate) => openStatuses.has(estimate.status)).length,
      accepted: state.estimates.filter((estimate) => estimate.status === "accepted").length,
      acceptedTotal: state.estimates
        .filter((estimate) => estimate.status === "accepted")
        .reduce((sum, estimate) => sum + estimate.totalMinor, 0)
    };
  }, [state.estimates]);

  function openNewEstimate() {
    if (!state.customers.length) {
      showToast("error", "Add a customer first", "Estimates need a customer before they can be saved.");
      onAddCustomer();
      return;
    }
    setDraft(createBlankEstimateDraft(state));
    setSelectedItemId("");
    setMode("form");
  }

  function editEstimate(estimate: Estimate) {
    setDraft(createEstimateDraft(estimate));
    setSelectedEstimateId(estimate.id);
    setSelectedItemId("");
    setMode("form");
  }

  async function submitEstimate(event: FormEvent) {
    event.preventDefault();
    if (!draft.customerId) {
      showToast("error", "Customer required", "Select a customer before saving the estimate.");
      return;
    }
    if (!draft.estimateNumber.trim()) {
      showToast("error", "Estimate number required", "Give this estimate a unique number.");
      return;
    }
    if (!hasValidLines(draft.lineItems)) {
      showToast("error", "Line item required", "Add at least one line item with a description.");
      return;
    }

    setPending(true);
    try {
      const savedNumber = draft.estimateNumber.trim();
      const nextState = await saveEstimate({
        ...draft,
        estimateNumber: savedNumber,
        currency: draft.currency || state.settings.defaultCurrency,
        ...totals
      });
      onStateChange(nextState);
      const savedEstimate = nextState.estimates.find((estimate) =>
        draft.id ? estimate.id === draft.id : estimate.estimateNumber === savedNumber
      );
      setSelectedEstimateId(savedEstimate?.id ?? "");
      setDraft(createBlankEstimateDraft(nextState));
      setMode("list");
      showToast("success", draft.id ? "Estimate updated" : "Estimate saved", `${savedNumber} is ready.`);
    } catch (error) {
      showError(error);
    } finally {
      setPending(false);
    }
  }

  function addSelectedItem() {
    const item = state.items.find((entry) => entry.id === selectedItemId);
    if (!item) return;
    setDraft((current) => ({
      ...current,
      lineItems: [...current.lineItems, createLineFromItem(item)]
    }));
  }

  function addBlankLine() {
    setDraft((current) => ({ ...current, lineItems: [...current.lineItems, createBlankLine()] }));
  }

  function updateLine(lineId: string, patch: Partial<InvoiceLineItem>) {
    setDraft((current) => ({ ...current, lineItems: patchLineItems(current.lineItems, lineId, patch) }));
  }

  if (mode === "form") {
    return (
      <section className="builder-grid view-enter">
        <form className="builder-form" onSubmit={submitEstimate}>
          {!state.customers.length && (
            <div className="inline-notice">
              <CircleAlert size={19} />
              <div><strong>A customer is required</strong><span>Add a billing contact before saving this estimate.</span></div>
              <button className="secondary-button" type="button" onClick={onAddCustomer}>Add customer</button>
            </div>
          )}

          <div className="form-band">
            <SectionHeading
              number="1"
              title={draft.id ? "Edit estimate" : "Estimate details"}
              description="Set the customer, estimate number, dates, and status."
            />
            <div className="field-grid two">
              <label>Customer<select required value={draft.customerId} onChange={(event) => setDraft({ ...draft, customerId: event.target.value })}><option value="">Select customer</option>{state.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.company || customer.name}</option>)}</select></label>
              <label>Estimate number<input required value={draft.estimateNumber} onChange={(event) => setDraft({ ...draft, estimateNumber: event.target.value })} /></label>
              <label>Status<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as EstimateStatus })}>{ESTIMATE_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{labelFromKey(status)}</option>)}</select></label>
              <label>Currency<select value={draft.currency} onChange={(event) => setDraft({ ...draft, currency: event.target.value })}>{CURRENCY_OPTIONS.map((currency) => <option key={currency} value={currency}>{currency}</option>)}</select></label>
              <label>Issue date<input type="date" value={draft.issueDate} onChange={(event) => setDraft({ ...draft, issueDate: event.target.value })} /></label>
              <label>Expires<input type="date" value={draft.expiresDate} onChange={(event) => setDraft({ ...draft, expiresDate: event.target.value })} /></label>
            </div>
          </div>

          <div className="form-band">
            <SectionHeading number="2" title="Line items" description="Add saved services or enter a custom estimate line." />
            <LineItemsEditor
              currency={draft.currency}
              items={state.items}
              lineItems={draft.lineItems}
              selectedItemId={selectedItemId}
              onAddBlankLine={addBlankLine}
              onAddSelectedItem={addSelectedItem}
              onRemoveLine={(lineId) => setDraft((current) => ({ ...current, lineItems: current.lineItems.filter((line) => line.id !== lineId) }))}
              onSelectedItemChange={setSelectedItemId}
              onUpdateLine={updateLine}
            />
          </div>

          <div className="form-band">
            <SectionHeading number="3" title="Notes and terms" description="Add scope details, approval terms, or next steps." />
            <div className="field-grid two">
              <label>Notes<textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>
              <label>Terms<textarea value={draft.terms} onChange={(event) => setDraft({ ...draft, terms: event.target.value })} /></label>
            </div>
          </div>

          <div className="builder-actions">
            <button className="secondary-button" disabled={pending} type="button" onClick={() => setMode("list")}>Cancel</button>
            <button className="primary-button" disabled={pending} type="submit">{pending ? <LoadingLabel>Saving...</LoadingLabel> : draft.id ? "Save changes" : "Save estimate"}</button>
          </div>
        </form>

        <aside className="preview-pane">
          <DocumentSummary
            customer={customersById[draft.customerId]}
            currency={draft.currency}
            dateLabel="Expires"
            dueDate={draft.expiresDate}
            issueDate={draft.issueDate}
            lineItems={draft.lineItems}
            notes={draft.notes}
            status={labelFromKey(draft.status)}
            terms={draft.terms}
            title={draft.estimateNumber || "New estimate"}
            total={formatCurrency(totals.totalMinor, draft.currency)}
          />
        </aside>
      </section>
    );
  }

  return (
    <section className="records-grid view-enter">
      <div className="records-main">
        <div className="metric-grid">
          <MetricCard icon={<ClipboardList size={20} />} label="All estimates" value={String(metrics.total)} />
          <MetricCard icon={<FileCheck2 size={20} />} label="Open" value={String(metrics.open)} />
          <MetricCard icon={<CheckCircle2 size={20} />} label="Accepted" tone="success" value={String(metrics.accepted)} />
          <MetricCard icon={<CheckCircle2 size={20} />} label="Accepted total" tone="success" value={formatCurrency(metrics.acceptedTotal, state.settings.defaultCurrency)} />
        </div>

        <div className="toolbar">
          <label className="search-field"><Search size={18} /><span className="sr-only">Search estimates</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by estimate, customer, date, or amount" /></label>
          <label className="filter-field"><span className="sr-only">Filter estimates by status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as EstimateStatusFilter)}><option value="all">All statuses</option>{ESTIMATE_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{labelFromKey(status)}</option>)}</select></label>
          <button className="primary-button" type="button" onClick={openNewEstimate}><Plus size={18} />New estimate</button>
        </div>

        <div className="record-list">
          {filteredEstimates.map((estimate) => {
            const customer = customersById[estimate.customerId];
            return (
              <button
                aria-pressed={selectedEstimate?.id === estimate.id}
                className={`record-card${selectedEstimate?.id === estimate.id ? " selected" : ""}`}
                key={estimate.id}
                type="button"
                onClick={() => setSelectedEstimateId(estimate.id)}
              >
                <span className="row-icon"><ClipboardList size={20} /></span>
                <div className="record-card-copy">
                  <strong>{estimate.estimateNumber}</strong>
                  <span>{customer?.company || customer?.name || "Customer"}</span>
                  <span>Issued {formatDate(estimate.issueDate)} | Expires {formatDate(estimate.expiresDate)}</span>
                </div>
                <div className="record-card-meta">
                  <strong>{formatCurrency(estimate.totalMinor, estimate.currency)}</strong>
                  <span className={`status-pill status-${estimate.status}`}>{labelFromKey(estimate.status)}</span>
                </div>
              </button>
            );
          })}
          {!filteredEstimates.length && (
            <EmptyState
              title={state.estimates.length ? "No matching estimates" : "No estimates yet"}
              description={state.estimates.length ? "Try a different search term or status filter." : "Create reusable estimate records from the same workspace data."}
              action={!state.estimates.length && <button className="primary-button" type="button" onClick={openNewEstimate}><Plus size={18} />New estimate</button>}
            />
          )}
        </div>
      </div>

      <aside className="detail-panel">
        {selectedEstimate ? (
          <>
            <div className="detail-panel-header">
              <div>
                <span className="eyebrow">Estimate detail</span>
                <h2>{selectedEstimate.estimateNumber}</h2>
                <p>{customersById[selectedEstimate.customerId]?.company || customersById[selectedEstimate.customerId]?.name || "Customer"}</p>
              </div>
              <button className="secondary-button" type="button" onClick={() => editEstimate(selectedEstimate)}><Pencil size={17} />Edit</button>
            </div>
            <DetailStats
              customer={customersById[selectedEstimate.customerId]}
              dateLabel="Expires"
              dueDate={selectedEstimate.expiresDate}
              issueDate={selectedEstimate.issueDate}
              status={labelFromKey(selectedEstimate.status)}
              statusClass={selectedEstimate.status}
              total={formatCurrency(selectedEstimate.totalMinor, selectedEstimate.currency)}
            />
            <DetailLines currency={selectedEstimate.currency} lineItems={selectedEstimate.lineItems} />
            <DetailNotes notes={selectedEstimate.notes} terms={selectedEstimate.terms} />
          </>
        ) : (
          <EmptyState title="Select an estimate" description="Estimate details will appear here." compact />
        )}
      </aside>
    </section>
  );
}

export function RecurringTemplatesWorkspaceView({
  state,
  customersById,
  onStateChange,
  showToast,
  showError,
  onAddCustomer
}: WorkspaceDocsProps) {
  const [mode, setMode] = useState<"list" | "form">("list");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<RecurringFilter>("all");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [pending, setPending] = useState(false);
  const [draft, setDraft] = useState<RecurringDraft>(() => createBlankRecurringDraft(state));

  const totals = useMemo(() => calculateInvoiceTotals(draft.lineItems), [draft.lineItems]);
  const filteredTemplates = useMemo(() => {
    const search = query.trim().toLowerCase();
    return [...state.recurringTemplates]
      .filter((template) => filter === "all" || (filter === "active" ? template.active : !template.active))
      .filter((template) => {
        if (!search) return true;
        const customer = customersById[template.customerId];
        return [
          template.name,
          customer?.name,
          customer?.company,
          formatSchedule(template.frequency, template.interval),
          template.nextIssueDate,
          template.active ? "active" : "paused",
          formatCurrency(calculateInvoiceTotals(template.lineItems).totalMinor, template.currency)
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(search));
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [customersById, filter, query, state.recurringTemplates]);

  const selectedTemplate =
    filteredTemplates.find((template) => template.id === selectedTemplateId) ??
    filteredTemplates[0] ??
    null;

  const metrics = useMemo(() => {
    const now = new Date(`${todayInput()}T00:00:00`);
    const soon = new Date(now);
    soon.setDate(soon.getDate() + 30);
    return {
      total: state.recurringTemplates.length,
      active: state.recurringTemplates.filter((template) => template.active).length,
      paused: state.recurringTemplates.filter((template) => !template.active).length,
      dueSoon: state.recurringTemplates.filter((template) => {
        const nextDate = new Date(`${template.nextIssueDate}T00:00:00`);
        return template.active && nextDate <= soon;
      }).length
    };
  }, [state.recurringTemplates]);

  function openNewTemplate() {
    if (!state.customers.length) {
      showToast("error", "Add a customer first", "Recurring templates need a customer before they can be saved.");
      onAddCustomer();
      return;
    }
    setDraft(createBlankRecurringDraft(state));
    setSelectedItemId("");
    setMode("form");
  }

  function editTemplate(template: RecurringTemplate) {
    setDraft(createRecurringDraft(template));
    setSelectedTemplateId(template.id);
    setSelectedItemId("");
    setMode("form");
  }

  async function submitTemplate(event: FormEvent) {
    event.preventDefault();
    if (!draft.customerId) {
      showToast("error", "Customer required", "Select a customer before saving the recurring template.");
      return;
    }
    if (!draft.name.trim()) {
      showToast("error", "Template name required", "Give this recurring template a clear name.");
      return;
    }
    if (!hasValidLines(draft.lineItems)) {
      showToast("error", "Line item required", "Add at least one line item with a description.");
      return;
    }

    setPending(true);
    try {
      const savedName = draft.name.trim();
      const nextState = await saveRecurringTemplate({
        ...draft,
        name: savedName,
        interval: Math.max(Math.round(Number(draft.interval) || 1), 1),
        currency: draft.currency || state.settings.defaultCurrency
      });
      onStateChange(nextState);
      const savedTemplate = nextState.recurringTemplates.find((template) =>
        draft.id ? template.id === draft.id : template.name === savedName
      );
      setSelectedTemplateId(savedTemplate?.id ?? "");
      setDraft(createBlankRecurringDraft(nextState));
      setMode("list");
      showToast("success", draft.id ? "Template updated" : "Template saved", `${savedName} is ready.`);
    } catch (error) {
      showError(error);
    } finally {
      setPending(false);
    }
  }

  function addSelectedItem() {
    const item = state.items.find((entry) => entry.id === selectedItemId);
    if (!item) return;
    setDraft((current) => ({
      ...current,
      lineItems: [...current.lineItems, createLineFromItem(item)]
    }));
  }

  function addBlankLine() {
    setDraft((current) => ({ ...current, lineItems: [...current.lineItems, createBlankLine()] }));
  }

  function updateLine(lineId: string, patch: Partial<InvoiceLineItem>) {
    setDraft((current) => ({ ...current, lineItems: patchLineItems(current.lineItems, lineId, patch) }));
  }

  if (mode === "form") {
    return (
      <section className="builder-grid view-enter">
        <form className="builder-form" onSubmit={submitTemplate}>
          {!state.customers.length && (
            <div className="inline-notice">
              <CircleAlert size={19} />
              <div><strong>A customer is required</strong><span>Add a billing contact before saving this recurring template.</span></div>
              <button className="secondary-button" type="button" onClick={onAddCustomer}>Add customer</button>
            </div>
          )}

          <div className="form-band">
            <SectionHeading
              number="1"
              title={draft.id ? "Edit recurring template" : "Recurring template details"}
              description="Define the customer, cadence, next issue date, and active state."
            />
            <div className="field-grid two">
              <label>Template name<input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
              <label>Customer<select required value={draft.customerId} onChange={(event) => setDraft({ ...draft, customerId: event.target.value })}><option value="">Select customer</option>{state.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.company || customer.name}</option>)}</select></label>
              <label>Frequency<select value={draft.frequency} onChange={(event) => setDraft({ ...draft, frequency: event.target.value as RecurringFrequency })}>{RECURRING_FREQUENCY_OPTIONS.map((frequency) => <option key={frequency} value={frequency}>{labelFromKey(frequency)}</option>)}</select></label>
              <label>Every<input type="number" min="1" value={draft.interval} onChange={(event) => setDraft({ ...draft, interval: Math.max(Number(event.target.value) || 1, 1) })} /></label>
              <label>Next issue date<input type="date" value={draft.nextIssueDate} onChange={(event) => setDraft({ ...draft, nextIssueDate: event.target.value })} /></label>
              <label>Currency<select value={draft.currency} onChange={(event) => setDraft({ ...draft, currency: event.target.value })}>{CURRENCY_OPTIONS.map((currency) => <option key={currency} value={currency}>{currency}</option>)}</select></label>
            </div>
            <label className="checkbox-field"><input checked={draft.active} type="checkbox" onChange={(event) => setDraft({ ...draft, active: event.target.checked })} /><span>Template is active</span></label>
          </div>

          <div className="form-band">
            <SectionHeading number="2" title="Invoice lines" description="These lines will be reused whenever this template is issued." />
            <LineItemsEditor
              currency={draft.currency}
              items={state.items}
              lineItems={draft.lineItems}
              selectedItemId={selectedItemId}
              onAddBlankLine={addBlankLine}
              onAddSelectedItem={addSelectedItem}
              onRemoveLine={(lineId) => setDraft((current) => ({ ...current, lineItems: current.lineItems.filter((line) => line.id !== lineId) }))}
              onSelectedItemChange={setSelectedItemId}
              onUpdateLine={updateLine}
            />
          </div>

          <div className="form-band">
            <SectionHeading number="3" title="Notes and terms" description="Set the default customer-facing message for generated invoices." />
            <div className="field-grid two">
              <label>Notes<textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>
              <label>Terms<textarea value={draft.terms} onChange={(event) => setDraft({ ...draft, terms: event.target.value })} /></label>
            </div>
          </div>

          <div className="builder-actions">
            <button className="secondary-button" disabled={pending} type="button" onClick={() => setMode("list")}>Cancel</button>
            <button className="primary-button" disabled={pending} type="submit">{pending ? <LoadingLabel>Saving...</LoadingLabel> : draft.id ? "Save changes" : "Save template"}</button>
          </div>
        </form>

        <aside className="preview-pane">
          <DocumentSummary
            customer={customersById[draft.customerId]}
            currency={draft.currency}
            dateLabel="Next issue"
            dueDate={draft.nextIssueDate}
            issueDate={formatSchedule(draft.frequency, draft.interval)}
            issueLabel="Schedule"
            lineItems={draft.lineItems}
            notes={draft.notes}
            status={draft.active ? "Active" : "Paused"}
            statusClass={draft.active ? "active" : "paused"}
            terms={draft.terms}
            title={draft.name || "New template"}
            total={formatCurrency(totals.totalMinor, draft.currency)}
          />
        </aside>
      </section>
    );
  }

  return (
    <section className="records-grid view-enter">
      <div className="records-main">
        <div className="metric-grid">
          <MetricCard icon={<Repeat2 size={20} />} label="Templates" value={String(metrics.total)} />
          <MetricCard icon={<CheckCircle2 size={20} />} label="Active" tone="success" value={String(metrics.active)} />
          <MetricCard icon={<CircleAlert size={20} />} label="Paused" tone="warning" value={String(metrics.paused)} />
          <MetricCard icon={<CalendarClock size={20} />} label="Due in 30 days" value={String(metrics.dueSoon)} />
        </div>

        <div className="toolbar">
          <label className="search-field"><Search size={18} /><span className="sr-only">Search recurring templates</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by template, customer, cadence, or date" /></label>
          <label className="filter-field"><span className="sr-only">Filter recurring templates</span><select value={filter} onChange={(event) => setFilter(event.target.value as RecurringFilter)}><option value="all">All templates</option><option value="active">Active</option><option value="paused">Paused</option></select></label>
          <button className="primary-button" type="button" onClick={openNewTemplate}><Plus size={18} />New template</button>
        </div>

        <div className="record-list">
          {filteredTemplates.map((template) => {
            const customer = customersById[template.customerId];
            const templateTotal = calculateInvoiceTotals(template.lineItems).totalMinor;
            return (
              <button
                aria-pressed={selectedTemplate?.id === template.id}
                className={`record-card${selectedTemplate?.id === template.id ? " selected" : ""}`}
                key={template.id}
                type="button"
                onClick={() => setSelectedTemplateId(template.id)}
              >
                <span className="row-icon"><Repeat2 size={20} /></span>
                <div className="record-card-copy">
                  <strong>{template.name}</strong>
                  <span>{customer?.company || customer?.name || "Customer"}</span>
                  <span>{formatSchedule(template.frequency, template.interval)} | Next {formatDate(template.nextIssueDate)}</span>
                </div>
                <div className="record-card-meta">
                  <strong>{formatCurrency(templateTotal, template.currency)}</strong>
                  <span className={`status-pill status-${template.active ? "active" : "paused"}`}>{template.active ? "Active" : "Paused"}</span>
                </div>
              </button>
            );
          })}
          {!filteredTemplates.length && (
            <EmptyState
              title={state.recurringTemplates.length ? "No matching templates" : "No recurring templates yet"}
              description={state.recurringTemplates.length ? "Try a different search term or template filter." : "Create reusable templates for invoices you send on a schedule."}
              action={!state.recurringTemplates.length && <button className="primary-button" type="button" onClick={openNewTemplate}><Plus size={18} />New template</button>}
            />
          )}
        </div>
      </div>

      <aside className="detail-panel">
        {selectedTemplate ? (
          <>
            <div className="detail-panel-header">
              <div>
                <span className="eyebrow">Recurring detail</span>
                <h2>{selectedTemplate.name}</h2>
                <p>{customersById[selectedTemplate.customerId]?.company || customersById[selectedTemplate.customerId]?.name || "Customer"}</p>
              </div>
              <button className="secondary-button" type="button" onClick={() => editTemplate(selectedTemplate)}><Pencil size={17} />Edit</button>
            </div>
            <DetailStats
              customer={customersById[selectedTemplate.customerId]}
              dateLabel="Next issue"
              dueDate={selectedTemplate.nextIssueDate}
              issueDate={formatSchedule(selectedTemplate.frequency, selectedTemplate.interval)}
              issueLabel="Schedule"
              status={selectedTemplate.active ? "Active" : "Paused"}
              statusClass={selectedTemplate.active ? "active" : "paused"}
              total={formatCurrency(calculateInvoiceTotals(selectedTemplate.lineItems).totalMinor, selectedTemplate.currency)}
            />
            <DetailLines currency={selectedTemplate.currency} lineItems={selectedTemplate.lineItems} />
            <DetailNotes notes={selectedTemplate.notes} terms={selectedTemplate.terms} />
          </>
        ) : (
          <EmptyState title="Select a template" description="Recurring template details will appear here." compact />
        )}
      </aside>
    </section>
  );
}

function LineItemsEditor({
  currency,
  items,
  lineItems,
  selectedItemId,
  onSelectedItemChange,
  onAddSelectedItem,
  onAddBlankLine,
  onUpdateLine,
  onRemoveLine
}: {
  currency: string;
  items: Item[];
  lineItems: InvoiceLineItem[];
  selectedItemId: string;
  onSelectedItemChange: (itemId: string) => void;
  onAddSelectedItem: () => void;
  onAddBlankLine: () => void;
  onUpdateLine: (lineId: string, patch: Partial<InvoiceLineItem>) => void;
  onRemoveLine: (lineId: string) => void;
}) {
  return (
    <>
      <div className="line-toolbar">
        <label>Saved item<select value={selectedItemId} onChange={(event) => onSelectedItemChange(event.target.value)}><option value="">Choose an item</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <div className="line-toolbar-actions">
          <button className="secondary-button" type="button" disabled={!selectedItemId} onClick={onAddSelectedItem}><Plus size={17} />Add saved</button>
          <button className="secondary-button" type="button" onClick={onAddBlankLine}><Plus size={17} />Custom line</button>
        </div>
      </div>
      <div className="line-editor">
        {lineItems.map((line) => (
          <div className="line-row" key={line.id}>
            <label className="line-description">Description<input value={line.description} onChange={(event) => onUpdateLine(line.id, { description: event.target.value })} /></label>
            <label>Qty<input type="number" min="0" step="0.01" value={line.quantity} onChange={(event) => onUpdateLine(line.id, { quantity: Number(event.target.value) })} /></label>
            <label>Price<DecimalTextInput value={minorToDollars(line.unitPriceMinor)} onValueChange={(value) => onUpdateLine(line.id, { unitPriceMinor: Math.max(dollarsToMinor(value), 0) })} /></label>
            <label>Tax %<DecimalTextInput value={bpsToPercent(line.taxRateBps)} onValueChange={(value) => onUpdateLine(line.id, { taxRateBps: Math.max(percentToBps(value), 0) })} /></label>
            <label>Discount %<DecimalTextInput value={bpsToPercent(discountRateBps(line.lineSubtotalMinor, line.discountMinor))} onValueChange={(value) => onUpdateLine(line.id, { discountMinor: discountMinorFromPercent(line.lineSubtotalMinor, value) })} /></label>
            <div className="line-total"><span>Total</span><strong>{formatCurrency(line.lineTotalMinor, currency)}</strong></div>
            <button className="icon-button danger line-remove" type="button" title="Remove line" aria-label="Remove line item" onClick={() => onRemoveLine(line.id)}><Trash2 size={17} /></button>
          </div>
        ))}
        {!lineItems.length && <EmptyState title="No line items yet" description="Add a saved item or create a custom line." compact />}
      </div>
    </>
  );
}

function DecimalTextInput({
  value,
  onValueChange
}: {
  value: string;
  onValueChange: (value: string) => void;
}) {
  const [inputValue, setInputValue] = useState(value);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) setInputValue(value);
  }, [isFocused, value]);

  return (
    <input
      inputMode="decimal"
      type="text"
      value={inputValue}
      onBlur={() => setIsFocused(false)}
      onChange={(event) => {
        const nextValue = event.target.value;
        if (!/^\d*(\.\d*)?$/.test(nextValue)) return;
        setInputValue(nextValue);
        onValueChange(nextValue);
      }}
      onFocus={(event) => {
        setIsFocused(true);
        event.currentTarget.select();
      }}
    />
  );
}

function DocumentSummary({
  title,
  customer,
  currency,
  status,
  statusClass,
  issueLabel = "Issued",
  issueDate,
  dateLabel,
  dueDate,
  total,
  lineItems,
  notes,
  terms
}: {
  title: string;
  customer?: Customer;
  currency: string;
  status: string;
  statusClass?: string;
  issueLabel?: string;
  issueDate: string;
  dateLabel: string;
  dueDate: string;
  total: string;
  lineItems: InvoiceLineItem[];
  notes: string;
  terms: string;
}) {
  return (
    <section className="detail-panel">
      <div className="detail-panel-header">
        <div>
          <span className="eyebrow">Preview summary</span>
          <h2>{title}</h2>
          <p>{customer?.company || customer?.name || "Customer"}</p>
        </div>
        <span className={`status-pill status-${statusClass ?? status.toLowerCase()}`}>{status}</span>
      </div>
      <DetailStats
        customer={customer}
        dateLabel={dateLabel}
        dueDate={dueDate}
        issueDate={issueDate}
        issueLabel={issueLabel}
        status={status}
        statusClass={statusClass}
        total={total}
      />
      <DetailLines currency={currency} lineItems={lineItems} />
      <DetailNotes notes={notes} terms={terms} />
    </section>
  );
}

function DetailStats({
  customer,
  status,
  statusClass,
  issueLabel = "Issued",
  issueDate,
  dateLabel,
  dueDate,
  total
}: {
  customer?: Customer;
  status: string;
  statusClass?: string;
  issueLabel?: string;
  issueDate: string;
  dateLabel: string;
  dueDate: string;
  total: string;
}) {
  return (
    <div className="detail-summary-grid">
      <div><span>Status</span><strong><span className={`status-pill status-${statusClass ?? status.toLowerCase()}`}>{status}</span></strong></div>
      <div><span>{issueLabel}</span><strong>{looksLikeDate(issueDate) ? formatDate(issueDate) : issueDate}</strong></div>
      <div><span>{dateLabel}</span><strong>{formatDate(dueDate)}</strong></div>
      <div><span>Total</span><strong>{total}</strong></div>
      <div className="detail-wide"><span>Customer</span><strong>{customer?.company || customer?.name || "Customer"}</strong>{customer?.email && <small>{customer.email}</small>}</div>
    </div>
  );
}

function DetailLines({
  currency,
  lineItems,
  showCurrency = true
}: {
  currency: string;
  lineItems: InvoiceLineItem[];
  showCurrency?: boolean;
}) {
  return (
    <div className="detail-line-list">
      <h3>Line items</h3>
      {lineItems.map((line) => (
        <div className="detail-line-row" key={line.id}>
          <div><strong>{line.description || "Line item"}</strong><span>Qty {line.quantity} | Tax {bpsToPercent(line.taxRateBps)}%</span></div>
          <strong>{showCurrency ? formatCurrency(line.lineTotalMinor, currency) : formatCurrency(line.lineTotalMinor)}</strong>
        </div>
      ))}
      {!lineItems.length && <EmptyState title="No line items" compact />}
    </div>
  );
}

function DetailNotes({ notes, terms }: { notes: string; terms: string }) {
  if (!notes && !terms) return null;
  return (
    <div className="detail-notes">
      {notes && <div><strong>Notes</strong><p>{notes}</p></div>}
      {terms && <div><strong>Terms</strong><p>{terms}</p></div>}
    </div>
  );
}

function createBlankEstimateDraft(state: InvoiceCreatorState): EstimateDraft {
  const issueDate = todayInput();
  return {
    customerId: state.customers[0]?.id ?? "",
    estimateNumber: nextEstimateNumber(state.estimates),
    issueDate,
    expiresDate: addDaysInput(issueDate, 30),
    status: "draft",
    currency: state.settings.defaultCurrency,
    notes: state.settings.defaultNotes,
    terms: state.settings.defaultTerms,
    lineItems: [createBlankLine()]
  };
}

function createEstimateDraft(estimate: Estimate): EstimateDraft {
  return {
    id: estimate.id,
    customerId: estimate.customerId,
    estimateNumber: estimate.estimateNumber,
    issueDate: estimate.issueDate,
    expiresDate: estimate.expiresDate,
    status: estimate.status,
    currency: estimate.currency,
    notes: estimate.notes,
    terms: estimate.terms,
    lineItems: estimate.lineItems
  };
}

function createBlankRecurringDraft(state: InvoiceCreatorState): RecurringDraft {
  return {
    customerId: state.customers[0]?.id ?? "",
    name: "",
    frequency: "monthly",
    interval: 1,
    nextIssueDate: addDaysInput(todayInput(), 30),
    active: true,
    currency: state.settings.defaultCurrency,
    notes: state.settings.defaultNotes,
    terms: state.settings.defaultTerms,
    lineItems: [createBlankLine()]
  };
}

function createRecurringDraft(template: RecurringTemplate): RecurringDraft {
  return {
    id: template.id,
    customerId: template.customerId,
    name: template.name,
    frequency: template.frequency,
    interval: template.interval,
    nextIssueDate: template.nextIssueDate,
    active: template.active,
    currency: template.currency,
    notes: template.notes,
    terms: template.terms,
    lineItems: template.lineItems
  };
}

function createBlankLine() {
  return calculateLineItem({
    id: createId("line"),
    description: "",
    quantity: 1,
    unitPriceMinor: 0,
    taxRateBps: 0,
    discountMinor: 0
  });
}

function createLineFromItem(item: Item) {
  return calculateLineItem({
    id: createId("line"),
    itemId: item.id,
    description: item.description || item.name,
    quantity: item.defaultQuantity,
    unitPriceMinor: item.unitPriceMinor,
    taxRateBps: item.taxRateBps,
    discountMinor: 0
  });
}

function patchLineItems(
  lineItems: InvoiceLineItem[],
  lineId: string,
  patch: Partial<InvoiceLineItem>
) {
  return lineItems.map((line) => {
    if (line.id !== lineId) return line;
    const quantity = patch.quantity ?? line.quantity;
    const unitPriceMinor = patch.unitPriceMinor ?? line.unitPriceMinor;
    const lineSubtotalMinor = Math.round(quantity * unitPriceMinor);
    const discountMinor =
      patch.discountMinor ??
      (patch.quantity !== undefined || patch.unitPriceMinor !== undefined
        ? Math.round(
            (lineSubtotalMinor * discountRateBps(line.lineSubtotalMinor, line.discountMinor)) /
              10000
          )
        : line.discountMinor);

    return calculateLineItem({
      ...line,
      ...patch,
      id: line.id,
      description: patch.description ?? line.description,
      quantity,
      unitPriceMinor,
      taxRateBps: patch.taxRateBps ?? line.taxRateBps,
      discountMinor
    });
  });
}

function hasValidLines(lineItems: InvoiceLineItem[]) {
  return lineItems.length > 0 && lineItems.every((line) => line.description.trim());
}

function nextEstimateNumber(estimates: Estimate[]) {
  const usedNumbers = new Set(estimates.map((estimate) => estimate.estimateNumber));
  let nextNumber = estimates.length + 1001;
  let candidate = `EST-${nextNumber}`;
  while (usedNumbers.has(candidate)) {
    nextNumber += 1;
    candidate = `EST-${nextNumber}`;
  }
  return candidate;
}

function formatSchedule(frequency: RecurringFrequency, interval: number) {
  const normalizedInterval = Math.max(Math.round(Number(interval) || 1), 1);
  if (normalizedInterval === 1) return `Every ${frequencyLabel(frequency)}`;
  return `Every ${normalizedInterval} ${pluralFrequency(frequency)}`;
}

function frequencyLabel(frequency: RecurringFrequency) {
  if (frequency === "weekly") return "week";
  if (frequency === "monthly") return "month";
  if (frequency === "quarterly") return "quarter";
  return "year";
}

function pluralFrequency(frequency: RecurringFrequency) {
  if (frequency === "weekly") return "weeks";
  if (frequency === "monthly") return "months";
  if (frequency === "quarterly") return "quarters";
  return "years";
}

function labelFromKey(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function looksLikeDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function formatDate(value: string): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(`${value}T00:00:00`));
}
