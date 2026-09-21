import { Box, Text } from "ink";

import { greeting } from "../lib/greeting.js";
import type { Ledger } from "../../config/expenses.js";
import type { Profile } from "../../config/profile.js";

interface GreetingProps {
  profile: Profile;
  ledger: Ledger;
  /** Injectable so the opening line can be tested against a fixed date. */
  now?: Date;
}

/**
 * monsa's opening line. It looks like an assistant turn but is not one: it
 * never enters the conversation history, so the model is not told it spoke.
 */
export function Greeting({ profile, ledger, now = new Date() }: GreetingProps) {
  const { summary, question } = greeting(profile, ledger, now);

  return (
    <Box flexDirection="column">
      <Text color="green" bold>
        › monsa
      </Text>
      <Box marginLeft={2} flexDirection="column">
        <Text>{summary}</Text>
        <Text dimColor>{question}</Text>
      </Box>
    </Box>
  );
}
