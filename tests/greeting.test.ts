import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { addPurchase, emptyLedger } from "../src/config/expenses.js";
import { createProfile } from "../src/config/profile.js";
import { greeting } from "../src/ui/lib/greeting.js";

const salah = createProfile("Salah", 4000, "MAD");
const nothingSpent = emptyLedger("2026-09", "MAD");

describe("greeting", () => {
  test("names the month and what is left of it", () => {
    // 20 September 2026: 11 days to go, counting today.
    const { summary, question } = greeting(salah, nothingSpent, new Date(2026, 8, 20, 9, 30));
    assert.equal(summary, "Hey Salah — 4,000 MAD left for September, 11 days to go.");
    assert.equal(question, "What do you want to do?");
  });

  test("says nothing about a daily allowance", () => {
    assert.doesNotMatch(greeting(salah, nothingSpent, new Date(2026, 8, 20)).summary, /day\)|\/day/);
  });

  test("the last day of the month still has a day to go", () => {
    const { summary } = greeting(salah, nothingSpent, new Date(2026, 8, 30, 23, 0));
    assert.equal(summary, "Hey Salah — 4,000 MAD left for September, 1 day to go.");
  });

  test("the first of the month counts the whole month", () => {
    const { summary } = greeting(salah, nothingSpent, new Date(2026, 0, 1));
    assert.match(summary, /left for January, 31 days to go/);
  });

  test("February knows about leap years", () => {
    assert.match(greeting(salah, nothingSpent, new Date(2028, 1, 1)).summary, /29 days to go/);
    assert.match(greeting(salah, nothingSpent, new Date(2027, 1, 1)).summary, /28 days to go/);
  });

  test("a currency with a symbol reads as a symbol", () => {
    const withUsd = createProfile("Salah", 4000, "USD");
    assert.match(greeting(withUsd, nothingSpent, new Date(2026, 8, 20)).summary, /\$4,000 left for September/);
  });

  test("what is left is the budget minus what has been spent", () => {
    const { ledger } = addPurchase(nothingSpent, 430, "rent and coffee", new Date(2026, 8, 3));
    const { summary } = greeting(salah, ledger, new Date(2026, 8, 20, 9, 30));
    assert.equal(summary, "Hey Salah — 3,570 MAD left for September, 11 days to go.");
  });
});
