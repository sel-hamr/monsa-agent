/** The line monsa opens with: what is left this month, and what it buys a day. */

import { ledgerTotal } from "../../config/expenses.js";
import type { Ledger } from "../../config/expenses.js";
import { formatMoney } from "../../config/profile.js";
import type { Profile } from "../../config/profile.js";

export interface Greeting {
  summary: string;
  question: string;
}

/** Days remaining in `now`'s month, counting today — today is still spendable. */
export function daysLeftInMonth(now: Date): number {
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return lastDay - now.getDate() + 1;
}

/** What is left this month: the budget, less everything recorded against it. */
export function greeting(profile: Profile, ledger: Ledger, now: Date): Greeting {
  const days = daysLeftInMonth(now);
  const month = now.toLocaleString("en-US", { month: "long" });
  const left = profile.monthlyBudget - ledgerTotal(ledger);

  return {
    summary:
      `Hey ${profile.name} — ${formatMoney(left, profile.currency)} left ` +
      `for ${month}, ${days} ${days === 1 ? "day" : "days"} to go.`,
    question: "What do you want to do?",
  };
}
