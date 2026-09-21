import { useCallback, useEffect, useRef, useState } from "react";

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

  /**
   * Every confirmed write is chained onto this promise rather than fired
   * independently. Two proposals can be queued from one agent turn, and
   * answering them in quick succession must not let two `save()` calls
   * interleave their `loadLedger` / `saveLedger` — the second would load the
   * file before the first has written, and its save would silently discard
   * the first purchase. `run` always resolves (it catches its own errors),
   * so the chain itself never rejects and a failed write cannot wedge the
   * ones queued behind it.
   */
  const writeChain = useRef<Promise<void>>(Promise.resolve());

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

  // A proposal answered before the profile is reset must not still be
  // sitting there once a new profile (possibly a new currency) is created —
  // it would ask a question about the old session and write into the new one.
  useEffect(() => {
    if (profile === null) {
      setPending([]);
      setNotice(null);
    }
  }, [profile]);

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
      const run = () =>
        save(answer.proposal, profile).catch((cause: unknown) => {
          const reason = cause instanceof Error ? cause.message : "unknown error";
          setNotice(`Could not record ${answer.proposal.label}: ${reason}`);
        });
      writeChain.current = writeChain.current.then(run);
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
