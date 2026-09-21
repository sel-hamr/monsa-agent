/** What was bought this month: one file per calendar month, beside the profile. */

import { randomUUID } from "node:crypto";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { profileDir } from "./profile.js";

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
