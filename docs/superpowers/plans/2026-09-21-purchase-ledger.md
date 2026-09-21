# Purchase Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record purchases the user mentions in conversation to a per-month file, gated by a yes/no confirmation, and brief the model with that month's spending on every turn.

**Architecture:** A new `src/config/expenses.ts` holds the ledger — pure functions over a `Ledger` value, plus a thin persistence shell, mirroring how `src/config/profile.ts` is built. A `recordPurchase` tool proposes rather than writes; proposals ride back on the `generateText` result, the UI asks y/n using the pattern `use-reset-flow.ts` already establishes, and the write happens in the UI on "y". The briefing and the opening greeting both read the ledger.

**Tech Stack:** TypeScript (NodeNext, strict + `noUncheckedIndexedAccess` + `noPropertyAccessFromIndexSignature`), Node 22+ built-ins, `ai` v7 + `@ai-sdk/anthropic`, `zod` v4, `ink` + React for the UI, `node:test` via `tsx` for tests.

**Spec:** `docs/superpowers/specs/2026-09-21-purchase-ledger-design.md`

## Global Constraints

- **Node >= 22.** `package.json` `engines` requires it. `randomUUID` from `node:crypto` and `Array.prototype.at` are available.
- **ESM, NodeNext resolution.** Every relative import MUST carry a `.js` extension, even from a `.ts` source. `verbatimModuleSyntax` is on: type-only imports MUST use `import type`.
- **`noUncheckedIndexedAccess` is on.** Indexing an array or record yields `T | undefined`. Destructuring `const [first, ...rest] = arr` gives `first: T | undefined`.
- **`noPropertyAccessFromIndexSignature` is on.** On a `Record<string, unknown>`, write `record["key"]`, never `record.key`.
- **`noUnusedLocals` / `noUnusedParameters` are on.** An unused import fails `npm run typecheck`.
- **Currency formatting always goes through `formatMoney(amount, currency)`** from `src/config/profile.ts`. Never hand-format an amount.
- **Filenames are `YYYY-MM.json`** — year first. Verbatim from the spec.
- **`ToolSet` is NOT exported from `ai`.** Do not try to import it. Let TypeScript infer tool-object types.
- **Test runner:** `npm test` runs all tests. A single file: `npx tsx --test tests/<name>.test.ts`.

### Before Task 1: the repo has no commits

`git log` is empty and every file is untracked. The commit steps below assume a repo with history. **Before Task 1's commit step, ask the user whether to make an initial commit of the existing codebase first.** Do not create an initial commit unilaterally.

### Two deviations from the spec, decided during planning

1. **`buildTools` requires a `Profile`; it is never called with `null`.** The spec said `buildTools(null)` returns only `readClock`. Returning two different object shapes makes the return type a union, which `generateText`'s `TOOLS extends ToolSet` generic infers badly, and `ToolSet` is not exported so the union cannot be annotated away. The agent is never run without a profile anyway — `src/ui/app.tsx` renders `<Onboarding>` instead of the chat UI whenever `profile === null`. So `runAgent` now takes a `Profile`, and `useAgent` guards defensively. `buildAgentMessages` keeps its `null` handling and its existing test.
2. **A malformed purchase inside an otherwise valid file is dropped individually**, rather than discarding the whole file. The spec's wording was ambiguous; keeping the good rows loses less of the user's money history.

---

### Task 1: Ledger core — the pure functions

**Files:**
- Create: `src/config/expenses.ts`
- Test: `tests/expenses.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `interface Purchase { id: string; amount: number; label: string; at: string }`; `interface Ledger { version: 1; month: string; currency: string; purchases: Purchase[] }`; `monthKey(now: Date): string`; `emptyLedger(month: string, currency: string): Ledger`; `ledgerTotal(ledger: Ledger): number`; `addPurchase(ledger: Ledger, amount: number, label: string, now: Date): { ledger: Ledger; purchase: Purchase }`; `removePurchase(ledger: Ledger, id: string): { ledger: Ledger; removed: Purchase | null }`.

- [ ] **Step 1: Write the failing test**

Create `tests/expenses.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test tests/expenses.test.ts`
Expected: FAIL — `Cannot find module '../src/config/expenses.js'`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/config/expenses.ts`:

