/**
 * A deep copy of a property value that keeps what a model value is made of: a
 * Json shape instance stays an instance of its class and keeps its non-enumerable,
 * symbol-keyed unknown-key bag (Snapshot's comparison clone deliberately flattens
 * both). Navigation targets never come through here — they are rows, shared by
 * reference, not values.
 */
export function cloneValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return new Date(value.getTime());
  if (Array.isArray(value)) return value.map(cloneValue);
  const out = Object.create(
    Object.getPrototypeOf(value) as object | null,
  ) as object;
  for (const key of Reflect.ownKeys(value)) {
    const desc = Object.getOwnPropertyDescriptor(value, key)!;
    if ("value" in desc) desc.value = cloneValue(desc.value);
    Object.defineProperty(out, key, desc);
  }
  return out;
}
