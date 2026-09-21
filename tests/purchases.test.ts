import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { buildPurchaseTools } from "../src/agent/tools/purchases.js";
import { addPurchase, emptyLedger, monthKey, saveLedger } from "../src/config/expenses.js";
import { createProfile } from "../src/config/profile.js";
import { withRedirectedHome } from "./helpers.js";

describe("removePurchase", () => {
  test("a mismatched currency reports spending without a fabricated remainder", async () => {
    await withRedirectedHome(async () => {
      const month = monthKey(new Date());
      const { ledger, purchase } = addPurchase(
        emptyLedger(month, "MAD"),
        430,
        "coffee",
        new Date(),
      );
      await saveLedger(ledger);

      const profile = createProfile("Salah", 4000, "EUR");
      const { removePurchase } = buildPurchaseTools(profile);
      const raw = await removePurchase.execute(
        { id: purchase.id },
        { toolCallId: "test", messages: [], context: {} },
      );
      // `execute`'s declared type allows a streamed result; this tool never
      // streams, so narrow rather than widen the assertions below.
      assert.equal(typeof raw, "string", "removePurchase's result is plain text, not a stream");
      const result = raw as string;

      assert.match(result, /Removed coffee, 430 MAD/);
      assert.match(result, /different currencies/);
      assert.doesNotMatch(result, /left/i, "no remainder should be computed across currencies");
    });
  });
});

describe("recordPurchase", () => {
  test("its description tells the model to give advice before calling it", () => {
    // Also load-bearing: without this the model silently goes back to being a
    // recorder that never offers an opinion, and no other test would notice.
    const profile = createProfile("Salah", 4000, "MAD");
    const { recordPurchase } = buildPurchaseTools(profile);
    // `description` is typed as text-or-a-function in ai v7; ours is static,
    // so narrow rather than widen the assertions below.
    const raw = recordPurchase.description;
    assert.equal(typeof raw, "string", "the description should be plain text");
    const description = raw as string;

    assert.match(description, /before you call this/i, "advice must come first");
    assert.match(description, /ask what it is for/i, "unclear items get a question");
    assert.match(description, /does NOT save/i, "it still must not claim to write");
  });

  test("its result says the purchase was NOT saved, awaiting confirmation", async () => {
    // This wording is load-bearing: it is what stops the model announcing a
    // purchase as recorded before the user has confirmed it. A refactor that
    // softens it to something like "ok" must fail this test.
    const profile = createProfile("Salah", 4000, "MAD");
    const { recordPurchase } = buildPurchaseTools(profile);
    const raw = await recordPurchase.execute(
      { amount: 30, label: "coffee" },
      { toolCallId: "test", messages: [], context: {} },
    );
    assert.equal(typeof raw, "string", "recordPurchase's result is plain text, not a stream");
    const result = raw as string;

    assert.match(result, /NOT saved/i);
  });
});
