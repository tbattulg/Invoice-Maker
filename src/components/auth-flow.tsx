"use client";

import {
  Building2,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FileText,
  LockKeyhole,
  ShieldCheck
} from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import type { BusinessOnboardingInput } from "@/app/actions";
import { AppLogoMark } from "@/components/app-logo";
import { LoadingLabel } from "@/components/workspace-ui";

export function AuthScreen({
  hasAccounts,
  onCreateAccount,
  onLogin
}: {
  hasAccounts: boolean;
  onCreateAccount: (credentials: { email: string; password: string }) => Promise<void>;
  onLogin: (credentials: { email: string; password: string }) => Promise<void>;
}) {
  const [mode, setMode] = useState<"login" | "create">(hasAccounts ? "login" : "create");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (mode === "create" && password.length < 8) {
      setError("Use at least 8 characters for the password.");
      return;
    }
    if (mode === "create" && password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "login") await onLogin({ email, password });
      else await onCreateAccount({ email, password });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to continue.");
    } finally {
      setBusy(false);
    }
  }

  function changeMode(nextMode: "login" | "create") {
    setMode(nextMode);
    setError("");
    setPassword("");
    setConfirmPassword("");
  }

  return (
    <AuthLayout
      eyebrow="Focused invoicing for small businesses"
      title="Professional invoices, without the accounting-suite overhead."
      description="Keep customers, services, invoices, and business settings organized in one private workspace."
      points={[
        { icon: <ShieldCheck size={20} />, label: "Separate data for every account" },
        { icon: <LockKeyhole size={20} />, label: "Secure, server-managed sign-in" },
        { icon: <FileSpreadsheet size={20} />, label: "PDF invoices and customer exports" }
      ]}
    >
      <form className="auth-form" onSubmit={submit}>
        <div className="auth-mode" role="tablist" aria-label="Account access">
          <button type="button" className={mode === "login" ? "active" : ""} onClick={() => changeMode("login")}>Log in</button>
          <button type="button" className={mode === "create" ? "active" : ""} onClick={() => changeMode("create")}>Create account</button>
        </div>
        <div className="auth-heading">
          <span className="auth-step">{mode === "login" ? "Account access" : "Step 1 of 2"}</span>
          <h2>{mode === "login" ? "Welcome back" : "Create your account"}</h2>
          <p>{mode === "login" ? "Sign in to continue to your workspace." : "Next, we will set up your invoice defaults."}</p>
        </div>
        <label>Email address<input required type="email" autoComplete="email" placeholder="you@business.com" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <PasswordField
          label="Password"
          value={password}
          visible={showPassword}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          onChange={setPassword}
          onToggle={() => setShowPassword((current) => !current)}
        />
        {mode === "create" && (
          <PasswordField
            label="Confirm password"
            value={confirmPassword}
            visible={showPassword}
            autoComplete="new-password"
            onChange={setConfirmPassword}
            onToggle={() => setShowPassword((current) => !current)}
          />
        )}
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="primary-button auth-submit" disabled={busy} type="submit">
          {busy ? <LoadingLabel>{mode === "login" ? "Signing in..." : "Creating account..."}</LoadingLabel> : mode === "login" ? "Log in" : "Continue"}
        </button>
        <p className="auth-note">Your session uses a secure HTTP-only cookie. Passwords are never stored in the browser.</p>
      </form>
    </AuthLayout>
  );
}