```ts
/** What was bought this month: one file per calendar month, beside the profile. */

import { randomUUID } from "node:crypto";

export interface Purchase {
  /** Short id, unique within the file. What removePurchase takes. */
  id: string;
  amount: number;
  label: string;
  /** ISO-8601, when it was recorded. */
  at: string;
}

export interface Ledger {
  version: 1;
  /** "2026-09" — the month this file covers. */
  month: string;
  /** The currency its amounts are in, fixed when the file is created. */
  currency: string;
  purchases: Purchase[];
}

/** "2026-09" for the month `now` falls in, in local time. */
export function monthKey(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** A month with nothing spent in it yet. */
export function emptyLedger(month: string, currency: string): Ledger {
  return { version: 1, month, currency, purchases: [] };
}

export function ledgerTotal(ledger: Ledger): number {
  return ledger.purchases.reduce((total, purchase) => total + purchase.amount, 0);
}

/** The ledger with one more purchase in it. Never mutates what it is given. */
export function addPurchase(
  ledger: Ledger,
  amount: number,
  label: string,
  now: Date,
): { ledger: Ledger; purchase: Purchase } {
  const purchase: Purchase = {
    id: randomUUID().slice(0, 8),
    amount,
    label: label.trim(),
    at: now.toISOString(),
  };
  return { ledger: { ...ledger, purchases: [...ledger.purchases, purchase] }, purchase };
}

/** The ledger without `id`, and what was taken out — null when there was no such id. */
export function removePurchase(
  ledger: Ledger,
  id: string,
): { ledger: Ledger; removed: Purchase | null } {
  const removed = ledger.purchases.find((purchase) => purchase.id === id) ?? null;
  if (removed === null) return { ledger, removed: null };
  return {
    ledger: { ...ledger, purchases: ledger.purchases.filter((purchase) => purchase.id !== id) },
    removed,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test tests/expenses.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: only the pre-existing `scripts/preview-hero.tsx(9,22): error TS2307` about a missing `Hero.js`. **That error predates this work — ignore it, but do not introduce any others.**

- [ ] **Step 6: Commit**

```bash
git add src/config/expenses.ts tests/expenses.test.ts
git commit -m "feat: add the purchase ledger core"
```

---

### Task 2: Ledger persistence

**Files:**
- Modify: `src/config/expenses.ts` (add imports and the IO section at the end)
- Test: `tests/expenses.test.ts` (append)

**Interfaces:**
- Consumes: Task 1's `Purchase`, `Ledger`, `emptyLedger`. `profileDir()` from `src/config/profile.ts`.
- Produces: `ledgerPath(month: string, dir?: string): string`; `loadLedger(month: string, currency: string, dir?: string): Promise<Ledger>`; `saveLedger(ledger: Ledger, dir?: string): Promise<void>`.

- [ ] **Step 1: Write the failing test**

Append to `tests/expenses.test.ts`, and extend the existing import from `../src/config/expenses.js` to also pull in `ledgerPath`, `loadLedger`, `saveLedger`:

```ts
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test tests/expenses.test.ts`
Expected: FAIL — `ledgerPath`, `loadLedger`, `saveLedger` are not exported.

- [ ] **Step 3: Write the minimal implementation**

In `src/config/expenses.ts`, add to the imports at the top:

```ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { profileDir } from "./profile.js";
```

Then append to the end of the file:

```ts
/** Where a month's ledger lives. `profileDir()` is monsa's one directory. */
export function ledgerPath(month: string, dir: string = profileDir()): string {
  return path.join(dir, `${month}.json`);
}

function readPurchase(value: unknown): Purchase | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const id = record["id"];
  const amount = record["amount"];
  const label = record["label"];
  const at = record["at"];
  if (typeof id !== "string" || id === "") return null;
  if (typeof amount !== "number" || !Number.isFinite(amount)) return null;
  if (typeof label !== "string") return null;
  if (typeof at !== "string") return null;
  return { id, amount, label, at };
}

/**
 * Whatever was in the file, made safe. A row that does not parse is dropped;
 * the rest of the month survives it.
 */
function toLedger(value: unknown, month: string, fallbackCurrency: string): Ledger {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return emptyLedger(month, fallbackCurrency);
  }
  const record = value as Record<string, unknown>;
  const stored = record["currency"];
  const currency =
    typeof stored === "string" && stored.trim() !== "" ? stored : fallbackCurrency;
  const rows = record["purchases"];
  const purchases = Array.isArray(rows)
    ? rows.map(readPurchase).filter((purchase): purchase is Purchase => purchase !== null)
    : [];
  return { version: 1, month, currency, purchases };
}

/**
 * The month's ledger. A missing, unreadable, or malformed file all read as an
 * empty month — this is a first purchase, not an error.
 *
 * `currency` is used only when there is no file to read. An existing file keeps
 * the currency it was written with, so amounts never silently change units.
 */
export async function loadLedger(
  month: string,
  currency: string,
  dir: string = profileDir(),
): Promise<Ledger> {
  let contents: string;
  try {
    contents = await readFile(ledgerPath(month, dir), "utf8");
  } catch {
    return emptyLedger(month, currency);
  }
  try {
    return toLedger(JSON.parse(contents), month, currency);
  } catch {
    return emptyLedger(month, currency);
  }
}

