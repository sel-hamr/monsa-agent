import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { runAgent } from "../src/agent/run.js";
import { buildAgentMessages } from "../src/agent/context/index.js";
import { createProfile } from "../src/config/profile.js";
import { emptyLedger, loadLedger, monthKey } from "../src/config/expenses.js";
import { withRedirectedHome } from "./helpers.js";

process.env["ANTHROPIC_API_KEY"] = "test-key-not-real";

type CapturedBody = {
  system?: unknown;
  messages?: { role: string; content: unknown }[];
};

/** Answer the model call locally, and hand back what was sent to it. */
async function captureRequest<T>(run: () => Promise<T>): Promise<{
  body: CapturedBody;
  result: T;
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
    const result = await run();
    return { body, result };
  } finally {
    globalThis.fetch = realFetch;
  }
}

describe("runAgent", () => {
  test("sends the profile briefing and the conversation to the model", async () => {
    const profile = createProfile("Salah", 4000, "MAD");
    const messages = buildAgentMessages(
      profile,
      emptyLedger("2026-09", "MAD"),
      [],
      "how much do I have?",
      new Date(2026, 8, 20),
    );

    const { body, result } = await captureRequest(() =>
      runAgent({ profile, messages }),
    );

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
    assert.equal(result.text, "You have 4,000 MAD for September.");
    assert.deepEqual(result.proposals, [], "a plain answer proposes nothing");
  });

  test("a recordPurchase call comes back as a proposal, and nothing is written", async () => {
    await withRedirectedHome(async () => {
      const profile = createProfile("Salah", 4000, "MAD");
      const month = monthKey(new Date(2026, 8, 20));
      const messages = buildAgentMessages(
        profile,
        emptyLedger(month, "MAD"),
        [],
        "i bought coffee for 30",
        new Date(2026, 8, 20),
      );

      const realFetch = globalThis.fetch;
      let call = 0;
      globalThis.fetch = (async () => {
        call += 1;
        const content =
          call === 1
            ? [
                {
                  type: "tool_use",
                  id: "toolu_1",
                  name: "recordPurchase",
                  input: { amount: 30, label: "coffee" },
                },
              ]
            : [{ type: "text", text: "Want me to record coffee?" }];
        return new Response(
          JSON.stringify({
            id: "msg_test",
            type: "message",
            role: "assistant",
            model: "claude-opus-5",
            content,
            stop_reason: call === 1 ? "tool_use" : "end_turn",
            usage: { input_tokens: 10, output_tokens: 10 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }) as typeof globalThis.fetch;

      try {
        const result = await runAgent({ profile, messages });
        assert.deepEqual(result.proposals, [{ amount: 30, label: "coffee" }]);

        // The other half of the feature's name: a proposal must not touch
        // the ledger file. `recordPurchase`'s own execute runs during this
        // turn (it is a real tool call, not a mock), so this is a genuine
        // check that it never wrote — not just that run.ts didn't call save.
        const ledger = await loadLedger(month, profile.currency);
        assert.deepEqual(ledger.purchases, [], "a proposal must not write to the ledger");
      } finally {
        globalThis.fetch = realFetch;
      }
    });
  });
});
