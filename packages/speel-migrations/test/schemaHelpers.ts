import type { FakeSchemaProvider } from "../src/schema/FakeSchemaProvider.js";
import type { SchemaOperation } from "../src/operations/operations.js";
import type { FieldSpec } from "../src/FieldSpec.js";

/**
 * Put a fake provider into a starting state. Ops are applied in one call, which
 * the fake folds in order — no wave separation needed, since nothing here goes
 * near a real changeset.
 */
export async function seed(
  schema: FakeSchemaProvider,
  ...ops: SchemaOperation[]
): Promise<void> {
  await schema.applyAsync(ops, await schema.readSchemaAsync());
}

export const createList = (title: string): SchemaOperation => ({
  op: "createList",
  title,
  spec: { title, template: "genericList" },
});

export const addField = (list: string, field: FieldSpec): SchemaOperation => ({
  op: "addField",
  list,
  field,
});

export async function listExists(
  schema: FakeSchemaProvider,
  title: string,
): Promise<boolean> {
  return (await schema.readSchemaAsync()).lists.has(title);
}

export async function listTitles(
  schema: FakeSchemaProvider,
): Promise<string[]> {
  return [...(await schema.readSchemaAsync()).lists.keys()].sort();
}

export async function fieldNames(
  schema: FakeSchemaProvider,
  title: string,
): Promise<string[]> {
  const snap = await schema.readSchemaAsync();
  return [...(snap.lists.get(title)?.fields.keys() ?? [])].sort();
}