/** Write the month's ledger, creating its directory on the way. */
export async function saveLedger(ledger: Ledger, dir: string = profileDir()): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(
    ledgerPath(ledger.month, dir),
    `${JSON.stringify(ledger, null, 2)}\n`,
    "utf8",
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test tests/expenses.test.ts`
Expected: PASS, 19 tests.

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck` (only the pre-existing Hero error), then:

```bash
git add src/config/expenses.ts tests/expenses.test.ts
git commit -m "feat: persist the ledger one file per month"
```

---

### Task 3: The briefing reads the ledger

**Files:**
- Modify: `src/agent/context/briefing.ts`
- Test: `tests/context.test.ts`

**Interfaces:**
- Consumes: `Ledger`, `ledgerTotal`, `emptyLedger`, `addPurchase` from Task 1.
- Produces: `profileBriefing(profile: Profile, ledger: Ledger, now: Date): string`; `buildAgentMessages(profile: Profile | null, ledger: Ledger | null, history: ModelMessage[], userInput: string, now?: Date): ModelMessage[]`.

**Note:** `buildAgentMessages` gains `ledger` as its **second** parameter. Every existing call site and test must be updated.

- [ ] **Step 1: Write the failing test**

Rewrite `tests/context.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test tests/context.test.ts`
Expected: FAIL — `profileBriefing` takes 2 arguments, not 3.

- [ ] **Step 3: Write the minimal implementation**

Replace `src/agent/context/briefing.ts` entirely:

```ts
/** What the model is told about the person it is budgeting for. */

import type { ModelMessage } from "ai";

import { formatMoney } from "../../config/profile.js";
import type { Profile } from "../../config/profile.js";
import { ledgerTotal } from "../../config/expenses.js";
import type { Ledger } from "../../config/expenses.js";
import { daysLeftInMonth } from "../../ui/lib/greeting.js";

/** One purchase as a briefing line, id last so it is easy to quote back. */
function purchaseLine(
  purchase: Ledger["purchases"][number],
  currency: string,
): string {
  const day = purchase.at.slice(0, 10);
  return `  ${day}  ${formatMoney(purchase.amount, currency)}  ${purchase.label}  [${purchase.id}]`;
}

/**
 * The profile and this month's spending as a system message. Rebuilt each turn
 * so neither the date nor the totals it states can go stale in a long session.
 */
export function profileBriefing(profile: Profile, ledger: Ledger, now: Date): string {
  const days = daysLeftInMonth(now);
  const month = now.toLocaleString("en-US", { month: "long" });
  const today = now.toLocaleDateString("en-CA");

  const head = [
    `You are budgeting for ${profile.name}.`,
    `Their monthly budget is ${formatMoney(profile.monthlyBudget, profile.currency)}, and amounts you quote should be in ${profile.currency}.`,
    `Today is ${today}, with ${days} days left in ${month} counting today.`,
  ].join(" ");

  if (ledger.purchases.length === 0) {
    return `${head} No spending has been recorded yet, so treat the whole budget as still available and say so rather than inventing expenses.`;
  }

  const spent = ledgerTotal(ledger);
  const left = profile.monthlyBudget - spent;
  const mismatch =
    ledger.currency === profile.currency
      ? ""
      : ` These purchases were recorded in ${ledger.currency}, which is not the profile currency ${profile.currency}; say so rather than converting between them.`;

  return [
    head,
    `Spent so far this month: ${formatMoney(spent, ledger.currency)} of ${formatMoney(profile.monthlyBudget, profile.currency)}. ${formatMoney(left, profile.currency)} left, about ${formatMoney(left / days, profile.currency)} a day.${mismatch}`,
    "Purchases this month, oldest first:",
    ...ledger.purchases.map((purchase) => purchaseLine(purchase, ledger.currency)),
    "To undo one, call removePurchase with the id in brackets.",
  ].join("\n");
}

/**
 * The turn to send: a fresh briefing, the conversation so far, and the new
 * input. Any system message from earlier turns is dropped so the briefing is
 * the only one, and always current.
 */
export function buildAgentMessages(
  profile: Profile | null,
  ledger: Ledger | null,
  history: ModelMessage[],
  userInput: string,
  now: Date = new Date(),
): ModelMessage[] {
  const conversation = history.filter((message) => message.role !== "system");
  const briefing: ModelMessage[] =
    profile === null || ledger === null
      ? []
      : [{ role: "system", content: profileBriefing(profile, ledger, now) }];

  return [...briefing, ...conversation, { role: "user", content: userInput }];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test tests/context.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Fix the other caller**

`tests/agent.test.ts` calls `buildAgentMessages(profile, [], "how much do I have?", new Date(2026, 8, 20))`. Add the ledger as the second argument and import it:

```ts
import { emptyLedger } from "../src/config/expenses.js";
```

```ts
const messages = buildAgentMessages(
  profile,
  emptyLedger("2026-09", "MAD"),
  [],
  "how much do I have?",
  new Date(2026, 8, 20),
);
```

- [ ] **Step 6: Run the whole suite and commit**

Run: `npm test`
Expected: PASS. `tests/agent.test.ts` still passes because an empty ledger produces the same briefing text its assertions match.

```bash
git add src/agent/context/briefing.ts tests/context.test.ts tests/agent.test.ts
git commit -m "feat: brief the model with this month's spending"
```

---

### Task 4: The greeting subtracts what has been spent

**Files:**
- Modify: `src/ui/lib/greeting.ts`
- Test: `tests/greeting.test.ts`

**Interfaces:**
- Consumes: `Ledger`, `ledgerTotal`, `emptyLedger`, `addPurchase` from Task 1.
- Produces: `greeting(profile: Profile, ledger: Ledger, now: Date): Greeting`. `daysLeftInMonth` is unchanged — Task 3's briefing imports it.

- [ ] **Step 1: Write the failing test**

In `tests/greeting.test.ts`, add the imports and a shared empty ledger, pass it to all six existing calls, and add one new test:

```ts
import { addPurchase, emptyLedger } from "../src/config/expenses.js";

const nothingSpent = emptyLedger("2026-09", "MAD");
```

Update the existing calls — `greeting(salah, nothingSpent, new Date(...))` — in all six tests, then append:

```ts
test("what is left is the budget minus what has been spent", () => {
  const { ledger } = addPurchase(nothingSpent, 430, "rent and coffee", new Date(2026, 8, 3));
  const { summary } = greeting(salah, ledger, new Date(2026, 8, 20, 9, 30));
  assert.equal(summary, "Hey Salah — 3,570 MAD left for September, 11 days to go.");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test tests/greeting.test.ts`
Expected: FAIL — `greeting` takes 2 arguments, not 3.

- [ ] **Step 3: Write the minimal implementation**

In `src/ui/lib/greeting.ts`, add the imports:

```ts
import { ledgerTotal } from "../../config/expenses.js";
import type { Ledger } from "../../config/expenses.js";
```

and replace `greeting`:

```ts
/** What is left this month: the budget, less everything recorded against it. */
export function greeting(profile: Profile, ledger: Ledger, now: Date): Greeting {
  const days = daysLeftInMonth(now);
  const month = now.toLocaleString("en-US", { month: "long" });
  const left = profile.monthlyBudget - ledgerTotal(ledger);

  return {
    summary:
      `Hey ${profile.name} — ${formatMoney(left, profile.currency)} left ` +
      `for ${month}, ${days} ${days === 1 ? "day" : "days"} to go.`,
    question: "What do you want to do?",
  };
}
```

Delete the now-wrong doc comment above it (`/** Nothing records spending yet, so "left" is the whole monthly budget. */`).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test tests/greeting.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/lib/greeting.ts tests/greeting.test.ts
git commit -m "feat: open with what is actually left this month"
```

---

### Task 5: The purchase tools

**Files:**
- Create: `src/agent/tools/purchases.ts`
- Modify: `src/agent/tools/index.ts`

**Interfaces:**
- Consumes: `loadLedger`, `saveLedger`, `monthKey`, `ledgerTotal`, `removePurchase` from Tasks 1–2. `Profile`, `formatMoney` from `src/config/profile.ts`.
- Produces: `purchaseProposalSchema` (a zod object with `amount: number`, `label: string`); `type PurchaseProposal = { amount: number; label: string }`; `buildPurchaseTools(profile: Profile)`; `buildTools(profile: Profile)` from `src/agent/tools/index.ts`.

**No test.** These are thin wrappers over functions already tested in Tasks 1–2, and the repo has no harness for exercising `ai` tools. Task 6 covers the proposal plumbing; Task 8 verifies the tools end to end by hand.

- [ ] **Step 1: Write the tools**

Create `src/agent/tools/purchases.ts`:

```ts
/** Recording what was bought. Adding is proposed and confirmed; removing is immediate. */

import { tool } from "ai";
import { z } from "zod";

import {
  ledgerTotal,
  loadLedger,
  monthKey,
  removePurchase as removeFromLedger,
  saveLedger,
} from "../../config/expenses.js";
import { formatMoney } from "../../config/profile.js";
import type { Profile } from "../../config/profile.js";

/** What the model proposes buying. Also used to re-validate the call in run.ts. */
export const purchaseProposalSchema = z.object({
  amount: z.number().positive(),
  label: z.string().min(1),
});

export type PurchaseProposal = z.infer<typeof purchaseProposalSchema>;

/** "Spent X of Y this month; Z left." */
function standing(spent: number, profile: Profile): string {
  const left = profile.monthlyBudget - spent;
  return (
    `Spent ${formatMoney(spent, profile.currency)} of ` +
    `${formatMoney(profile.monthlyBudget, profile.currency)} this month; ` +
    `${formatMoney(left, profile.currency)} left.`
  );
}

export function buildPurchaseTools(profile: Profile) {
  return {
    recordPurchase: tool({
      description:
        "Propose recording a purchase the user mentioned. This does NOT save it. " +
        "The user is asked to confirm first, and may decline. Call this once per " +
        "distinct purchase.",
      inputSchema: purchaseProposalSchema,
      execute: ({ amount, label }: PurchaseProposal) =>
        `Proposed ${label}, ${formatMoney(amount, profile.currency)} — NOT saved yet, ` +
        `awaiting the user's confirmation. Do not tell them it is recorded.`,
    }),

    removePurchase: tool({
      description:
        "Remove a purchase already recorded this month, by the id shown in " +
        "square brackets in the briefing. Takes effect immediately.",
      inputSchema: z.object({ id: z.string().min(1) }),
      execute: async ({ id }: { id: string }) => {
        const month = monthKey(new Date());
        const ledger = await loadLedger(month, profile.currency);
        const { ledger: after, removed } = removeFromLedger(ledger, id);
        if (removed === null) return `No purchase this month has the id ${id}. Nothing changed.`;
        await saveLedger(after);
        return (
          `Removed ${removed.label}, ${formatMoney(removed.amount, ledger.currency)}. ` +
          standing(ledgerTotal(after), profile)
        );
      },
    }),
  };
}
```

- [ ] **Step 2: Register them**

Replace `src/agent/tools/index.ts`:

```ts
import { readClock } from "./clock.js";
import { buildPurchaseTools } from "./purchases.js";
import type { Profile } from "../../config/profile.js";

