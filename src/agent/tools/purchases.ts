/** Recording what was bought. Adding is proposed and confirmed; removing is immediate. */

import { tool } from "ai";
import { z } from "zod";

import {
  loadLedger,
  monthKey,
  removePurchase as removeFromLedger,
  saveLedger,
  standing,
} from "../../config/expenses.js";
import type { Ledger } from "../../config/expenses.js";
import { formatMoney } from "../../config/profile.js";
import type { Profile } from "../../config/profile.js";

/** What the model proposes buying. Also used to re-validate the call in run.ts. */
export const purchaseProposalSchema = z.object({
  amount: z.number().positive(),
  label: z.string().min(1),
});

export type PurchaseProposal = z.infer<typeof purchaseProposalSchema>;

/** "Spent X of Y this month; Z left." — or, mismatched, spent and budget with no remainder. */
function standingLine(profile: Profile, ledger: Ledger): string {
  const s = standing(profile, ledger);
  if (s.kind === "aligned") {
    return (
      `Spent ${formatMoney(s.spent, s.currency)} of ` +
      `${formatMoney(s.budget, s.currency)} this month; ` +
      `${formatMoney(s.left, s.currency)} left.`
    );
  }
  return (
    `Spent ${formatMoney(s.spent, s.spentCurrency)} this month, against a budget of ` +
    `${formatMoney(s.budget, s.budgetCurrency)}. These are in different currencies, so no ` +
    `remainder is shown.`
  );
}

export function buildPurchaseTools(profile: Profile) {
  return {
    recordPurchase: tool({
      description:
        "Raise a purchase for the user to confirm. This does NOT save it — they " +
        "are asked first, and may decline. " +
        "Before you call this, give your honest view on whether the purchase is a " +
        "good idea this month, in a line or two, using the figures in the briefing. " +
        "If you cannot tell how much the thing matters to them, ask what it is for " +
        "instead of calling this. " +
        "Call it once per distinct purchase, whether they are about to buy it or " +
        "have already bought it.",
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
          standingLine(profile, after)
        );
      },
    }),
  };
}
