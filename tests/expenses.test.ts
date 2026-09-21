import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  addPurchase,
  emptyLedger,
  ledgerPath,
  ledgerTotal,
  loadLedger,
  monthKey,
  pace,
  removePurchase,
  saveLedger,
  standing,
} from "../src/config/expenses.js";
import { createProfile } from "../src/config/profile.js";

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

describe("standing", () => {
  test("aligned: reports spent, budget, and what is left in the shared currency", () => {
    const profile = createProfile("Salah", 4000, "MAD");
    const { ledger } = addPurchase(
      emptyLedger("2026-09", "MAD"),
      430,
      "rent and coffee",
      new Date(2026, 8, 3),
    );

    const s = standing(profile, ledger);

    assert.equal(s.kind, "aligned");
    if (s.kind !== "aligned") return;
    assert.equal(s.currency, "MAD");
    assert.equal(s.spent, 430);
    assert.equal(s.budget, 4000);
    assert.equal(s.left, 3570);
  });

  test("mismatched: reports spent and budget in their own currencies, and no remainder", () => {
    const profile = createProfile("Salah", 4000, "EUR");
    const { ledger } = addPurchase(
      emptyLedger("2026-09", "MAD"),
      430,
      "rent and coffee",
      new Date(2026, 8, 3),
    );

    const s = standing(profile, ledger);

    assert.equal(s.kind, "mismatched");
    if (s.kind !== "mismatched") return;
    assert.equal(s.spent, 430);
    assert.equal(s.spentCurrency, "MAD");
    assert.equal(s.budget, 4000);
    assert.equal(s.budgetCurrency, "EUR");
  });

  test("the union genuinely discriminates: a mismatched result carries no left field at all", () => {
    const profile = createProfile("Salah", 4000, "EUR");
    const { ledger } = addPurchase(emptyLedger("2026-09", "MAD"), 430, "rent", new Date(2026, 8, 3));

    const s = standing(profile, ledger);

    // Not just "left is undefined" — the property itself is absent, so a
    // caller cannot read a fabricated remainder off this variant even by
    // mistake. Object.hasOwn checks presence, not truthiness.
    assert.equal(Object.hasOwn(s, "left"), false);
  });
});

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), "monsa-ledger-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function writeRawLedger(dir: string, month: string, contents: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(ledgerPath(month, dir), contents, "utf8");
}

describe("ledgerPath", () => {
  test("is the month, year first, as json", () => {
    assert.equal(path.basename(ledgerPath("2026-09", "/tmp/x")), "2026-09.json");
  });
});

describe("loadLedger and saveLedger", () => {
  test("a saved ledger comes back the same", async () => {
    await withTempDir(async (dir) => {
      const { ledger } = addPurchase(emptyLedger("2026-09", "MAD"), 30, "coffee", new Date());
      await saveLedger(ledger, dir);
      assert.deepEqual(await loadLedger("2026-09", "MAD", dir), ledger);
    });
  });

  test("no file yet means an empty month, not an error", async () => {
    await withTempDir(async (dir) => {
      assert.deepEqual(await loadLedger("2026-09", "MAD", dir), emptyLedger("2026-09", "MAD"));
    });
  });

  test("a corrupt file reads as an empty month", async () => {
    await withTempDir(async (dir) => {
      await writeRawLedger(dir, "2026-09", "{ not json");
      assert.deepEqual(await loadLedger("2026-09", "MAD", dir), emptyLedger("2026-09", "MAD"));
    });
  });

  test("malformed purchases are dropped, the good ones survive", async () => {
    await withTempDir(async (dir) => {
      await writeRawLedger(
        dir,
        "2026-09",
        JSON.stringify({
          version: 1,
          month: "2026-09",
          currency: "MAD",
          purchases: [
            { id: "aaaa1111", amount: 30, label: "coffee", at: "2026-09-12T10:00:00.000Z" },
            { id: "bbbb2222", amount: "lots", label: "rent", at: "2026-09-03T10:00:00.000Z" },
            "not even an object",
          ],
        }),
      );
      const ledger = await loadLedger("2026-09", "MAD", dir);
      assert.equal(ledger.purchases.length, 1);
      assert.equal(ledger.purchases[0]?.label, "coffee");
    });
  });

  test("the file's currency wins over the one passed in", async () => {
    await withTempDir(async (dir) => {
      await saveLedger(emptyLedger("2026-09", "MAD"), dir);
      const ledger = await loadLedger("2026-09", "EUR", dir);
      assert.equal(ledger.currency, "MAD", "an existing file keeps the currency it was written in");
    });
  });

  test("the passed currency is used only when there is no file", async () => {
    await withTempDir(async (dir) => {
      assert.equal((await loadLedger("2026-09", "EUR", dir)).currency, "EUR");
    });
  });

  test("saving creates the directory if it is missing", async () => {
    await withTempDir(async (dir) => {
      const nested = path.join(dir, "deeper");
      await saveLedger(emptyLedger("2026-09", "MAD"), nested);
      assert.deepEqual(await loadLedger("2026-09", "MAD", nested), emptyLedger("2026-09", "MAD"));
    });
  });
});

describe("pace", () => {
  test("counts today as a day already spent in", () => {
    assert.equal(pace(0, new Date(2026, 8, 1, 9, 0)).daysElapsed, 1);
    assert.equal(pace(0, new Date(2026, 8, 12, 9, 0)).daysElapsed, 12);
    assert.equal(pace(0, new Date(2026, 8, 30, 23, 0)).daysElapsed, 30);
  });

  test("averages what was spent over the days it was spent in", () => {
    assert.equal(pace(1200, new Date(2026, 8, 12)).perDaySoFar, 100);
    assert.equal(pace(0, new Date(2026, 8, 12)).perDaySoFar, 0);
  });

  test("the first of the month does not divide by zero", () => {
    const first = pace(500, new Date(2026, 8, 1));
    assert.equal(first.daysElapsed, 1);
    assert.equal(first.perDaySoFar, 500);
    assert.ok(Number.isFinite(first.perDaySoFar));
  });
});
