import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Several tools (`removePurchase`, `recordPurchase`, and anything else that
 * reads or writes the ledger) go through `loadLedger`/`saveLedger`'s default
 * directory (`profileDir()`, under the real home directory) — they have no
 * way to take a directory override. Rather than reach for a module-loader
 * mock, this redirects `os.homedir()` the same way Node itself resolves it:
 * via `HOME` (POSIX) / `USERPROFILE` (Windows), for the duration of one test.
 */
export async function withRedirectedHome(run: (dir: string) => Promise<void>): Promise<void> {
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