/**
 * Every tool the agent can call, keyed by the name the model sees. A profile is
 * required: the money tools need a currency and a budget, and the agent is
 * never run before onboarding finishes.
 */
export function buildTools(profile: Profile) {
  return { readClock, ...buildPurchaseTools(profile) };
}

export { readClock };
export { purchaseProposalSchema } from "./purchases.js";
export type { PurchaseProposal } from "./purchases.js";
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: `src/agent/run.ts` now errors — it still imports the deleted `tools` constant. That is Task 6's job. Confirm the only *new* errors are in `run.ts`, plus the pre-existing Hero error.

- [ ] **Step 4: Commit**

```bash
git add src/agent/tools/purchases.ts src/agent/tools/index.ts
git commit -m "feat: add recordPurchase and removePurchase tools"
```

---

### Task 6: runAgent returns proposals

**Files:**
- Modify: `src/agent/run.ts`
- Test: `tests/agent.test.ts`

**Interfaces:**
- Consumes: `buildTools`, `purchaseProposalSchema`, `PurchaseProposal` from Task 5.
- Produces: `runAgent(options: { profile: Profile; messages: ModelMessage[]; maxSteps?: number }): Promise<{ text: string; proposals: PurchaseProposal[] }>`.

`GenerateTextResult.toolCalls` is documented in the installed `ai` v7 types as "the tool calls that were made in **all steps**", so there is no need to walk `steps`. Each entry carries `toolName` and `input`.

