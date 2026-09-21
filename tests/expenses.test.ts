import assert from "node:assert/strict";
import test, { describe } from "node:test";

import {
  addPurchase,
  emptyLedger,
  ledgerTotal,
  monthKey,
  removePurchase,
} from "../src/config/expenses.js";

describe("monthKey", () => {
  test("is the local-time year and month, zero padded", () => {
    assert.equal(monthKey(new Date(2026, 8, 20, 12, 0)), "2026-09");
    assert.equal(monthKey(new Date(2026, 0, 1, 0, 0)), "2026-01");
    assert.equal(monthKey(new Date(2026, 11, 31, 23, 59)), "2026-12");
  });

  test("rolls over at a month and a year boundary", () => {
    assert.equal(monthKey(new Date(2026, 8, 30, 23, 59)), "2026-09");
    assert.equal(monthKey(new Date(2026, 9, 1, 0, 0)), "2026-10");
    assert.equal(monthKey(new Date(2027, 0, 1, 0, 0)), "2027-01");
  });
});

describe("ledgerTotal", () => {
  test("an empty ledger has spent nothing", () => {
    assert.equal(ledgerTotal(emptyLedger("2026-09", "MAD")), 0);
  });

  test("sums every purchase", () => {
    const now = new Date(2026, 8, 20);
    const one = addPurchase(emptyLedger("2026-09", "MAD"), 400, "rent", now).ledger;
    const two = addPurchase(one, 30.5, "coffee", now).ledger;
    assert.equal(ledgerTotal(two), 430.5);
  });
});

describe("addPurchase", () => {
  test("appends, stamps the time, and trims the label", () => {
    const now = new Date(2026, 8, 20, 10, 30);
    const { ledger, purchase } = addPurchase(emptyLedger("2026-09", "MAD"), 30, "  coffee  ", now);

    assert.equal(ledger.purchases.length, 1);
    assert.equal(purchase.label, "coffee");
    assert.equal(purchase.amount, 30);
    assert.equal(purchase.at, now.toISOString());
    assert.ok(purchase.id.length > 0, "a purchase needs an id to be removable");
    assert.deepEqual(ledger.purchases[0], purchase);
  });

  test("does not mutate the ledger it was given", () => {
    const before = emptyLedger("2026-09", "MAD");
    addPurchase(before, 30, "coffee", new Date(2026, 8, 20));
    assert.equal(before.purchases.length, 0);
  });

  test("gives each purchase its own id", () => {
    const now = new Date(2026, 8, 20);
    const one = addPurchase(emptyLedger("2026-09", "MAD"), 30, "coffee", now);
    const two = addPurchase(one.ledger, 30, "coffee", now);
    assert.notEqual(one.purchase.id, two.purchase.id);
  });
});

describe("removePurchase", () => {
  test("removes by id and hands back what went", () => {
    const now = new Date(2026, 8, 20);
    const { ledger, purchase } = addPurchase(emptyLedger("2026-09", "MAD"), 30, "coffee", now);
    const { ledger: after, removed } = removePurchase(ledger, purchase.id);

    assert.deepEqual(removed, purchase);
    assert.equal(after.purchases.length, 0);
  });

  test("an unknown id changes nothing", () => {
    const now = new Date(2026, 8, 20);
    const { ledger } = addPurchase(emptyLedger("2026-09", "MAD"), 30, "coffee", now);
    const { ledger: after, removed } = removePurchase(ledger, "nope");

    assert.equal(removed, null);
    assert.deepEqual(after.purchases, ledger.purchases);
  });

  test("leaves the other purchases alone", () => {
    const now = new Date(2026, 8, 20);
    const one = addPurchase(emptyLedger("2026-09", "MAD"), 400, "rent", now);
    const two = addPurchase(one.ledger, 30, "coffee", now);
    const { ledger: after } = removePurchase(two.ledger, one.purchase.id);

    assert.equal(after.purchases.length, 1);
    assert.equal(after.purchases[0]?.label, "coffee");
  });
});
