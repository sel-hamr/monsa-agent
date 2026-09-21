/** The user's saved profile: who they are, and what they mean to spend a month. */

import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export interface Profile {
  version: 2;
  name: string;
  monthlyBudget: number;
  currency: string;
  createdAt: string;
}

/** A profile saved before currency was asked for: everything but the currency. */
export interface PartialProfile {
  name: string;
  monthlyBudget: number;
  createdAt: string;
}

/**
 * What was on disk: nothing usable, a complete profile, or an older one that
 * only needs its currency before it is complete.
 */
export type LoadResult =
  | { kind: "none" }
  | { kind: "ready"; profile: Profile }
  | { kind: "needs-currency"; partial: PartialProfile };

/** Where the profile lives when no directory is passed in. */
export function profileDir(): string {
  return path.join(homedir(), ".monsa");
}

export function profilePath(dir: string = profileDir()): string {
  return path.join(dir, "config.json");
}

/** Currency marks people paste in front of an amount, which we simply drop. */
const CURRENCY_MARK = /[$€£¥₹₽﷼]/g;

/**
 * Read a monthly budget out of whatever the user typed — `4,000`, `$4000`,
 * `1500.50` — or `null` when it is not an amount we can spend against.
 */
export function parseBudget(raw: string): number | null {
  const cleaned = raw.replace(CURRENCY_MARK, "").replace(/[\s,]/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return value > 0 ? value : null;
}

/** Symbols and names that stand for a currency code. */
const CURRENCY_ALIASES: Record<string, string> = {
  $: "USD",
  usd: "USD",
  dollar: "USD",
  dollars: "USD",
  "€": "EUR",
  eur: "EUR",
  euro: "EUR",
  euros: "EUR",
  "£": "GBP",
  gbp: "GBP",
  pound: "GBP",
  pounds: "GBP",
  "¥": "JPY",
  jpy: "JPY",
  yen: "JPY",
  "₹": "INR",
  inr: "INR",
  rupee: "INR",
  rupees: "INR",
  "₽": "RUB",
  rub: "RUB",
  "﷼": "SAR",
  dh: "MAD",
  dhs: "MAD",
  mad: "MAD",
  dirham: "MAD",
  dirhams: "MAD",
};

/** Symbols worth printing in place of a code. */
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  INR: "₹",
  RUB: "₽",
};

/**
 * Turn what the user typed into a currency code. Known symbols and names map
 * to their code; anything else that looks like a code is kept as typed, so an
 * unlisted currency is never refused. `null` means it was not a currency.
 */
export function parseCurrency(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const alias = CURRENCY_ALIASES[trimmed.toLowerCase()];
  if (alias !== undefined) return alias;
  return /^[A-Za-z]{2,5}$/.test(trimmed) ? trimmed.toUpperCase() : null;
}

/** The symbol for a code, or the code itself when it has none. */
export function currencySymbol(code: string): string {
  return CURRENCY_SYMBOLS[code] ?? code;
}

/** An amount the way this currency reads: `$4,000`, or `4,000 MAD`. */
export function formatMoney(amount: number, currency: string): string {
  const figure = amount.toLocaleString("en-US", { maximumFractionDigits: 2 });
  const symbol = currencySymbol(currency);
  return symbol === currency ? `${figure} ${currency}` : `${symbol}${figure}`;
}

/** A fresh profile from answers the onboarding questions collected. */
export function createProfile(name: string, monthlyBudget: number, currency: string): Profile {
  return {
    version: 2,
    name: name.trim(),
    monthlyBudget,
    currency,
    createdAt: new Date().toISOString(),
  };
}

/** Fill in the currency an older profile was missing, keeping the rest. */
export function completeProfile(partial: PartialProfile, currency: string): Profile {
  return { version: 2, ...partial, currency };
}

function readAnswers(value: unknown): PartialProfile | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const name = record["name"];
  const monthlyBudget = record["monthlyBudget"];
  const createdAt = record["createdAt"];
  if (typeof name !== "string" || name.trim() === "") return null;
  if (typeof monthlyBudget !== "number" || !Number.isFinite(monthlyBudget) || monthlyBudget <= 0) {
    return null;
  }
  if (typeof createdAt !== "string") return null;
  return { name, monthlyBudget, createdAt };
}

function toLoadResult(value: unknown): LoadResult {
  const partial = readAnswers(value);
  if (partial === null) return { kind: "none" };
  const currency = (value as Record<string, unknown>)["currency"];
  if (typeof currency !== "string" || currency.trim() === "") {
    return { kind: "needs-currency", partial };
  }
  return { kind: "ready", profile: { version: 2, ...partial, currency } };
}

/**
 * What is on disk. A missing, unreadable, or malformed file all read as
 * `none` — treat this as a first run rather than an error.
 */
export async function loadProfile(dir: string = profileDir()): Promise<LoadResult> {
  let contents: string;
  try {
    contents = await readFile(profilePath(dir), "utf8");
  } catch {
    return { kind: "none" };
  }
  try {
    return toLoadResult(JSON.parse(contents));
  } catch {
    return { kind: "none" };
  }
}

/** Write the profile, creating its directory on the way. */
export async function saveProfile(profile: Profile, dir: string = profileDir()): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(profilePath(dir), `${JSON.stringify(profile, null, 2)}\n`, "utf8");
}

/** Delete the saved profile. Returns whether there was one to delete. */
export async function deleteProfile(dir: string = profileDir()): Promise<boolean> {
  try {
    await unlink(profilePath(dir));
    return true;
  } catch {
    return false;
  }
}
