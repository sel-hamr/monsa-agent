/** The line monsa opens with: what is left this month, and what it buys a day. */

import { standing } from "../../config/expenses.js";
import type { Ledger, Standing } from "../../config/expenses.js";
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

/**
 * What is left this month when currencies match: the budget, less everything
 * recorded against it. This function never receives the material needed to
 * compute across different currencies — the structural guarantee that
 * we cannot silently assume a 1:1 exchange rate.
 */
function matchingCurrencyLine(
  profile: Profile,
  s: Extract<Standing, { kind: "aligned" }>,
  days: number,
  month: string,
): string {
  return (
    `Hey ${profile.name} — ${formatMoney(s.left, s.currency)} left ` +
    `for ${month}, ${days} ${days === 1 ? "day" : "days"} to go.`
  );
}

/**
 * When the ledger's currency does not match the profile's: state what is
 * knowable — spending in ledger currency and budget in profile currency —
 * without computing a remainder that would silently assume a 1:1 rate.
 */
function mismatchLine(profile: Profile, s: Extract<Standing, { kind: "mismatched" }>): string {
  return (
    `Hey ${profile.name} — spent ${formatMoney(s.spent, s.spentCurrency)} ` +
    `against a budget of ${formatMoney(s.budget, s.budgetCurrency)}, ` +
    `recorded in different currencies.`
  );
}

/** The opening line with the time and money left, or a currency mismatch warning. */
export function greeting(profile: Profile, ledger: Ledger, now: Date): Greeting {
  const days = daysLeftInMonth(now);
  const month = now.toLocaleString("en-US", { month: "long" });
  const s = standing(profile, ledger);

  return {
    summary:
      s.kind === "aligned"
        ? matchingCurrencyLine(profile, s, days, month)
        : mismatchLine(profile, s),
    question: "What do you want to do?",
  };
}
