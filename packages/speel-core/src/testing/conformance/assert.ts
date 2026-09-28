/**
 * The assertions the conformance suite is written in. Deliberately not vitest's:
 * the suite runs inside a browser page for the live provider, where only plain
 * functions travel. Every failure throws an Error whose message stands alone.
 */
export function assertTrue(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

/**
 * JSON with the keys of every plain object sorted (arrays keep their order), so
 * two records that carry the same keys in a different order — which is all that
 * separates one endpoint's projection from another's — compare equal.
 */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (v === null || typeof v !== "object" || Array.isArray(v)) return v;
    const obj = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort()) out[k] = obj[k];
    return out;
  });
}

/** Deep equality by JSON shape for arrays/objects (key order ignored), strict equality otherwise. */
export function assertEqual<T>(actual: T, expected: T, message: string): void {
  const same =
    typeof actual === "object" && actual !== null
      ? canonical(actual) === canonical(expected)
      : actual === expected;
  if (!same) {
    throw new Error(
      `${message}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`,
    );
  }
}

/** `fn` must reject; when `name` is given the error's `.name` must match it. Returns the error. */
export async function assertRejects(
  fn: () => Promise<unknown>,
  name: string | undefined,
  message: string,
): Promise<Error> {
  let caught: unknown;
  try {
    await fn();
  } catch (err) {
    caught = err;
  }
  if (caught === undefined) throw new Error(`${message}: did not throw`);
  const err = caught instanceof Error ? caught : new Error(String(caught));
  if (name !== undefined && err.name !== name) {
    throw new Error(
      `${message}: threw ${err.name} (${err.message}), expected ${name}`,
    );
  }
  return err;
}

export function sortedNumbers(value: unknown): number[] {
  return (Array.isArray(value) ? value : [value])
    .map(Number)
    .sort((a, b) => a - b);
}
