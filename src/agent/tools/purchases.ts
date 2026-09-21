/** Recording what was bought. Adding is proposed and confirmed; removing is immediate. */

import { tool } from "ai";
import { z } from "zod";

import {
  ledgerTotal,
  loadLedger,
  monthKey,
  removePurchase as removeFromLedger,
  saveLedger,
} from "../../config/expenses.js";
import { formatMoney } from "../../config/profile.js";
import type { Profile } from "../../config/profile.js";

/** What the model proposes buying. Also used to re-validate the call in run.ts. */
export const purchaseProposalSchema = z.object({
  amount: z.number().positive(),
  label: z.string().min(1),
});

export type PurchaseProposal = z.infer<typeof purchaseProposalSchema>;

/** "Spent X of Y this month; Z left." */
function standing(spent: number, profile: Profile): string {
  const left = profile.monthlyBudget - spent;
  return (
    `Spent ${formatMoney(spent, profile.currency)} of ` +
    `${formatMoney(profile.monthlyBudget, profile.currency)} this month; ` +
    `${formatMoney(left, profile.currency)} left.`
  );
}

export function buildPurchaseTools(profile: Profile) {
  return {
    recordPurchase: tool({
      description:
        "Propose recording a purchase the user mentioned. This does NOT save it. " +
        "The user is asked to confirm first, and may decline. Call this once per " +
        "distinct purchase.",
      inputSchema: purchaseProposalSchema,
      execute: ({ amount, label }: PurchaseProposal) =>
        `Proposed ${label}, ${formatMoney(amount, profile.currency)} — NOT saved yet, ` +
        `awaiting the user's confirmation. Do not tell them it is recorded.`,
    }),

    removePurchase: tool({
      description:
        "Remove a purchase already recorded this month, by the id shown in " +
        "square brackets in the briefing. Takes effect immediately.",
      inputSchema: z.object({ id: z.string().min(1) }),
      execute: async ({ id }: { id: string }) => {
        const month = monthKey(new Date());
        const ledger = await loadLedger(month, profile.currency);
        const { ledger: after, removed } = removeFromLedger(ledger, id);
        if (removed === null) return `No purchase this month has the id ${id}. Nothing changed.`;
        await saveLedger(after);
        return (
          `Removed ${removed.label}, ${formatMoney(removed.amount, ledger.currency)}. ` +
          standing(ledgerTotal(after), profile)
        );
      },
    }),
  };
}
