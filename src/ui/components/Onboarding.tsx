import { useState } from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";

import { parseBudget, parseCurrency } from "../../config/profile.js";
import type { PartialProfile } from "../../config/profile.js";
import { Input } from "./Input.js";

interface OnboardingProps {
  /** Answers already on disk; when present, only the currency is asked. */
  initial: PartialProfile | null;
  onComplete: (
    answers: { name: string; monthlyBudget: number },
    currency: string,
  ) => Promise<void>;
}

/** First run: collect a name, a monthly budget and a currency, then save them. */
export function Onboarding({ initial, onComplete }: OnboardingProps) {
  const [name, setName] = useState<string | null>(initial?.name ?? null);
  const [budget, setBudget] = useState<number | null>(initial?.monthlyBudget ?? null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = (monthlyBudget: number, currency: string) => {
    setError(null);
    setSaving(true);
    void onComplete({ name: name ?? "", monthlyBudget }, currency).catch((cause: unknown) => {
      const reason = cause instanceof Error ? cause.message : "unknown error";
      setError(`Could not save your profile: ${reason}`);
      setSaving(false);
    });
  };

  const handleSubmit = (value: string) => {
    if (name === null) {
      const trimmed = value.trim();
      if (!trimmed) {
        setError("I need something to call you.");
        return;
      }
      setName(trimmed);
      setError(null);
      return;
    }

    if (budget === null) {
      const monthlyBudget = parseBudget(value);
      if (monthlyBudget === null) {
        setError(`"${value.trim()}" isn't an amount — try something like 4000.`);
        return;
      }
      setBudget(monthlyBudget);
      setError(null);
      return;
    }

    const currency = parseCurrency(value);
    if (currency === null) {
      setError(`"${value.trim()}" isn't a currency — try a code like USD, EUR or MAD.`);
      return;
    }
    save(budget, currency);
  };

  const question =
    name === null
      ? "What's your name?"
      : budget === null
        ? "How much do you want to spend each month?"
        : "What currency do you spend in?";

  return (
    <Box flexDirection="column" paddingX={1} paddingY={0}>
      <Box marginBottom={1} flexDirection="column">
        <Text bold color="magenta">
          🤖 Welcome to monsa
        </Text>
        <Text dimColor>
          {initial === null
            ? "Three questions, once. I'll remember the answers."
            : "One more question, then I'll remember the rest."}
        </Text>
      </Box>

      {name !== null && (
        <Box flexDirection="column" marginBottom={1}>
          <Box>
            <Text color="green">✓ </Text>
            <Text dimColor>Name: </Text>
            <Text>{name}</Text>
          </Box>
          {budget !== null && (
            <Box>
              <Text color="green">✓ </Text>
              <Text dimColor>Monthly budget: </Text>
              <Text>{budget.toLocaleString("en-US")}</Text>
            </Box>
          )}
        </Box>
      )}

      <Text bold>{question}</Text>
      {error !== null && <Text color="red">{error}</Text>}

      <Box marginTop={1}>
        {saving ? (
          <Box>
            <Text color="cyan">
              <Spinner type="dots" />
            </Text>
            <Text dimColor> Saving…</Text>
          </Box>
        ) : (
          <Input onSubmit={handleSubmit} />
        )}
      </Box>
    </Box>
  );
}
