import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText, stepCountIs } from "ai";
import type { ModelMessage } from "ai";

import { env } from "../config/env.js";
import type { Profile } from "../config/profile.js";
import { MODEL, PERSONA } from "../constants/index.js";
import { buildTools, purchaseProposalSchema } from "./tools/index.js";
import type { PurchaseProposal } from "./tools/index.js";

const anthropic = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY });

export type RunAgentOptions = {
  profile: Profile;
  messages: ModelMessage[];
  maxSteps?: number;
};

export type AgentTurn = {
  text: string;
  /** Purchases the model asked to record. Nothing is saved until the user agrees. */
  proposals: PurchaseProposal[];
};

export async function runAgent({
  profile,
  messages,
  maxSteps = 10,
}: RunAgentOptions): Promise<AgentTurn> {
  const briefings = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content);
  const conversation = messages.filter((message) => message.role !== "system");

  const result = await generateText({
    model: anthropic(MODEL),
    instructions: [PERSONA, ...briefings].join("\n\n"),
    messages: conversation,
    tools: buildTools(profile),
    stopWhen: stepCountIs(maxSteps),
  });

  const proposals = result.toolCalls
    .filter((call) => call.toolName === "recordPurchase")
    .flatMap((call) => {
      const parsed = purchaseProposalSchema.safeParse(call.input);
      return parsed.success ? [parsed.data] : [];
    });

  return { text: result.text, proposals };
}
