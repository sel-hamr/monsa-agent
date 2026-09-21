import { Box, Text } from "ink";
import Spinner from "ink-spinner";

import { formatMoney, profilePath } from "../config/profile.js";
import { Greeting } from "./components/Greeting.js";
import { Input } from "./components/Input.js";
import { Onboarding } from "./components/Onboarding.js";
import { useAgent } from "./hooks/use-agent.js";
import { useProfile } from "./hooks/use-profile.js";
import { useResetFlow } from "./hooks/use-reset-flow.js";
import { MessageList } from "./components/MessageList.js";

export type AppProps = {
  name: string;
};

export function App({ name }: AppProps) {
  const { status, profile, pending, completeOnboarding, resetProfile } = useProfile();
  const { handleSubmit, messages, isLoading } = useAgent(profile);
  const reset = useResetFlow(resetProfile);

  const onSubmit = (value: string) => {
    if (reset.handleInput(value)) return;
    void handleSubmit(value);
  };

  if (status === "loading") {
    return (
      <Box paddingX={1} paddingY={0}>
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
        <Text dimColor> Loading your profile…</Text>
      </Box>
    );
  }

  if (status === "onboarding" || profile === null) {
    return <Onboarding initial={pending} onComplete={completeOnboarding} />;
  }

  return (
    <Box flexDirection="column" paddingX={1} paddingY={0}>
      <Box marginBottom={1} flexDirection="column">
        <Box>
          <Text bold color="magenta">
            🤖 {name} Agent manage your money for your month
          </Text>
          <Text dimColor> (type "exit" to quit, "/reset" to start over)</Text>
        </Box>
        <Text dimColor>
          {profile.name} · {formatMoney(profile.monthlyBudget, profile.currency)} a month
        </Text>
      </Box>

      <Box flexDirection="column" gap={1} marginBottom={1}>
        <Greeting profile={profile} />
        <MessageList messages={messages} />
      </Box>

      {reset.isConfirming && (
        <Text color="yellow">Delete {profilePath()}? (y/n)</Text>
      )}
      {reset.notice !== null && <Text dimColor>{reset.notice}</Text>}

      {isLoading ? (
        <Box>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text dimColor> Thinking…</Text>
        </Box>
      ) : (
        <Input onSubmit={onSubmit} />
      )}
    </Box>
  );
}
