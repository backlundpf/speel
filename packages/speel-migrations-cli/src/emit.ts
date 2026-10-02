import type { MigrationOperation, FieldSpec } from "@speel/migrations";
import type { SnapshotDiff } from "./diff.js";

const KIND_METHOD: Record<
  Exclude<FieldSpec["kind"], "Text" | "Choice">,
  string
> = {
  Number: "number",
  Currency: "currency",
  Boolean: "boolean",
  DateTime: "dateTime",
  Lookup: "lookup",
  User: "user",
};

/** Render a FieldSpec back into a `(f) => f.<method>(...)` builder call. */
export function renderFieldSpec(spec: FieldSpec): string {
  const {
    kind,
    internalName: _n,
    ...rest
  } = spec as FieldSpec & Record<string, unknown>;
  if (kind === "Text") {
    const { multiline, ...opts } = rest as { multiline: boolean } & Record<
      string,
      unknown
    >;
    return `(f) => f.${multiline ? "note" : "text"}(${json(opts)})`;
  }
  if (kind === "Choice") {
    const { choices, multi, ...opts } = rest as {
      choices: string[];
      multi: boolean;
    } & Record<string, unknown>;
    return `(f) => f.${multi ? "multiChoice" : "choice"}(${JSON.stringify(choices)},${json(opts)})`;
  }
  return `(f) => f.${KIND_METHOD[kind]}(${json(rest)})`;
}

/** Render the full migration module source. */
export function renderMigrationFile(id: string, diff: SnapshotDiff): string {
  const lossOf = new Map(
    (diff.warnings ?? []).map((w) => [w.op, w.message] as const),
  );
  const line = (o: MigrationOperation): string => {
    const loss = lossOf.get(o);
    return (
      (loss !== undefined ? `    // May lose data: ${loss}\n` : "") +
      "    " +
      renderOp(o)
    );
  };
  const body = (ops: MigrationOperation[]): string =>
    ops.length === 0 ? "" : "\n" + ops.map(line).join("\n") + "\n  ";
  return `import { defineMigration } from '@speel/migrations';

export default defineMigration('${id}', {
  up(b) {${body(diff.up)}},
  down(b) {${body(diff.down)}},
});
`;
}

function renderOp(op: MigrationOperation): string {
  switch (op.op) {
    case "createList":
      return `b.createList(${JSON.stringify(op.title)}, ${json(stripTitle(op.spec))});`;
    case "dropList":
      return `b.dropList(${JSON.stringify(op.title)});`;
    case "renameList":
      return `b.renameList(${JSON.stringify(op.from)}, ${JSON.stringify(op.to)});`;
    case "addField":
      return `b.addField(${JSON.stringify(op.list)}, ${JSON.stringify(op.field.internalName)}, ${renderFieldSpec(op.field)});`;
    case "alterField":
      return `b.alterField(${JSON.stringify(op.list)}, ${JSON.stringify(op.field.internalName)}, ${renderFieldSpec(op.field)});`;
    case "dropField":
      return `b.dropField(${JSON.stringify(op.list)}, ${JSON.stringify(op.name)});`;
    case "renameField":
      return `b.renameField(${JSON.stringify(op.list)}, ${JSON.stringify(op.from)}, ${JSON.stringify(op.to)});`;
    case "addIndex":
      return `b.addIndex(${JSON.stringify(op.list)}, ${JSON.stringify(op.field)});`;
    case "dropIndex":
      return `b.dropIndex(${JSON.stringify(op.list)}, ${JSON.stringify(op.field)});`;
    case "run":
      return `b.run(async () => { /* TODO: hand-written data step */ });`;
  }
  throw new Error(
    `renderOp: unhandled operation '${(op as { op: string }).op}'`,
  );
}

/** createList's builder takes title separately; the opts object omits it. */
function stripTitle<T extends { title: string }>(spec: T): Omit<T, "title"> {
  const { title: _t, ...rest } = spec;
  return rest;
}

/** Compact JSON object literal (valid TS); preserves key order from the source object. */
function json(obj: object): string {
  return JSON.stringify(obj);
}
