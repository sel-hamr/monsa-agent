/** What the model is told about the person it is budgeting for. */

import type { ModelMessage } from "ai";

import { formatMoney } from "../../config/profile.js";
import type { Profile } from "../../config/profile.js";
import { ledgerTotal } from "../../config/expenses.js";
import type { Ledger, Purchase } from "../../config/expenses.js";
import { daysLeftInMonth } from "../../ui/lib/greeting.js";

/** One purchase as a briefing line, id last so it is easy to quote back. */
function purchaseLine(purchase: Purchase, currency: string): string {
  const day = purchase.at.slice(0, 10);
  return `  ${day}  ${formatMoney(purchase.amount, currency)}  ${purchase.label}  [${purchase.id}]`;
}

/**
 * The profile and this month's spending as a system message. Rebuilt each turn
 * so neither the date nor the totals it states can go stale in a long session.
 */
export function profileBriefing(profile: Profile, ledger: Ledger, now: Date): string {
  const days = daysLeftInMonth(now);
  const month = now.toLocaleString("en-US", { month: "long" });
  const today = now.toLocaleDateString("en-CA");

  const head = [
    `You are budgeting for ${profile.name}.`,
    `Their monthly budget is ${formatMoney(profile.monthlyBudget, profile.currency)}, and amounts you quote should be in ${profile.currency}.`,
    `Today is ${today}, with ${days} days left in ${month} counting today.`,
  ].join(" ");

  if (ledger.purchases.length === 0) {
    return `${head} No spending has been recorded yet, so treat the whole budget as still available and say so rather than inventing expenses.`;
  }

  const spent = ledgerTotal(ledger);
  const left = profile.monthlyBudget - spent;
  const mismatch =
    ledger.currency === profile.currency
      ? ""
      : ` These purchases were recorded in ${ledger.currency}, which is not the profile currency ${profile.currency}; say so rather than converting between them.`;

  return [
    head,
    `Spent so far this month: ${formatMoney(spent, ledger.currency)} of ${formatMoney(profile.monthlyBudget, profile.currency)}. ${formatMoney(left, profile.currency)} left, about ${formatMoney(left / days, profile.currency)} a day.${mismatch}`,
    "Purchases this month, oldest first:",
    ...ledger.purchases.map((purchase) => purchaseLine(purchase, ledger.currency)),
    "To undo one, call removePurchase with the id in brackets.",
  ].join("\n");
}

/**
 * The turn to send: a fresh briefing, the conversation so far, and the new
 * input. Any system message from earlier turns is dropped so the briefing is
 * the only one, and always current.
 */
export function buildAgentMessages(
  profile: Profile | null,
  ledger: Ledger | null,
  history: ModelMessage[],
  userInput: string,
  now: Date = new Date(),
): ModelMessage[] {
  const conversation = history.filter((message) => message.role !== "system");
  const briefing: ModelMessage[] =
    profile === null || ledger === null
      ? []
      : [{ role: "system", content: profileBriefing(profile, ledger, now) }];

  return [...briefing, ...conversation, { role: "user", content: userInput }];
}