- [ ] **Step 1: Write the failing test**

In `tests/agent.test.ts`, change `captureRequest`'s type parameter so it no longer assumes a string. Replace its signature and the `text` handling:

```ts
async function captureRequest<T>(run: () => Promise<T>): Promise<{
  body: CapturedBody;
  result: T;
}> {
```

and at the end of that function:

```ts
  try {
    const result = await run();
    return { body, result };
  } finally {
    globalThis.fetch = realFetch;
  }
```

Then update the existing test's call and its final assertion:

```ts
const { body, result } = await captureRequest(() =>
  runAgent({ profile, messages }),
);
```

```ts
assert.equal(result.text, "You have 4,000 MAD for September.");
assert.deepEqual(result.proposals, [], "a plain answer proposes nothing");
```

Append a new test inside the `describe("runAgent")` block:

```ts
test("a recordPurchase call comes back as a proposal, and nothing is written", async () => {
  const profile = createProfile("Salah", 4000, "MAD");
  const messages = buildAgentMessages(
    profile,
    emptyLedger("2026-09", "MAD"),
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
  } finally {
    globalThis.fetch = realFetch;
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test tests/agent.test.ts`
Expected: FAIL — `runAgent` returns a string and does not accept `profile`.

- [ ] **Step 3: Write the minimal implementation**

Replace `src/agent/run.ts`:

