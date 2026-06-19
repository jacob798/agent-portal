// Operator data — render fresh so a change shows on the next screen without lag.
export const dynamic = "force-dynamic";

import { getOperatorActions } from "@/lib/data/actions";
import Inbox from "@/components/inbox/Inbox";
import PageHeader from "@/components/ui/PageHeader";

export default async function InboxPage() {
  const actions = await getOperatorActions();

  return (
    <div className="mx-auto max-w-4xl px-8 py-8">
      <PageHeader
        title="Inbox"
        subtitle="Everything the agents need from you — approvals, choices, and alerts, in one place."
      />
      <div className="mt-6">
        <Inbox initial={actions} />
      </div>
    </div>
  );
}
