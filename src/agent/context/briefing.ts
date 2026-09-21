/** What the model is told about the person it is budgeting for. */

import type { ModelMessage } from "ai";

import { formatMoney } from "../../config/profile.js";
import type { Profile } from "../../config/profile.js";
import { pace, standing } from "../../config/expenses.js";
import type { Ledger, Pace, Purchase, Standing } from "../../config/expenses.js";
import { daysLeftInMonth } from "../../ui/lib/greeting.js";

/** One purchase as a briefing line, id last so it is easy to quote back. */
function purchaseLine(purchase: Purchase, currency: string): string {
  const day = purchase.at.slice(0, 10);
  return `  ${day}  ${formatMoney(purchase.amount, currency)}  ${purchase.label}  [${purchase.id}]`;
}

/**
 * Two rates, not one: what is actually being spent per day so far, and what the
 * remainder allows per day from here. The gap between them is what makes a
 * purchase look reasonable or reckless, and a model reasons badly about money
 * it has to divide itself. All safe to compute because the ledger and the
 * profile agree on currency.
 */
function spendingLine(
  s: Extract<Standing, { kind: "aligned" }>,
  days: number,
  p: Pace,
): string {
  return (
    `Spent so far this month: ${formatMoney(s.spent, s.currency)} of ${formatMoney(s.budget, s.currency)} over ${p.daysElapsed} days — about ${formatMoney(p.perDaySoFar, s.currency)} a day. ` +
    `${formatMoney(s.left, s.currency)} left for ${days} days — about ${formatMoney(s.left / days, s.currency)} a day.`
  );
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
 * How to handle "I want to buy X". This lives in the briefing rather than in
 * PERSONA so it sits beside the numbers it refers to, and so it cannot colour
 * replies that have nothing to do with money.
 */
const ADVICE = [
  "When they say they want to buy something, judge it before recording.",
  "Weigh what the thing is against what is left, the days remaining, and how fast they are already spending.",
  "Say plainly whether it looks like a good idea and why, in a line or two.",
  "Something important or urgent can be worth buying even when it leaves them little; a want should leave more room.",
  "How much to keep back depends on what they are buying — there is no fixed reserve to protect.",
  "If you cannot tell which it is, ask what it is for instead of guessing.",
  "Then call recordPurchase so they can confirm.",
  "They decide: once they have answered, do not argue and do not repeat the warning.",
].join(" ");

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
    return [
      `${head} No spending has been recorded yet, so treat the whole budget as still available and say so rather than inventing expenses.`,
      ADVICE,
    ].join("\n");
  }

  const s = standing(profile, ledger);
  const summary =
    s.kind === "aligned" ? spendingLine(s, days, pace(s.spent, now)) : mismatchLine(s);

  return [
    head,
    summary,
    "Purchases this month, oldest first:",
    ...ledger.purchases.map((purchase) => purchaseLine(purchase, ledger.currency)),
    "To undo one, call removePurchase with the id in brackets.",
    ADVICE,
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
