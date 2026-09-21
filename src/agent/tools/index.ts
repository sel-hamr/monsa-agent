import { readClock } from "./clock.js";

/** Every tool the agent can call, keyed by the name the model sees. */
export const tools = {
  readClock,
};

export { readClock };
