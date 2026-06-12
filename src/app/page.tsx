import { getInitialAppState } from "@/app/actions";
import { InvoiceWorkspace } from "@/components/invoice-workspace";

export default async function Home() {
  const { initialSession, hasAccounts } = await getInitialAppState();
  return <InvoiceWorkspace initialSession={initialSession} hasAccounts={hasAccounts} />;
}
