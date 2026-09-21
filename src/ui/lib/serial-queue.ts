/** Runs queued async tasks one at a time, in order, without one wedging the rest. */

/**
 * Returns a function that chains each task onto the last, so two tasks queued
 * back to back never overlap — the second does not start until the first has
 * settled. A rejecting task must not block what comes after it: the queue
 * itself never sees a rejection, because each task's failure is swallowed
 * before the chain advances. Callers that need to know about a failure must
 * catch it inside the task they pass in.
 */
export function makeSerializer(): (task: () => Promise<void>) => void {
  let chain: Promise<void> = Promise.resolve();

  return (task: () => Promise<void>) => {
    chain = chain.then(() =>
      task().catch(() => {
        // Swallowed here so a rejected task cannot wedge the chain for
        // everything queued behind it. Callers that care about the failure
        // observe it inside their own task.
      }),
    );
  };
}
