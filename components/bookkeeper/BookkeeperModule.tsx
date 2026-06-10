"use client";

import { useState } from "react";
import Bookkeeper from "./Bookkeeper";
import BcReimbursement from "@/components/bc/BcReimbursement";
import FilterTabs from "@/components/ui/FilterTabs";
import type { LedgerRow } from "@/lib/data/bookkeeper";
import type { BcExpense, BcHistory } from "@/lib/data/bc";

/**
 * Bookkeeper module shell. BC reimbursement is a function of bookkeeping (it
 * lives on the Loan – Builders Capital balance-sheet account and clears via the
 * Paylocity deposit), so it's a sub-view here rather than a top-level agent.
 */
export default function BookkeeperModule({
  ledger,
  bc,
  bcHistory,
}: {
  ledger: LedgerRow[];
  bc: BcExpense[];
  bcHistory: BcHistory[];
}) {
  const [view, setView] = useState("ledger");
  return (
    <div>
      <div className="mx-auto max-w-7xl px-6 pt-6">
        <FilterTabs
          active={view}
          onChange={setView}
          tabs={[
            { key: "ledger", label: "Posting ledger" },
            { key: "bc", label: "BC Reimbursement" },
          ]}
        />
      </div>
      {view === "ledger" ? (
        <Bookkeeper initial={ledger} />
      ) : (
        <BcReimbursement initial={bc} history={bcHistory} />
      )}
    </div>
  );
}
