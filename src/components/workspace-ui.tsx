"use client";

import { CheckCircle2, FileText, LoaderCircle, TriangleAlert, X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

export type ToastMessage = {
  id: number;
  tone: "success" | "error";
  title: string;
  message?: string;
};

export function LoadingLabel({ children }: { children: ReactNode }) {
  return (
    <span className="loading-label">
      <LoaderCircle aria-hidden="true" className="spinner" size={17} />
      {children}
    </span>
  );
}

export function NavButton({
  active,
  icon,
  children,
  onClick
}: {
  active: boolean;
  icon: ReactNode;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      aria-current={active ? "page" : undefined}
      className={`nav-button${active ? " active" : ""}`}
      type="button"
      onClick={onClick}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}

export function MetricCard({
  icon,
  label,
  value,
  tone = "default"
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone?: "default" | "warning" | "success";
}) {
  return (
    <article className={`metric-tile metric-${tone}`}>
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
    </article>
  );
}

export function SectionHeading({
  number,
  title,
  description
}: {
  number?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="section-heading">
      {number && <span>{number}</span>}
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  compact = false,
  action
}: {
  title: string;
  description?: string;
  compact?: boolean;
  action?: ReactNode;
}) {
  return (
    <div className={`empty-state${compact ? " compact" : ""}`}>
      <span className="empty-icon"><FileText size={22} /></span>
      <strong>{title}</strong>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}

export function ToastRegion({
  toast,
  onDismiss
}: {
  toast: ToastMessage | null;
  onDismiss: () => void;
}) {
  if (!toast) return null;
  const Icon = toast.tone === "success" ? CheckCircle2 : TriangleAlert;
  return (
    <div aria-live="polite" className="toast-region">
      <div className={`toast toast-${toast.tone}`} key={toast.id} role={toast.tone === "error" ? "alert" : "status"}>
        <Icon aria-hidden="true" size={20} />
        <div>
          <strong>{toast.title}</strong>
          {toast.message && <span>{toast.message}</span>}
        </div>
        <button aria-label="Dismiss notification" type="button" onClick={onDismiss}>
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  busy,
  onCancel,
  onConfirm
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelButton.current?.focus();
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onCancel();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [busy, onCancel, open]);

  if (!open) return null;
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <section
        aria-labelledby="confirm-dialog-title"
        aria-modal="true"
        className="confirm-dialog"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <span className="dialog-icon"><TriangleAlert size={22} /></span>
        <div>
          <h2 id="confirm-dialog-title">{title}</h2>
          <p>{description}</p>
        </div>
        <div className="dialog-actions">
          <button ref={cancelButton} className="secondary-button" disabled={busy} type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="danger-button" disabled={busy} type="button" onClick={onConfirm}>
            {busy ? <LoadingLabel>Deleting...</LoadingLabel> : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
