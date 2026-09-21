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
    if (currency === null) return undefined;
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
