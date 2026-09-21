import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { makeSerializer } from "../src/ui/lib/serial-queue.js";

/** A promise plus the functions that settle it, for controlling ordering by hand. */
function deferred<T = void>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Drains the microtask queue completely, however many links a chain is deep. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("makeSerializer", () => {
  test("a second queued task does not start until the first has settled", async () => {
    const serialize = makeSerializer();
    const order: string[] = [];
    const first = deferred();
    const second = deferred();

    serialize(async () => {
      order.push("first start");
      await first.promise;
      order.push("first end");
    });
    serialize(async () => {
      order.push("second start");
      await second.promise;
      order.push("second end");
    });

    // Let both settle up to the point where they'd be blocked on their
    // deferreds.
    await flush();

    assert.deepEqual(
      order,
      ["first start"],
      "the second task must not start before the first is resolved",
    );

    first.resolve();
    await flush();

    assert.deepEqual(order, ["first start", "first end", "second start"]);

    second.resolve();
    await flush();

    assert.deepEqual(order, ["first start", "first end", "second start", "second end"]);
  });

  test("a rejecting first task does not block the second from running", async () => {
    const serialize = makeSerializer();
    const order: string[] = [];

    serialize(async () => {
      order.push("first");
      throw new Error("boom");
    });
    serialize(async () => {
      order.push("second");
    });

    await flush();

    assert.deepEqual(order, ["first", "second"], "the rejection must not wedge the chain");
  });

  test("many tasks queued in a burst still run in order", async () => {
    const serialize = makeSerializer();
    const order: number[] = [];

    for (let i = 0; i < 5; i += 1) {
      serialize(async () => {
        order.push(i);
      });
    }

    await flush();

    assert.deepEqual(order, [0, 1, 2, 3, 4]);
  });
});
