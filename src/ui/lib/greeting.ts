/** The line monsa opens with: what is left this month, and what it buys a day. */

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

/** Nothing records spending yet, so "left" is the whole monthly budget. */
export function greeting(profile: Profile, now: Date): Greeting {
  const days = daysLeftInMonth(now);
  const month = now.toLocaleString("en-US", { month: "long" });

  return {
    summary:
      `Hey ${profile.name} — ${formatMoney(profile.monthlyBudget, profile.currency)} left ` +
      `for ${month}, ${days} ${days === 1 ? "day" : "days"} to go.`,
    question: "What do you want to do?",
  };
}
