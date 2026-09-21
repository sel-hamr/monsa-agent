import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { parseCommand, parseConfirmation } from "../src/ui/lib/commands.js";

describe("parseCommand", () => {
  test("recognises quitting, however it is typed", () => {
    for (const raw of ["exit", "quit", "EXIT", "  quit  "]) {
      assert.deepEqual(parseCommand(raw), { kind: "exit" }, raw);
    }
  });

  test("recognises the reset command", () => {
    for (const raw of ["/reset", "  /RESET ", "/reset  "]) {
      assert.deepEqual(parseCommand(raw), { kind: "reset" }, raw);
    }
  });

  test("leaves everything else for the agent", () => {
    for (const raw of ["reset", "what did I spend?", "/resets", "exit the lease", ""]) {
      assert.deepEqual(parseCommand(raw), { kind: "prompt" }, raw);
    }
  });
});

describe("parseConfirmation", () => {
  test("only a clear yes counts as yes", () => {
    for (const raw of ["y", "Y", "yes", " YES "]) assert.equal(parseConfirmation(raw), true, raw);
    for (const raw of ["n", "no", "", "maybe", "yep"]) assert.equal(parseConfirmation(raw), false, raw);
  });
});
