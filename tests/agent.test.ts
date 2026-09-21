import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { runAgent } from "../src/agent/run.js";
import { buildAgentMessages } from "../src/agent/context/index.js";
import { createProfile } from "../src/config/profile.js";

process.env["ANTHROPIC_API_KEY"] = "test-key-not-real";

type CapturedBody = {
  system?: unknown;
  messages?: { role: string; content: unknown }[];
};

/** Answer the model call locally, and hand back what was sent to it. */
async function captureRequest(run: () => Promise<string>): Promise<{
  body: CapturedBody;
  text: string;
}> {
  const realFetch = globalThis.fetch;
  let body: CapturedBody = {};
  globalThis.fetch = (async (_url: string, init?: { body?: string }) => {
    body = JSON.parse(init?.body ?? "{}") as CapturedBody;
    return new Response(
      JSON.stringify({
        id: "msg_test",
        type: "message",
        role: "assistant",
        model: "claude-opus-5",
        content: [{ type: "text", text: "You have 4,000 MAD for September." }],
        stop_reason: "end_turn",
        usage: { input_tokens: 10, output_tokens: 10 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof globalThis.fetch;

  try {
    const text = await run();
    return { body, text };
  } finally {
    globalThis.fetch = realFetch;
  }
}

describe("runAgent", () => {
  test("sends the profile briefing and the conversation to the model", async () => {
    const profile = createProfile("Salah", 4000, "MAD");
    const messages = buildAgentMessages(profile, [], "how much do I have?", new Date(2026, 8, 20));

    const { body, text } = await captureRequest(() => runAgent({ messages }));

    const sent = JSON.stringify(body.system);
    assert.match(sent, /budgeting for Salah/, "the briefing should reach the model");
    assert.match(sent, /4,000 MAD/);
    assert.match(sent, /11 days left in September/);
    assert.match(sent, /terse command-line agent/, "the persona should survive too");

    assert.deepEqual(
      body.messages?.map((message) => message.role),
      ["user"],
      "only the user turn belongs in messages",
    );
    assert.equal(text, "You have 4,000 MAD for September.");
  });
});
