import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { createProfile } from "../src/config/profile.js";
import { addPurchase, emptyLedger } from "../src/config/expenses.js";
import { buildAgentMessages, profileBriefing } from "../src/agent/context/index.js";

const salah = createProfile("Salah", 4000, "MAD");
const noon = new Date(2026, 8, 20, 12, 0);
const nothingSpent = emptyLedger("2026-09", "MAD");

/** A September with 400 of rent and 30 of coffee on the books. */
function spentSome() {
  const rent = addPurchase(nothingSpent, 400, "rent share", new Date(2026, 8, 3, 9, 0));
  const coffee = addPurchase(rent.ledger, 30, "coffee", new Date(2026, 8, 12, 9, 0));
  return { ledger: coffee.ledger, rentId: rent.purchase.id, coffeeId: coffee.purchase.id };
}

describe("profileBriefing", () => {
  test("tells the model who it is talking to and what they have", () => {
    const briefing = profileBriefing(salah, nothingSpent, noon);
    assert.match(briefing, /Salah/);
    assert.match(briefing, /4,000 MAD/);
  });

  test("dates the conversation so the model can reason about the month", () => {
    const briefing = profileBriefing(salah, nothingSpent, noon);
    assert.match(briefing, /2026-09-20/);
    assert.match(briefing, /11 days left in September/);
  });

  test("is honest that nothing has been recorded when the ledger is empty", () => {
    const briefing = profileBriefing(salah, nothingSpent, noon);
    assert.match(briefing, /no spending has been recorded/i);
    assert.doesNotMatch(briefing, /Purchases this month/);
  });

  test("states what has been spent and what is left", () => {
    const briefing = profileBriefing(salah, spentSome().ledger, noon);
    assert.match(briefing, /430 MAD/, "the total spent");
    assert.match(briefing, /3,570 MAD/, "what remains");
    assert.doesNotMatch(briefing, /no spending has been recorded/i);
  });

  test("lists every purchase with the id needed to remove it", () => {
    const { ledger, rentId, coffeeId } = spentSome();
    const briefing = profileBriefing(salah, ledger, noon);
    assert.match(briefing, /rent share/);
    assert.match(briefing, /coffee/);
    assert.ok(briefing.includes(rentId), "the rent id should be quotable back");
    assert.ok(briefing.includes(coffeeId), "the coffee id should be quotable back");
    assert.match(briefing, /removePurchase/);
  });

  test("flags a currency that no longer matches the profile", () => {
    const inEuros = addPurchase(emptyLedger("2026-09", "EUR"), 30, "coffee", noon).ledger;
    const briefing = profileBriefing(salah, inEuros, noon);
    assert.match(briefing, /EUR/);
    assert.match(briefing, /not the profile currency/i);
  });
});

describe("buildAgentMessages", () => {
  test("puts the briefing first, then the history, then what was just typed", () => {
    const history = [
      { role: "user" as const, content: "hi" },
      { role: "assistant" as const, content: "hello" },
    ];
    const messages = buildAgentMessages(salah, nothingSpent, history, "what's left?", noon);

    assert.equal(messages.length, 4);
    assert.equal(messages[0]?.role, "system");
    assert.equal(messages[0]?.content, profileBriefing(salah, nothingSpent, noon));
    assert.deepEqual(messages.slice(1, 3), history);
    assert.deepEqual(messages.at(-1), { role: "user", content: "what's left?" });
  });

  test("carries exactly one system message, however long the history gets", () => {
    const history = [
      { role: "system" as const, content: "a stale briefing" },
      { role: "user" as const, content: "hi" },
    ];
    const messages = buildAgentMessages(salah, nothingSpent, history, "again", noon);
    assert.equal(messages.filter((message) => message.role === "system").length, 1);
    assert.equal(messages[0]?.content, profileBriefing(salah, nothingSpent, noon));
  });

  test("works before a profile exists", () => {
    const messages = buildAgentMessages(null, null, [], "hello", noon);
    assert.deepEqual(messages, [{ role: "user", content: "hello" }]);
  });
});
