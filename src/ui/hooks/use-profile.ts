import { useCallback, useEffect, useState } from "react";

import {
  completeProfile,
  createProfile,
  deleteProfile,
  loadProfile,
  saveProfile,
} from "../../config/profile.js";
import type { PartialProfile, Profile } from "../../config/profile.js";

export type ProfileStatus = "loading" | "onboarding" | "ready";

export type UseProfileResult = {
  status: ProfileStatus;
  profile: Profile | null;
  /** Answers an older file already had, so onboarding only asks what is missing. */
  pending: PartialProfile | null;
  completeOnboarding: (
    answers: { name: string; monthlyBudget: number },
    currency: string,
  ) => Promise<void>;
  resetProfile: () => Promise<void>;
};

/** Loads the saved profile once at startup, and onboards when there is none. */
export function useProfile(): UseProfileResult {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [pending, setPending] = useState<PartialProfile | null>(null);
  const [status, setStatus] = useState<ProfileStatus>("loading");

  useEffect(() => {
    let cancelled = false;
    void loadProfile().then((result) => {
      if (cancelled) return;
      if (result.kind === "ready") {
        setProfile(result.profile);
        setStatus("ready");
        return;
      }
      setPending(result.kind === "needs-currency" ? result.partial : null);
      setStatus("onboarding");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const completeOnboarding = useCallback(
    async (answers: { name: string; monthlyBudget: number }, currency: string) => {
      const saved =
        pending === null
          ? createProfile(answers.name, answers.monthlyBudget, currency)
          : completeProfile(pending, currency);
      await saveProfile(saved);
      setProfile(saved);
      setPending(null);
      setStatus("ready");
    },
    [pending],
  );

  const resetProfile = useCallback(async () => {
    await deleteProfile();
    setProfile(null);
    setPending(null);
    setStatus("onboarding");
  }, []);

  return { status, profile, pending, completeOnboarding, resetProfile };
}
