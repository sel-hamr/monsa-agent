import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { answerProposal, purchaseQuestion } from "../src/ui/lib/purchase-queue.js";
import type { PurchaseProposal } from "../src/agent/tools/index.js";

const coffee: PurchaseProposal = { amount: 30, label: "coffee" };
const rent: PurchaseProposal = { amount: 400, label: "rent share" };

describe("purchaseQuestion", () => {
  test("names the purchase and its cost", () => {
    assert.equal(purchaseQuestion(coffee, "MAD"), "Save coffee, 30 MAD? (y/n)");
  });

  test("uses the symbol when the currency has one", () => {
    assert.equal(purchaseQuestion(coffee, "USD"), "Save coffee, $30? (y/n)");
  });
});

describe("answerProposal", () => {
  test("nothing pending means the input was not ours", () => {
    assert.deepEqual(answerProposal([], "y"), { kind: "none" });
  });

  test("yes confirms the first proposal", () => {
    assert.deepEqual(answerProposal([coffee], "y"), {
      kind: "confirmed",
      proposal: coffee,
      rest: [],
    });
    assert.equal(answerProposal([coffee], "yes").kind, "confirmed");
  });

  test("no declines it", () => {
    assert.deepEqual(answerProposal([coffee], "n"), {
      kind: "declined",
      proposal: coffee,
      rest: [],
    });
  });

  test("anything unclear is a no", () => {
    for (const input of ["maybe", "", "  ", "sure", "ok"]) {
      assert.equal(
        answerProposal([coffee], input).kind,
        "declined",
        `"${input}" must not be read as a yes`,
      );
    }
  });

  test("two queued proposals are answered one at a time", () => {
    const first = answerProposal([coffee, rent], "y");
    assert.equal(first.kind, "confirmed");
    assert.deepEqual(first.kind === "confirmed" ? first.rest : null, [rent]);

    const second = answerProposal(first.kind === "confirmed" ? first.rest : [], "n");
    assert.deepEqual(second, { kind: "declined", proposal: rent, rest: [] });
  });

  test("answering the first leaves the second untouched", () => {
    const pending = [coffee, rent];
    answerProposal(pending, "y");
    assert.deepEqual(pending, [coffee, rent], "the queue is not mutated");
  });
});
