// Subscribing a store to several backend events at once, all or nothing.

/**
 * Wait for every `listen()`; if any failed, undo the ones that succeeded (no half-connected
 * store leaking listeners) and reject with the first failure.
 */
export async function settleListeners(pending: Promise<() => void>[]): Promise<(() => void)[]> {
  const results = await Promise.allSettled(pending);
  const offs: (() => void)[] = [];
  let failure: unknown = null;
  let failed = false;
  for (const r of results) {
    if (r.status === "fulfilled") offs.push(r.value);
    else if (!failed) {
      failed = true;
      failure = r.reason;
    }
  }
  if (failed) {
    offs.forEach((f) => f());
    throw failure;
  }
  return offs;
}
