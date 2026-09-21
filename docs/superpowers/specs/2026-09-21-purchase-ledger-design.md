# Purchase ledger — design

Date: 2026-09-21
Status: approved, not yet implemented

## Problem

monsa presents itself as an agent that manages a monthly budget, but nothing
records spending. Two places in the codebase are placeholders standing in for
this feature:

- `src/agent/context/briefing.ts` tells the model "No spending has been
  recorded yet, so treat the whole budget as still available and say so rather
  than inventing expenses."
- `src/ui/lib/greeting.ts` computes "left" as the entire monthly budget,
  commented "Nothing records spending yet".

The goal: when the user mentions a purchase in conversation, the agent proposes
recording it, the user approves with a keystroke, it lands in a per-month file,
and every subsequent turn is briefed with what has been spent and what remains.

## Scope

In scope:

- A per-month ledger file holding individual purchases.
- Two model-callable tools: propose a purchase, remove one.
- A yes/no confirmation gate before any new purchase reaches the file.
- The current month's ledger injected into the system briefing each turn.
- The opening greeting showing the real remaining figure.

Out of scope (deliberately — revisit only on request):

- Categories and per-category budgets.
- Cross-month history, reports, or comparisons.
- Editing a purchase's amount in place (remove and re-add instead).
- Locking against two monsa processes writing concurrently. Last write wins,
  which is acceptable for one person on one machine.

## Data model

