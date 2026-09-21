import { useCallback, useState } from "react";
import { useApp } from "ink";
import type { ModelMessage } from "ai";

import { runAgent } from "../../agent/run.js";
import { buildAgentMessages } from "../../agent/context/index.js";
import type { Profile } from "../../config/profile.js";
import type { Message } from "../../types.js";
import { parseCommand } from "../lib/commands.js";

export type AgentStatus = "idle" | "running" | "done" | "error";

export type UseAgentResult = {
  messages: Message[];
  isLoading: boolean;
  conversationHistory: ModelMessage[];
  handleSubmit: (prompt: string) => Promise<void>;
};

/** Drives a single agent turn and exposes its lifecycle to the UI. */
export function useAgent(profile: Profile | null): UseAgentResult {
  const { exit } = useApp();
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationHistory, setConversationHistory] = useState<ModelMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = useCallback(
    async (userInput: string) => {
      if (parseCommand(userInput).kind === "exit") {
        exit();
        return;
      }

      const turn = buildAgentMessages(profile, conversationHistory, userInput);
      setMessages((prev) => [...prev, { role: "user", content: userInput }]);
      setIsLoading(true);
      try {
        const reply = await runAgent({ messages: turn });
        setConversationHistory([
          ...turn.filter((message) => message.role !== "system"),
          { role: "assistant", content: reply },
        ]);
        setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${errorMessage}` }]);
      } finally {
        setIsLoading(false);
      }
    },
    [conversationHistory, exit, profile],
  );

  return { handleSubmit, conversationHistory, messages, isLoading };
}
