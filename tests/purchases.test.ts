import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { describe } from "node:test";

import { buildPurchaseTools } from "../src/agent/tools/purchases.js";
import { addPurchase, emptyLedger, monthKey, saveLedger } from "../src/config/expenses.js";
import { createProfile } from "../src/config/profile.js";

/**
 * `removePurchase` reads and writes through `loadLedger`/`saveLedger`'s
 * default directory (`profileDir()`, under the real home directory) — the
 * tool has no way to take a directory override. Rather than reach for a
 * module-loader mock, this redirects `os.homedir()` the same way Node itself
 * resolves it: via `HOME` (POSIX) / `USERPROFILE` (Windows), for the
 * duration of one test.
 */
async function withRedirectedHome(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), "monsa-tools-"));
  const savedHome = process.env["HOME"];
  const savedUserProfile = process.env["USERPROFILE"];
  process.env["HOME"] = dir;
  process.env["USERPROFILE"] = dir;
  try {
    await run(dir);
  } finally {
    if (savedHome === undefined) delete process.env["HOME"];
    else process.env["HOME"] = savedHome;
    if (savedUserProfile === undefined) delete process.env["USERPROFILE"];
    else process.env["USERPROFILE"] = savedUserProfile;
    await rm(dir, { recursive: true, force: true });
  }
}

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
