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
