import { tool } from "ai";
import { z } from "zod";

export const readClock = tool({
  description: "Return the current time as an ISO-8601 string.",
  inputSchema: z.object({}),
  execute: () => new Date().toISOString(),
});
