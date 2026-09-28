import { InvalidOperationException } from "../errors.js";

/**
 * Resolves `e => e.Prop` to the string `'Prop'` via a recording proxy. The single
 * implementation of the trick — callers that report failures as a different
 * exception type (or with their own wording) inject `makeError`/`noPropertyMessage`.
 */
export function captureSelectorName(
  selector: (e: never) => unknown,
  makeError: (message: string) => Error = (m) =>
    new InvalidOperationException(m),
  noPropertyMessage = "Selector did not access any property.",
): string {
  let captured: string | undefined;
  const proxy = new Proxy({} as Record<string, unknown>, {
    get(_t, key) {
      if (typeof key !== "string")
        throw makeError("Selector accessed a non-string key.");
      captured = key;
      return undefined;
    },
  });
  selector(proxy as never);
  if (!captured) throw makeError(noPropertyMessage);
  return captured;
}
