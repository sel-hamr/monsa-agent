import { useCallback, useState } from "react";

import { addPurchase, loadLedger, monthKey, saveLedger, standing } from "../../config/expenses.js";
import type { Ledger } from "../../config/expenses.js";
import { formatMoney } from "../../config/profile.js";
import type { Profile } from "../../config/profile.js";
import type { PurchaseProposal } from "../../agent/tools/index.js";
import { answerProposal, purchaseQuestion } from "../lib/purchase-queue.js";

export type UsePurchaseFlowResult = {
  /** Whether the next input answers "record this purchase?" rather than the agent. */
  isConfirming: boolean;
  question: string | null;
  notice: string | null;
  enqueue: (proposals: PurchaseProposal[]) => void;
  /** Handles the input if it belongs to this flow; `false` means pass it on. */
  handleInput: (value: string) => boolean;
};

/** "Recorded X — Y left." — or, mismatched, spent and budget with no remainder. */
function recordedNotice(proposal: PurchaseProposal, profile: Profile, after: Ledger): string {
  const s = standing(profile, after);
  if (s.kind === "aligned") {
    return `Recorded ${proposal.label} — ${formatMoney(s.left, s.currency)} left.`;
  }
  return (
    `Recorded ${proposal.label} — spent ${formatMoney(s.spent, s.spentCurrency)} against a ` +
    `budget of ${formatMoney(s.budget, s.budgetCurrency)}, in different currencies.`
  );
}

/** Ask before writing: a proposed purchase reaches the file only on a yes. */
export function usePurchaseFlow(
  profile: Profile | null,
  onSaved: () => void,
): UsePurchaseFlowResult {
  const [pending, setPending] = useState<PurchaseProposal[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const save = useCallback(
    async (proposal: PurchaseProposal, forProfile: Profile) => {
      const month = monthKey(new Date());
      const ledger = await loadLedger(month, forProfile.currency);
      const { ledger: after } = addPurchase(ledger, proposal.amount, proposal.label, new Date());
      await saveLedger(after);
      setNotice(recordedNotice(proposal, forProfile, after));
      onSaved();
    },
    [onSaved],
  );

  const handleInput = useCallback(
    (value: string) => {
      const answer = answerProposal(pending, value);
      if (answer.kind === "none") return false;

      setPending(answer.rest);

      if (answer.kind === "declined" || profile === null) {
        setNotice(`Skipped ${answer.proposal.label}.`);
        return true;
      }

      setNotice(null);
      void save(answer.proposal, profile).catch((cause: unknown) => {
        const reason = cause instanceof Error ? cause.message : "unknown error";
        setNotice(`Could not record ${answer.proposal.label}: ${reason}`);
      });
      return true;
    },
    [pending, profile, save],
  );

  const enqueue = useCallback((proposals: PurchaseProposal[]) => {
    if (proposals.length > 0) setNotice(null);
    setPending((current) => [...current, ...proposals]);
  }, []);

  const next = pending[0];

  return {
    isConfirming: next !== undefined,
    question:
      next === undefined || profile === null
        ? null
        : purchaseQuestion(next, profile.currency),
    notice,
    enqueue,
    handleInput,
  };
}