export function OnboardingScreen({
  email,
  onComplete,
  onLogout
}: {
  email: string;
  onComplete: (input: BusinessOnboardingInput) => Promise<void>;
  onLogout: () => Promise<void>;
}) {
  const [form, setForm] = useState<BusinessOnboardingInput>({
    businessName: "",
    businessEmail: email,
    businessPhone: "",
    businessAddress: "",
    defaultCurrency: "USD",
    invoicePrefix: "INV"
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await onComplete(form);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to finish setup.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      eyebrow="A polished starting point"
      title="Set your defaults once. Adjust them whenever you need."
      description="These details appear on invoice PDFs and become the defaults for new invoices."
      points={[
        { icon: <Building2 size={20} />, label: "Business details on every PDF" },
        { icon: <FileText size={20} />, label: "Invoice numbering starts at 1001" },
        { icon: <ShieldCheck size={20} />, label: "A private workspace for this account" }
      ]}
    >
      <form className="auth-form onboarding-form" onSubmit={submit}>
        <div className="auth-heading">
          <span className="auth-step">Step 2 of 2</span>
          <h2>Set up your business</h2>
          <p>You can update these details later from Settings.</p>
        </div>
        <label>Business name<input required autoFocus autoComplete="organization" placeholder="Acme Studio" value={form.businessName} onChange={(event) => setForm({ ...form, businessName: event.target.value })} /></label>
        <label>Billing email<input required type="email" autoComplete="email" value={form.businessEmail} onChange={(event) => setForm({ ...form, businessEmail: event.target.value })} /></label>
        <div className="field-grid two">
          <label>Phone <span className="field-optional">Optional</span><input autoComplete="tel" placeholder="(555) 555-0123" value={form.businessPhone} onChange={(event) => setForm({ ...form, businessPhone: event.target.value })} /></label>
          <label>Invoice prefix<input required maxLength={12} value={form.invoicePrefix} onChange={(event) => setForm({ ...form, invoicePrefix: event.target.value.toUpperCase() })} /></label>
        </div>
        <label>Business address <span className="field-optional">Optional</span><textarea autoComplete="street-address" placeholder="Street, city, state, postal code" value={form.businessAddress} onChange={(event) => setForm({ ...form, businessAddress: event.target.value })} /></label>
        <label>Default currency<select value={form.defaultCurrency} onChange={(event) => setForm({ ...form, defaultCurrency: event.target.value })}><option value="USD">USD - US Dollar</option><option value="CAD">CAD - Canadian Dollar</option><option value="EUR">EUR - Euro</option><option value="GBP">GBP - British Pound</option><option value="AUD">AUD - Australian Dollar</option></select></label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <div className="auth-actions">
          <button className="secondary-button" disabled={busy} type="button" onClick={() => void onLogout()}>Log out</button>
          <button className="primary-button" disabled={busy} type="submit">{busy ? <LoadingLabel>Preparing workspace...</LoadingLabel> : "Open workspace"}</button>
        </div>
      </form>
    </AuthLayout>
  );
}

function AuthLayout({
  eyebrow,
  title,
  description,
  points,
  children
}: {
  eyebrow: string;
  title: string;
  description: string;
  points: Array<{ icon: ReactNode; label: string }>;
  children: ReactNode;
}) {
  return (
    <main className="auth-shell">
      <section className="auth-intro">
        <div className="auth-orb auth-orb-one" />
        <div className="auth-orb auth-orb-two" />
        <div className="auth-brand"><span className="brand-mark"><AppLogoMark /></span><strong>Invoice Creator</strong></div>
        <div className="auth-copy">
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <div className="auth-points">
          {points.map((point) => <div key={point.label}>{point.icon}<span>{point.label}</span></div>)}
        </div>
      </section>
      <section className="auth-form-wrap">{children}</section>
    </main>
  );
}

function PasswordField({
  label,
  value,
  visible,
  autoComplete,
  onChange,
  onToggle
}: {
  label: string;
  value: string;
  visible: boolean;
  autoComplete: string;
  onChange: (value: string) => void;
  onToggle: () => void;
}) {
  return (
    <label>
      {label}
      <span className="password-field">
        <input required type={visible ? "text" : "password"} autoComplete={autoComplete} value={value} onChange={(event) => onChange(event.target.value)} />
        <button aria-label={visible ? "Hide password" : "Show password"} type="button" onClick={onToggle}>{visible ? <EyeOff size={17} /> : <Eye size={17} />}</button>
      </span>
    </label>
  );
}
