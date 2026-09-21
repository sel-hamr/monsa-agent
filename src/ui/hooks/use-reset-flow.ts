import { useCallback, useState } from "react";

import { parseCommand, parseConfirmation } from "../lib/commands.js";

export type UseResetFlowResult = {
  /** Whether the next input answers "delete the profile?" rather than the agent. */
  isConfirming: boolean;
  notice: string | null;
  /** Handles the input if it belongs to this flow; `false` means pass it on. */
  handleInput: (value: string) => boolean;
};

/** The `/reset` command: ask first, then delete the saved profile. */
export function useResetFlow(resetProfile: () => Promise<void>): UseResetFlowResult {
  const [isConfirming, setIsConfirming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const handleInput = useCallback(
    (value: string) => {
      if (isConfirming) {
        setIsConfirming(false);
        if (!parseConfirmation(value)) {
          setNotice("Kept your profile.");
          return true;
        }
        setNotice(null);
        void resetProfile().catch((cause: unknown) => {
          const reason = cause instanceof Error ? cause.message : "unknown error";
          setNotice(`Could not delete your profile: ${reason}`);
        });
        return true;
      }

      if (parseCommand(value).kind !== "reset") return false;
      setNotice(null);
      setIsConfirming(true);
      return true;
    },
    [isConfirming, resetProfile],
  );

  return { isConfirming, notice, handleInput };
}
