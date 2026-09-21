/** What the model is told about the person it is budgeting for. */

import type { ModelMessage } from "ai";

import { formatMoney } from "../../config/profile.js";
import type { Profile } from "../../config/profile.js";
import { standing } from "../../config/expenses.js";
import type { Ledger, Purchase, Standing } from "../../config/expenses.js";
import { daysLeftInMonth } from "../../ui/lib/greeting.js";

/** One purchase as a briefing line, id last so it is easy to quote back. */
function purchaseLine(purchase: Purchase, currency: string): string {
  const day = purchase.at.slice(0, 10);
  return `  ${day}  ${formatMoney(purchase.amount, currency)}  ${purchase.label}  [${purchase.id}]`;
}

/**
 * Spent, budget, remainder, and a per-day estimate — all safe to compute
 * because the ledger and the profile agree on currency.
 */
function spendingLine(s: Extract<Standing, { kind: "aligned" }>, days: number): string {
  return `Spent so far this month: ${formatMoney(s.spent, s.currency)} of ${formatMoney(s.budget, s.currency)}. ${formatMoney(s.left, s.currency)} left, about ${formatMoney(s.left / days, s.currency)} a day.`;
}

/**
 * Spent and budget only, each in its own currency. There is no exchange rate
 * in this app, so `left` and a per-day figure are never computed here — doing
 * so would silently assume a 1:1 rate between two different currencies.
 */
function mismatchLine(s: Extract<Standing, { kind: "mismatched" }>): string {
  return `Spent so far this month: ${formatMoney(s.spent, s.spentCurrency)}. The monthly budget is ${formatMoney(s.budget, s.budgetCurrency)}. These purchases were recorded in ${s.spentCurrency}, which is not the profile currency ${s.budgetCurrency}; say so rather than converting between them.`;
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

  const s = standing(profile, ledger);
  const summary = s.kind === "aligned" ? spendingLine(s, days) : mismatchLine(s);

  return [
    head,
    summary,
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