```ts
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText, stepCountIs } from "ai";
import type { ModelMessage } from "ai";

import { env } from "../config/env.js";
import type { Profile } from "../config/profile.js";
import { MODEL, PERSONA } from "../constants/index.js";
import { buildTools, purchaseProposalSchema } from "./tools/index.js";
import type { PurchaseProposal } from "./tools/index.js";

const anthropic = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY });

export type RunAgentOptions = {
  profile: Profile;
  messages: ModelMessage[];
  maxSteps?: number;
};

export type AgentTurn = {
  text: string;
  /** Purchases the model asked to record. Nothing is saved until the user agrees. */
  proposals: PurchaseProposal[];
};

export async function runAgent({
  profile,
  messages,
  maxSteps = 10,
}: RunAgentOptions): Promise<AgentTurn> {
  const briefings = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content);
  const conversation = messages.filter((message) => message.role !== "system");

  const result = await generateText({
    model: anthropic(MODEL),
    instructions: [PERSONA, ...briefings].join("\n\n"),
    messages: conversation,
    tools: buildTools(profile),
    stopWhen: stepCountIs(maxSteps),
  });

  const proposals = result.toolCalls
    .filter((call) => call.toolName === "recordPurchase")
    .flatMap((call) => {
      const parsed = purchaseProposalSchema.safeParse(call.input);
      return parsed.success ? [parsed.data] : [];
    });

  return { text: result.text, proposals };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test tests/agent.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`
Expected: `src/ui/hooks/use-agent.ts` now errors — Task 8's job. Plus the pre-existing Hero error.

```bash
git add src/agent/run.ts tests/agent.test.ts
git commit -m "feat: carry purchase proposals back from a turn"
```

---

### Task 7: The confirmation queue

**Files:**
- Create: `src/ui/lib/purchase-queue.ts`
- Test: `tests/purchase-flow.test.ts`

**Interfaces:**
- Consumes: `PurchaseProposal` from Task 5. `parseConfirmation` from `src/ui/lib/commands.ts`. `formatMoney` from `src/config/profile.ts`.
- Produces: `type QueueAnswer`; `answerProposal(pending: readonly PurchaseProposal[], input: string): QueueAnswer`; `purchaseQuestion(proposal: PurchaseProposal, currency: string): string`.

This is the decision logic of the gate, kept separate from React so it can be tested directly. The repo has no React test harness, so the hook in Task 8 stays as thin as possible over this.

- [ ] **Step 1: Write the failing test**

Create `tests/purchase-flow.test.ts`:

```ts
import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { answerProposal, purchaseQuestion } from "../src/ui/lib/purchase-queue.js";
import type { PurchaseProposal } from "../src/agent/tools/index.js";

const coffee: PurchaseProposal = { amount: 30, label: "coffee" };
const rent: PurchaseProposal = { amount: 400, label: "rent share" };

describe("purchaseQuestion", () => {
  test("names the purchase and its cost", () => {
    assert.equal(purchaseQuestion(coffee, "MAD"), "Record coffee, 30 MAD? (y/n)");
  });

  test("uses the symbol when the currency has one", () => {
    assert.equal(purchaseQuestion(coffee, "USD"), "Record coffee, $30? (y/n)");
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test tests/purchase-flow.test.ts`
Expected: FAIL — `Cannot find module '../src/ui/lib/purchase-queue.js'`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/ui/lib/purchase-queue.ts`:

```ts
/** The gate in front of the ledger: nothing is written until the user says yes. */

import { formatMoney } from "../../config/profile.js";
import type { PurchaseProposal } from "../../agent/tools/index.js";
import { parseConfirmation } from "./commands.js";

export type QueueAnswer =
  | { kind: "none" }
  | { kind: "confirmed"; proposal: PurchaseProposal; rest: PurchaseProposal[] }
  | { kind: "declined"; proposal: PurchaseProposal; rest: PurchaseProposal[] };

/** The question put to the user before a purchase is saved. */
export function purchaseQuestion(proposal: PurchaseProposal, currency: string): string {
  return `Record ${proposal.label}, ${formatMoney(proposal.amount, currency)}? (y/n)`;
}

/**
 * What the next input does to the queue. `none` means nothing was pending and
 * the input belongs to the agent. Anything unclear counts as a no, the same way
 * `/reset` treats it.
 */
