import { readClock } from "./clock.js";
import { buildPurchaseTools } from "./purchases.js";
import type { Profile } from "../../config/profile.js";

/**
 * Every tool the agent can call, keyed by the name the model sees. A profile is
 * required: the money tools need a currency and a budget, and the agent is
 * never run before onboarding finishes.
 */
export function buildTools(profile: Profile) {
  return { readClock, ...buildPurchaseTools(profile) };
}

export { readClock };
export { purchaseProposalSchema } from "./purchases.js";
export type { PurchaseProposal } from "./purchases.js";
