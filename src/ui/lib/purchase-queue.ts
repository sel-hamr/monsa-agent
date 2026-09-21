/** The gate in front of the ledger: nothing is written until the user says yes. */

import { formatMoney } from "../../config/profile.js";
import type { PurchaseProposal } from "../../agent/tools/index.js";
import { parseConfirmation } from "./commands.js";

export type QueueAnswer =
  | { kind: "none" }
  | { kind: "confirmed"; proposal: PurchaseProposal; rest: PurchaseProposal[] }
  | { kind: "declined"; proposal: PurchaseProposal; rest: PurchaseProposal[] };

/**
 * The question put to the user before a purchase is saved. Deliberately
 * neutral: the same prompt has to read correctly whether they said "I want to
 * buy this" or "I already bought this".
 */
export function purchaseQuestion(proposal: PurchaseProposal, currency: string): string {
  return `Save ${proposal.label}, ${formatMoney(proposal.amount, currency)}? (y/n)`;
}

/**
 * What the next input does to the queue. `none` means nothing was pending and
 * the input belongs to the agent. Anything unclear counts as a no, the same way
 * `/reset` treats it.
 */
export function answerProposal(
  pending: readonly PurchaseProposal[],
  input: string,
): QueueAnswer {
  const [proposal, ...rest] = pending;
  if (proposal === undefined) return { kind: "none" };
  return parseConfirmation(input)
    ? { kind: "confirmed", proposal, rest }
    : { kind: "declined", proposal, rest };
}
