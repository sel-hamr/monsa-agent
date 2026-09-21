/** The few inputs monsa answers itself, before the agent ever sees them. */

export type Command = { kind: "exit" } | { kind: "reset" } | { kind: "prompt" };

export function parseCommand(input: string): Command {
  const normalized = input.trim().toLowerCase();
  if (normalized === "exit" || normalized === "quit") return { kind: "exit" };
  if (normalized === "/reset") return { kind: "reset" };
  return { kind: "prompt" };
}

/** Whether an answer to a yes/no prompt is a yes. Anything unclear is a no. */
export function parseConfirmation(input: string): boolean {
  const normalized = input.trim().toLowerCase();
  return normalized === "y" || normalized === "yes";
}