export function answerProposal(
  pending: readonly PurchaseProposal[],
  input: string,
): QueueAnswer {
  const [proposal, ...rest] = pending;
  if (proposal === undefined) return { kind: "none" };
  return parseConfirmation(input)
    ? { kind: "confirmed", proposal, rest }
    : { kind: "declined", proposal, rest };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test tests/purchase-flow.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/lib/purchase-queue.ts tests/purchase-flow.test.ts
git commit -m "feat: add the purchase confirmation queue"
```

---

### Task 8: Wire the gate into the UI

**Files:**
- Create: `src/ui/hooks/use-ledger.ts`
- Create: `src/ui/hooks/use-purchase-flow.ts`
- Modify: `src/ui/hooks/use-agent.ts`
- Modify: `src/ui/app.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1–7.
- Produces: `useLedger(profile: Profile | null): { ledger: Ledger | null; reload: () => void }`; `usePurchaseFlow(profile: Profile | null, onSaved: () => void): { isConfirming: boolean; question: string | null; notice: string | null; enqueue: (proposals: PurchaseProposal[]) => void; handleInput: (value: string) => boolean }`.

**No automated test.** The repo has no React/ink test harness — `use-reset-flow.ts` is likewise untested. The decision logic is already covered by Task 7; Step 6 below is a manual check.

- [ ] **Step 1: The ledger hook**

Create `src/ui/hooks/use-ledger.ts`:

```ts
import { useCallback, useEffect, useState } from "react";

import { loadLedger, monthKey } from "../../config/expenses.js";
import type { Ledger } from "../../config/expenses.js";
import type { Profile } from "../../config/profile.js";

/** This month's ledger, for the opening line. Reloaded when a purchase lands. */
export function useLedger(profile: Profile | null): {
  ledger: Ledger | null;
  reload: () => void;
} {
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [tick, setTick] = useState(0);

  const currency = profile?.currency ?? null;

  useEffect(() => {
    if (currency === null) return;
    let cancelled = false;
    void loadLedger(monthKey(new Date()), currency).then((loaded) => {
      if (!cancelled) setLedger(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [currency, tick]);

  const reload = useCallback(() => setTick((value) => value + 1), []);

  return { ledger, reload };
}
```

- [ ] **Step 2: The confirmation hook**

Create `src/ui/hooks/use-purchase-flow.ts`, modelled on `use-reset-flow.ts`:

```ts
import { useCallback, useState } from "react";

import {
  addPurchase,
  loadLedger,
  ledgerTotal,
  monthKey,
  saveLedger,
} from "../../config/expenses.js";
import { formatMoney } from "../../config/profile.js";
import type { Profile } from "../../config/profile.js";
import type { PurchaseProposal } from "../../agent/tools/index.js";
import { answerProposal, purchaseQuestion } from "../lib/purchase-queue.js";

export type UsePurchaseFlowResult = {
  /** Whether the next input answers "record this purchase?" rather than the agent. */
  isConfirming: boolean;
  question: string | null;
  notice: string | null;
  enqueue: (proposals: PurchaseProposal[]) => void;
  /** Handles the input if it belongs to this flow; `false` means pass it on. */
  handleInput: (value: string) => boolean;
};

/** Ask before writing: a proposed purchase reaches the file only on a yes. */
export function usePurchaseFlow(
  profile: Profile | null,
  onSaved: () => void,
): UsePurchaseFlowResult {
  const [pending, setPending] = useState<PurchaseProposal[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const save = useCallback(
    async (proposal: PurchaseProposal, currency: string, budget: number) => {
      const month = monthKey(new Date());
      const ledger = await loadLedger(month, currency);
      const { ledger: after } = addPurchase(ledger, proposal.amount, proposal.label, new Date());
      await saveLedger(after);
      const left = budget - ledgerTotal(after);
      setNotice(`Recorded ${proposal.label} — ${formatMoney(left, currency)} left.`);
      onSaved();
    },
    [onSaved],
  );

  const handleInput = useCallback(
    (value: string) => {
      const answer = answerProposal(pending, value);
      if (answer.kind === "none") return false;

      setPending(answer.rest);

      if (answer.kind === "declined" || profile === null) {
        setNotice(`Skipped ${answer.proposal.label}.`);
        return true;
      }

      setNotice(null);
      void save(answer.proposal, profile.currency, profile.monthlyBudget).catch(
        (cause: unknown) => {
          const reason = cause instanceof Error ? cause.message : "unknown error";
          setNotice(`Could not record ${answer.proposal.label}: ${reason}`);
        },
      );
      return true;
    },
    [pending, profile, save],
  );

  const enqueue = useCallback((proposals: PurchaseProposal[]) => {
    if (proposals.length > 0) setNotice(null);
    setPending((current) => [...current, ...proposals]);
  }, []);

  const next = pending[0];

  return {
    isConfirming: next !== undefined,
    question:
      next === undefined || profile === null
        ? null
        : purchaseQuestion(next, profile.currency),
    notice,
    enqueue,
    handleInput,
  };
}
```

- [ ] **Step 3: Feed proposals out of the agent turn**

In `src/ui/hooks/use-agent.ts`:

Add the imports:

```ts
import { loadLedger, monthKey } from "../../config/expenses.js";
import type { PurchaseProposal } from "../../agent/tools/index.js";
```

Change the signature to take a proposal sink:

```ts
export function useAgent(
  profile: Profile | null,
  onProposals: (proposals: PurchaseProposal[]) => void,
): UseAgentResult {
```

Replace the body of `handleSubmit` between the exit check and the `catch`:

```ts
      if (profile === null) return;

      const ledger = await loadLedger(monthKey(new Date()), profile.currency);
      const turn = buildAgentMessages(profile, ledger, conversationHistory, userInput);
      setMessages((prev) => [...prev, { role: "user", content: userInput }]);
      setIsLoading(true);
      try {
        const { text: reply, proposals } = await runAgent({ profile, messages: turn });
        setConversationHistory([
          ...turn.filter((message) => message.role !== "system"),
          { role: "assistant", content: reply },
        ]);
        setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
        onProposals(proposals);
      } catch (error) {
```

Add `onProposals` to the `useCallback` dependency array, giving
`[conversationHistory, exit, onProposals, profile]`.

- [ ] **Step 4: Wire the app**

In `src/ui/app.tsx`, add the imports:

```ts
import { useLedger } from "./hooks/use-ledger.js";
import { usePurchaseFlow } from "./hooks/use-purchase-flow.js";
```

Replace the hook block at the top of `App`:

```ts
  const { status, profile, pending, completeOnboarding, resetProfile } = useProfile();
  const { ledger, reload } = useLedger(profile);
  const purchases = usePurchaseFlow(profile, reload);
  const { handleSubmit, messages, isLoading } = useAgent(profile, purchases.enqueue);
  const reset = useResetFlow(resetProfile);

  const onSubmit = (value: string) => {
    if (reset.handleInput(value)) return;
    if (purchases.handleInput(value)) return;
    void handleSubmit(value);
  };
```

Give `Greeting` the ledger — it renders only once the profile is ready, so hold
the opening line back until the ledger has loaded too:

```tsx
        {ledger !== null && <Greeting profile={profile} ledger={ledger} />}
```

And render the question and notice beside the reset flow's:

```tsx
      {reset.isConfirming && (
        <Text color="yellow">Delete {profilePath()}? (y/n)</Text>
      )}
      {reset.notice !== null && <Text dimColor>{reset.notice}</Text>}
      {purchases.question !== null && <Text color="yellow">{purchases.question}</Text>}
      {purchases.notice !== null && <Text dimColor>{purchases.notice}</Text>}
```

- [ ] **Step 5: Update the Greeting component**

In `src/ui/components/Greeting.tsx`, add `ledger` to the props and pass it through:

```ts
import type { Ledger } from "../../config/expenses.js";

interface GreetingProps {
  profile: Profile;
  ledger: Ledger;
  /** Injectable so the opening line can be tested against a fixed date. */
  now?: Date;
}

export function Greeting({ profile, ledger, now = new Date() }: GreetingProps) {
  const { summary, question } = greeting(profile, ledger, now);
```

- [ ] **Step 6: Typecheck, test, and verify by hand**

Run: `npm run typecheck`
Expected: **only** the pre-existing `scripts/preview-hero.tsx` Hero error.

Run: `npm test`
Expected: all tests pass.

Then run the app — `npm run dev` — and walk it through:

1. Type `i bought coffee for 30`. Expect a `Record coffee, 30 MAD? (y/n)` prompt, and **no** file at `~/.monsa/<this-month>.json` yet (or an unchanged one).
2. Answer `n`. Expect `Skipped coffee.` and still no write.
3. Repeat and answer `y`. Expect `Recorded coffee — ... left.` and a `~/.monsa/YYYY-MM.json` containing exactly one purchase.
4. Ask `what did I buy this month?`. Expect the coffee, quoted from the briefing.
5. Ask it to remove that purchase. Expect it gone from the file, no confirmation prompt.
6. Restart the app. Expect the opening line to show the budget minus what survived.

- [ ] **Step 7: Commit**

```bash
git add src/ui/hooks/use-ledger.ts src/ui/hooks/use-purchase-flow.ts \
        src/ui/hooks/use-agent.ts src/ui/app.tsx src/ui/components/Greeting.tsx
git commit -m "feat: ask before recording a purchase"
```

---

## Self-Review

**Spec coverage.** Data model → Task 1. Currency-disagreement rule → Task 2 (two tests). `expenses.ts` module → Tasks 1–2. `purchases.ts` tools → Task 5. Confirmation gate → Tasks 5 (proposal result), 6 (proposals on the result), 7 (decision logic), 8 (queue, write, prompt). Briefing → Task 3. Wiring → Task 8. Testing → Tasks 1–4, 6, 7, plus Task 8's manual walkthrough. Out-of-scope items are absent, as intended.

**One spec test not automated.** The spec listed "a save failure surfaces as a notice rather than throwing". The behaviour is implemented (the `.catch` in Task 8, Step 2) but not covered, because the repo has no React test harness and `use-reset-flow.ts` sets the precedent of leaving hooks untested. Flagged rather than faked.

**Placeholders.** None. Every code step carries the code.

**Type consistency.** `PurchaseProposal` is defined once in Task 5 and re-exported from `src/agent/tools/index.ts`; Tasks 6, 7, and 8 all import it from there. `buildAgentMessages` takes `ledger` second in Task 3 and is called that way in Tasks 3 and 8. `runAgent` returns `{ text, proposals }` in Task 6 and is destructured that way in Task 8. `greeting(profile, ledger, now)` in Task 4 matches the `Greeting` component in Task 8, Step 5. `removePurchase` is imported as `removeFromLedger` in Task 5 to avoid colliding with the tool of the same name.