One file per calendar month, beside the existing profile:

    ~/.monsa/config.json     (existing profile)
    ~/.monsa/2026-09.json    (this month's ledger)
    ~/.monsa/2026-10.json    (next month's, created on first purchase)

Filenames are `YYYY-MM` — year first, so months sort chronologically in a
directory listing and match the ISO dates used elsewhere in the codebase.

```ts
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
  /** The profile currency at the time the file was created. */
  currency: string;
  purchases: Purchase[];
}
```

`currency` lives on the file rather than on each purchase. `/reset` lets
someone change their currency mid-month; without this, amounts recorded before
the change become silently ambiguous. Per-purchase currency is not worth the
size — a month is one currency in practice.

`version: 1` matches the versioning `Profile` already carries, leaving room to
add fields (categories) without breaking files already on disk.

### When the file's currency disagrees with the profile

The file's currency is authoritative for that month. `loadLedger`'s `currency`
argument is used **only** when creating a new empty ledger; it never overwrites
the currency of a file that already exists. Amounts recorded in March MAD stay
MAD even if the profile later switches to EUR.

When the two disagree, the briefing states the mismatch explicitly rather than
converting (there are no exchange rates here, and inventing one would be worse
than saying so). A new month starts a new file and picks up the new currency
naturally, so the mismatch is self-healing.

## Module: `src/config/expenses.ts`

Follows `src/config/profile.ts`: same directory helper, same injectable `dir`
parameter for tests, same forgiveness on read. Pure functions and IO are kept
apart, so the interesting logic is testable without touching a filesystem.

Pure:

```ts
/** "2026-09" for the month `now` falls in, in local time. */
export function monthKey(now: Date): string;

/** Total of every purchase in the ledger. */
export function ledgerTotal(ledger: Ledger): number;

/** An empty ledger for a month, used for a missing or unreadable file. */
export function emptyLedger(month: string, currency: string): Ledger;

/** A new ledger with the purchase appended, plus the purchase that was added. */
export function addPurchase(
  ledger: Ledger,
  amount: number,
  label: string,
  now: Date,
): { ledger: Ledger; purchase: Purchase };

/** A new ledger without `id`, plus what was removed (null if no such id). */
export function removePurchase(
  ledger: Ledger,
  id: string,
): { ledger: Ledger; removed: Purchase | null };
```

IO:

```ts
export function ledgerPath(month: string, dir?: string): string;

/** The month's ledger. A missing, unreadable, or malformed file all read as
 *  an empty ledger — this is a first-purchase-of-the-month, not an error. */
export async function loadLedger(
  month: string,
  currency: string,
  dir?: string,
): Promise<Ledger>;

export async function saveLedger(ledger: Ledger, dir?: string): Promise<void>;
```

Ids come from `randomUUID().slice(0, 8)`. Collision risk across the ~dozens of
purchases in a month is negligible, and a short id is easier for the model to
quote back correctly than a full UUID.

Malformed-file handling mirrors `loadProfile`: parse defensively, validate each
purchase, drop the file's contents entirely rather than throw. A corrupt ledger
costs the month's history, but never prevents the agent from starting — the
same trade `loadProfile` already makes.

## Module: `src/agent/tools/purchases.ts`

Two tools, in the style of `src/agent/tools/clock.ts`.

`recordPurchase({ amount: number, label: string })` — **does not write.** It
registers a proposal that the user must approve (see "Confirmation gate"
below). Its result states plainly that nothing has been saved yet:

    Proposed coffee, 30 MAD — NOT saved yet, awaiting the user's confirmation.
    Do not tell them it is recorded.

That wording is load-bearing. If the result merely said "ok", the model would
reply "recorded!" while nothing had reached disk, and the user would trust a
number that does not exist.

`removePurchase({ id: string })` — removes by id and saves **immediately**, no
gate. Returns what was removed and the new total, or says plainly that no
purchase had that id. Removal is not gated because the user has just asked for
it in words; a second prompt is friction on a correction they requested, and a
wrongly-removed purchase can simply be re-added.

Both tools act on the **current month only**, resolved from `new Date()` at
call time. There is no way to record into or amend a past month; that is part
of the cross-month work held out of scope.

`removePurchase` returns the **updated total**, not a bare acknowledgement. The
briefing is rebuilt once per turn, so within a multi-step turn the tool result
is the model's only current view of the numbers.

## Confirmation gate

No new purchase reaches the file without a keystroke. This follows the pattern
`src/ui/hooks/use-reset-flow.ts` already establishes for `/reset`: a hook that
intercepts the next input before the agent sees it, and `parseConfirmation`
from `src/ui/lib/commands.ts`, which already treats anything unclear as a no.

    You: i bought coffee 30
         model calls recordPurchase -> no write, returns a proposal
    monsa: Record coffee, 30 MAD? (y/n)
    You: y
         the UI writes the ledger directly
    monsa: recorded - 2,730 MAD left

**Proposals travel on the `generateText` result**, read from the tool calls the
SDK already records, rather than through a mutable collector passed into
`buildTools`. No side-channel. `runAgent` returns `{ text, proposals }` instead
of a bare string.

The accessor is confirmed against the installed `ai` v7 types:
`GenerateTextResult.toolCalls` is documented as "the tool calls that were made
in **all steps**", so there is no need to flatten `steps`. Each entry carries
`toolName` and `input`, so proposals are `toolCalls` filtered to
`toolName === "recordPurchase"`, mapped to their `input`.

### Considered and rejected: the SDK's own approval mechanism

`ai` v7 has first-class tool approval — a `toolApproval` option on
`generateText` and a tool-level `needsApproval`, which halt the loop before a
tool executes. It is more correct than the design above: approval and denial
become real tool outcomes in the message history, so the model cannot claim a
purchase was saved when it was not.

It was not chosen, for two reasons specific to this app. Resuming the loop
after approval costs a second API call per purchase, where the hand-rolled
path costs none — the post-approval line is arithmetic. And resuming requires
building approval-response parts into a raw `ModelMessage[]`; the SDK's
ergonomic helpers for this (`addToolApprovalResponse`,
`lastAssistantMessageIsCompleteWithApprovalResponses`) belong to its `Chat`
abstraction, which this app does not use.

Revisit this if the honesty risk below ever shows up in practice, or if the app
moves to `streamText` and the `Chat` abstraction for other reasons.

**New hook `src/ui/hooks/use-purchase-flow.ts`**, mirroring `useResetFlow`:
holds a queue of pending proposals, exposes `isConfirming`, the proposal being
asked about, a `notice`, and `handleInput(value) => boolean`. It is chained
into `onSubmit` in `src/ui/app.tsx` alongside `reset.handleInput`.

A **queue**, not a single slot: the model can propose two purchases in one turn
(`stopWhen: stepCountIs(10)` permits it), and each is confirmed in turn.

**The write happens in the hook on "y"**, calling `addPurchase` and
`saveLedger` directly. No second model round-trip — the outcome is arithmetic,
not something worth a token of inference.

**On "n"**, the proposal is discarded with a short notice, and the model is not
told. Spending a turn to inform it is not worth it: the next turn's briefing
lists the ledger, which simply will not contain the purchase, so the model
self-corrects from the data.

Ordering against `/reset`: `reset.handleInput` runs first, as it does today. A
pending purchase confirmation and a pending reset confirmation cannot both be
open, because each consumes the input that would have started the other.

The tools need the profile's currency and budget, so `src/agent/tools/index.ts`
changes from a static `tools` object to a `buildTools(profile)` factory, and
`src/agent/run.ts` calls it. This is preferable to re-reading the profile from
disk inside each tool invocation.

`buildTools(null)` (no profile yet) returns only `readClock` — there is nothing
to budget against during onboarding.

## Briefing: `src/agent/context/briefing.ts`

`profileBriefing` gains a ledger parameter and stays synchronous and pure; the
calling hook does the async load.

```ts
export function profileBriefing(
  profile: Profile,
  ledger: Ledger,
  now: Date,
): string;
```

With purchases:

    You are budgeting for Salah. Their monthly budget is 4,000 MAD, and amounts
    you quote should be in MAD. Today is 2026-09-21, with 10 days left in
    September counting today.
    Spent so far this month: 1,270 MAD of 4,000 MAD. 2,730 MAD left (~273/day).
    Purchases this month:
      2026-09-03   400  rent share   [a1b2c3d4]
      2026-09-12    30  coffee       [e5f6a7b8]

With an empty ledger, the existing honest wording is kept: no spending has been
recorded yet, treat the whole budget as available, do not invent expenses.

Every purchase is listed, not a recent subset. A heavy month costs on the order
of 1–2k tokens per turn, which is worth paying so the model can answer "what
did I buy?" without a lookup tool and can never confidently describe purchases
it cannot see.

Each line carries the purchase id, so the model can call `removePurchase`
without first asking for one.

`buildAgentMessages` takes the ledger and passes it through.

## Wiring

`src/ui/hooks/use-agent.ts` — load the ledger at the top of `handleSubmit`,
fresh on every turn. This picks up whatever was written during the previous
turn, and handles a month boundary crossed mid-session without special cases,
since the path is recomputed from `new Date()` each time. `runAgent` now
resolves to `{ text, proposals }`, so the hook hands any proposals to the
purchase flow's queue once the turn finishes.

`src/ui/hooks/use-ledger.ts` (new) — loads the current month's ledger once on
mount, for the opening greeting. The greeting is a single opening line that
does not need to stay live, so no refresh is required.

`src/ui/lib/greeting.ts` — `greeting(profile, ledger, now)` reports the real
remaining figure, retiring the placeholder.

`src/ui/app.tsx` — passes the ledger from `useLedger` to `Greeting`; chains
`purchases.handleInput` into `onSubmit` after `reset.handleInput`; and renders
the pending question and notice the way the reset flow's already are.

## Testing

`tests/expenses.test.ts` (new), following the `withTempDir` helper in
`tests/profile.test.ts`:

- `monthKey` across a month boundary and a year boundary, in local time.
- Round-trip: save then load returns the same ledger.
- A missing file loads as an empty ledger.
- A corrupt file, and a file whose purchases are malformed, load as empty.
- `addPurchase` appends without mutating its input and stamps `at`.
- `removePurchase` removes by id; an unknown id returns `removed: null` and an
  unchanged ledger.
- `ledgerTotal` on empty and populated ledgers.
- Loading an existing file with a `currency` argument that disagrees keeps the
  file's currency, not the argument's.

`tests/context.test.ts` (extend) — briefing with purchases states the spent and
remaining figures and lists each purchase with its id. **The existing test "is
honest that nothing has been recorded yet" asserts the placeholder wording and
must be updated to cover the empty-ledger case specifically.**

`tests/greeting.test.ts` (extend) — the opening line subtracts spending.

`tests/purchase-flow.test.ts` (new) — the gate is the part most likely to leak
money into or out of the file, so it is tested directly as a reducer over
inputs, independent of React:

- A proposal makes `isConfirming` true and writes nothing yet.
- "y" writes exactly one purchase and clears the queue.
- "n" writes nothing and clears the queue.
- Anything unclear ("maybe", "") is a no and writes nothing.
- Two queued proposals are confirmed one at a time, and answering the first
  does not write the second.
- A save failure surfaces as a notice rather than throwing, matching how
  `useResetFlow` reports a failed delete.

Tool tests are not planned: the tools are thin wrappers over `expenses.ts`
functions that are themselves tested, and testing them would mostly test the
`ai` SDK.

## Risks

- **Model proposes the wrong amount.** Caught by the confirmation gate before
  it reaches the file — the proposed figure is shown in the prompt. Undo covers
  the case where it was approved and regretted later.
- **Model claims a purchase is recorded when it is only proposed.** The real
  risk introduced by the gate. Mitigated by tool-result wording that states
  outright that nothing is saved, and by the next turn's briefing, which is
  built from the file and will not list an unconfirmed purchase.
- **Model proposes the same purchase twice** across turns. Not prevented, but
  now the user sees each proposal before it lands, and the full list in the
  briefing makes a duplicate visible afterwards.
- **Briefing growth.** Bounded by purchases per month. If a month ever grows
  large enough to matter, switching to summary-plus-recent is a change to one
  function.
