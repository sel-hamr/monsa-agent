import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { describe } from "node:test";

import {
  completeProfile,
  createProfile,
  deleteProfile,
  formatMoney,
  loadProfile,
  parseBudget,
  parseCurrency,
  profilePath,
  saveProfile,
} from "../src/config/profile.js";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), "monsa-profile-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function writeRaw(dir: string, contents: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(profilePath(dir), contents, "utf8");
}

describe("parseBudget", () => {
  test("reads the numbers people actually type", () => {
    assert.equal(parseBudget("4000"), 4000);
    assert.equal(parseBudget("4,000"), 4000);
    assert.equal(parseBudget("$4000"), 4000);
    assert.equal(parseBudget("  4 000 "), 4000);
    assert.equal(parseBudget("1500.50"), 1500.5);
  });

  test("rejects anything that is not a spendable amount", () => {
    for (const raw of ["", "   ", "abc", "-5", "0", "NaN", "Infinity", "12abc", "$"]) {
      assert.equal(parseBudget(raw), null, `${JSON.stringify(raw)} should not parse`);
    }
  });
});

describe("parseCurrency", () => {
  test("maps the symbols and names people type to a code", () => {
    assert.equal(parseCurrency("$"), "USD");
    assert.equal(parseCurrency("€"), "EUR");
    assert.equal(parseCurrency("£"), "GBP");
    assert.equal(parseCurrency("dollars"), "USD");
    assert.equal(parseCurrency("  euro "), "EUR");
    assert.equal(parseCurrency("dh"), "MAD");
    assert.equal(parseCurrency("dirham"), "MAD");
  });

  test("keeps an unlisted currency rather than refusing it", () => {
    assert.equal(parseCurrency("mad"), "MAD");
    assert.equal(parseCurrency("sar"), "SAR");
    assert.equal(parseCurrency(" tnd "), "TND");
  });

  test("rejects answers that are not a currency", () => {
    for (const raw of ["", "   ", "4000", "us dollars please", "x".repeat(20), "12"]) {
      assert.equal(parseCurrency(raw), null, `${JSON.stringify(raw)} should not parse`);
    }
  });
});

describe("formatMoney", () => {
  test("puts a known symbol in front and an unknown code behind", () => {
    assert.equal(formatMoney(4000, "USD"), "$4,000");
    assert.equal(formatMoney(4000, "EUR"), "€4,000");
    assert.equal(formatMoney(4000, "MAD"), "4,000 MAD");
    assert.equal(formatMoney(1500.5, "MAD"), "1,500.5 MAD");
  });
});

describe("profile storage", () => {
  test("a saved profile loads back unchanged", async () => {
    await withTempDir(async (dir) => {
      const profile = createProfile("Salah", 4000, "MAD");
      await saveProfile(profile, dir);
      assert.deepEqual(await loadProfile(dir), { kind: "ready", profile });
    });
  });

  test("saving creates the directory if it is missing", async () => {
    await withTempDir(async (dir) => {
      const nested = path.join(dir, "nested", ".monsa");
      await saveProfile(createProfile("Salah", 4000, "MAD"), nested);
      const raw = await readFile(profilePath(nested), "utf8");
      assert.equal(JSON.parse(raw).currency, "MAD");
    });
  });

  test("no file means first run", async () => {
    await withTempDir(async (dir) => {
      assert.deepEqual(await loadProfile(dir), { kind: "none" });
    });
  });

  test("a version 1 file keeps its answers and only needs a currency", async () => {
    await withTempDir(async (dir) => {
      const createdAt = "2026-09-20T21:30:46.246Z";
      await writeRaw(dir, JSON.stringify({ version: 1, name: "Salah", monthlyBudget: 4000, createdAt }));
      assert.deepEqual(await loadProfile(dir), {
        kind: "needs-currency",
        partial: { name: "Salah", monthlyBudget: 4000, createdAt },
      });
    });
  });

  test("a blank currency asks for one rather than throwing the answers away", async () => {
    await withTempDir(async (dir) => {
      const createdAt = "2026-09-20T21:30:46.246Z";
      await writeRaw(dir, JSON.stringify({ version: 2, name: "Salah", monthlyBudget: 4000, currency: "  ", createdAt }));
      assert.deepEqual(await loadProfile(dir), {
        kind: "needs-currency",
        partial: { name: "Salah", monthlyBudget: 4000, createdAt },
      });
    });
  });

  test("completing a version 1 profile keeps its original creation time", () => {
    const createdAt = "2026-09-20T21:30:46.246Z";
    const profile = completeProfile({ name: "Salah", monthlyBudget: 4000, createdAt }, "MAD");
    assert.deepEqual(profile, { version: 2, name: "Salah", monthlyBudget: 4000, currency: "MAD", createdAt });
  });

  test("a corrupt or incomplete file means first run, not a crash", async () => {
    const broken = [
      "{ not json",
      "null",
      "[]",
      '{"name":"Salah"}',
      '{"version":2,"name":"","monthlyBudget":10,"currency":"MAD","createdAt":"x"}',
      '{"version":2,"name":"Salah","monthlyBudget":-3,"currency":"MAD","createdAt":"x"}',
    ];
    for (const contents of broken) {
      await withTempDir(async (dir) => {
        await writeRaw(dir, contents);
        assert.deepEqual(await loadProfile(dir), { kind: "none" }, `${contents} should not load`);
      });
    }
  });

  test("createProfile trims the name and stamps the creation time", () => {
    const profile = createProfile("  Salah  ", 4000, "MAD");
    assert.equal(profile.name, "Salah");
    assert.equal(profile.version, 2);
    assert.ok(!Number.isNaN(Date.parse(profile.createdAt)));
  });
});

describe("deleteProfile", () => {
  test("removes the file and reports that it did", async () => {
    await withTempDir(async (dir) => {
      await saveProfile(createProfile("Salah", 4000, "MAD"), dir);
      assert.equal(await deleteProfile(dir), true);
      assert.deepEqual(await loadProfile(dir), { kind: "none" });
    });
  });

  test("deleting nothing is not an error", async () => {
    await withTempDir(async (dir) => {
      assert.equal(await deleteProfile(dir), false);
    });
  });
});
