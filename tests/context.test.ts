import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { createProfile } from "../src/config/profile.js";
import { buildAgentMessages, profileBriefing } from "../src/agent/context/index.js";

const salah = createProfile("Salah", 4000, "MAD");
const noon = new Date(2026, 8, 20, 12, 0);

describe("profileBriefing", () => {
  test("tells the model who it is talking to and what they have", () => {
    const briefing = profileBriefing(salah, noon);
    assert.match(briefing, /Salah/);
    assert.match(briefing, /4,000 MAD/);
    assert.match(briefing, /MAD/);
  });

  test("dates the conversation so the model can reason about the month", () => {
    const briefing = profileBriefing(salah, noon);
    assert.match(briefing, /2026-09-20/);
    assert.match(briefing, /11 days left in September/);
  });

  test("is honest that nothing has been recorded yet", () => {
    assert.match(profileBriefing(salah, noon), /no spending has been recorded/i);
  });
});

describe("buildAgentMessages", () => {
  test("puts the briefing first, then the history, then what was just typed", () => {
    const history = [
      { role: "user" as const, content: "hi" },
      { role: "assistant" as const, content: "hello" },
    ];
    const messages = buildAgentMessages(salah, history, "what's left?", noon);

    assert.equal(messages.length, 4);
    assert.equal(messages[0]?.role, "system");
    assert.equal(messages[0]?.content, profileBriefing(salah, noon));
    assert.deepEqual(messages.slice(1, 3), history);
    assert.deepEqual(messages.at(-1), { role: "user", content: "what's left?" });
  });

  test("carries exactly one system message, however long the history gets", () => {
    const history = [
      { role: "system" as const, content: "a stale briefing" },
      { role: "user" as const, content: "hi" },
    ];
    const messages = buildAgentMessages(salah, history, "again", noon);
    assert.equal(messages.filter((message) => message.role === "system").length, 1);
    assert.equal(messages[0]?.content, profileBriefing(salah, noon));
  });

  test("works before a profile exists", () => {
    const messages = buildAgentMessages(null, [], "hello", noon);
    assert.deepEqual(messages, [{ role: "user", content: "hello" }]);
  });
});
