import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText, stepCountIs } from "ai";
import type { ModelMessage } from "ai";

import { env } from "../config/env.js";
import { MODEL, PERSONA } from "../constants/index.js";
import { tools } from "./tools/index.js";

const anthropic = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY });

export type RunAgentOptions = {
  messages: ModelMessage[];
  maxSteps?: number;
};

export async function runAgent({
  messages,
  maxSteps = 10,
}: RunAgentOptions): Promise<string> {
  const briefings = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content);
  const conversation = messages.filter((message) => message.role !== "system");

  const { text } = await generateText({
    model: anthropic(MODEL),
    instructions: [PERSONA, ...briefings].join("\n\n"),
    messages: conversation,
    tools,
    stopWhen: stepCountIs(maxSteps),
  });

  return text;
}
