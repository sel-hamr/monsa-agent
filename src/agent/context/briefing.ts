/** What the model is told about the person it is budgeting for. */

import type { ModelMessage } from "ai";

import { formatMoney } from "../../config/profile.js";
import type { Profile } from "../../config/profile.js";
import { daysLeftInMonth } from "../../ui/lib/greeting.js";

/**
 * The profile as a system message. Rebuilt each turn so the date it states never
 * goes stale in a long session.
 */
export function profileBriefing(profile: Profile, now: Date): string {
  const days = daysLeftInMonth(now);
  const month = now.toLocaleString("en-US", { month: "long" });
  const today = now.toLocaleDateString("en-CA");

  return [
    `You are budgeting for ${profile.name}.`,
    `Their monthly budget is ${formatMoney(profile.monthlyBudget, profile.currency)}, and amounts you quote should be in ${profile.currency}.`,
    `Today is ${today}, with ${days} days left in ${month} counting today.`,
    "No spending has been recorded yet, so treat the whole budget as still available and say so rather than inventing expenses.",
  ].join(" ");
}

/**
 * The turn to send: a fresh briefing, the conversation so far, and the new
 * input. Any system message from earlier turns is dropped so the briefing is
 * the only one, and always current.
 */
export function buildAgentMessages(
  profile: Profile | null,
  history: ModelMessage[],
  userInput: string,
  now: Date = new Date(),
): ModelMessage[] {
  const conversation = history.filter((message) => message.role !== "system");
  const briefing: ModelMessage[] =
    profile === null ? [] : [{ role: "system", content: profileBriefing(profile, now) }];

  return [...briefing, ...conversation, { role: "user", content: userInput }];
}
