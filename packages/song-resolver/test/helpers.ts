/** A fake Workers execution context; work handed to `waitUntil` lands in `pending`. */
export function executionContext(
  pending: Promise<unknown>[] = [],
): ExecutionContext {
  return {
    waitUntil: (work: Promise<unknown>) => pending.push(work),
    passThroughOnException: () => undefined,
    props: {},
  } as unknown as ExecutionContext;
}
