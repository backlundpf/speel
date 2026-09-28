import type { ListTemplate } from "@speel/core";
import type { MigrationOperation, ListSpec, RunContext } from "./operations.js";
import type { FieldSpec } from "../FieldSpec.js";
import { FieldSpecBuilder } from "./FieldSpecBuilder.js";

interface CreateListOpts {
  template?: ListTemplate;
  url?: string;
  description?: string;
  onQuickLaunch?: boolean;
  readSecurity?: "all" | "own";
  writeSecurity?: "all" | "own";
}

export class MigrationBuilder {
  private readonly ops: MigrationOperation[] = [];

  createList(title: string, opts: CreateListOpts = {}): this {
    const spec: ListSpec = {
      title,
      template: opts.template ?? "genericList",
      ...(opts.url !== undefined ? { url: opts.url } : {}),
      ...(opts.description !== undefined
        ? { description: opts.description }
        : {}),
      ...(opts.onQuickLaunch !== undefined
        ? { onQuickLaunch: opts.onQuickLaunch }
        : {}),
      ...(opts.readSecurity !== undefined
        ? { readSecurity: opts.readSecurity }
        : {}),
      ...(opts.writeSecurity !== undefined
        ? { writeSecurity: opts.writeSecurity }
        : {}),
    };
    this.ops.push({ op: "createList", title, spec });
    return this;
  }
  dropList(title: string): this {
    this.ops.push({ op: "dropList", title });
    return this;
  }
  renameList(from: string, to: string): this {
    this.ops.push({ op: "renameList", from, to });
    return this;
  }

  addField(
    list: string,
    name: string,
    build: (f: FieldSpecBuilder) => FieldSpec,
  ): this {
    const field = build(new FieldSpecBuilder(name));
    // SharePoint creates Title with every list, so a migration declaring one is
    // reconfiguring the built-in, not adding a column. Sent as an addField it
    // collides and SharePoint invents a suffixed internal name (Title0).
    this.ops.push({
      op: name === BUILT_IN_TITLE ? "alterField" : "addField",
      list,
      field,
    });
    return this;
  }
  alterField(
    list: string,
    name: string,
    build: (f: FieldSpecBuilder) => FieldSpec,
  ): this {
    this.ops.push({
      op: "alterField",
      list,
      field: build(new FieldSpecBuilder(name)),
    });
    return this;
  }
  dropField(list: string, name: string): this {
    this.ops.push({ op: "dropField", list, name });
    return this;
  }
  renameField(list: string, from: string, to: string): this {
    this.ops.push({ op: "renameField", list, from, to });
    return this;
  }

  addIndex(list: string, field: string): this {
    this.ops.push({ op: "addIndex", list, field });
    return this;
  }
  dropIndex(list: string, field: string): this {
    this.ops.push({ op: "dropIndex", list, field });
    return this;
  }

  run(fn: (ctx: RunContext) => Promise<void>): this;
  /** A labelled data step. The label is what makes it legible in a minified production bundle. */
  run(label: string, fn: (ctx: RunContext) => Promise<void>): this;
  run(
    a: string | ((ctx: RunContext) => Promise<void>),
    b?: (ctx: RunContext) => Promise<void>,
  ): this {
    if (typeof a === "string") {
      this.ops.push({ op: "run", run: b!, label: a });
    } else {
      this.ops.push({ op: "run", run: a });
    }
    return this;
  }

  build(): MigrationOperation[] {
    return relaxUndeclaredTitles(this.ops);
  }
}

/** The column SharePoint adds to every list, whether the model wants it or not. */
const BUILT_IN_TITLE = "Title";

/** True when `op` gives this list's built-in Title a shape of its own. */
function declaresTitle(op: MigrationOperation, list: string): boolean {
  switch (op.op) {
    case "addField":
    case "alterField":
      return op.list === list && op.field.internalName === BUILT_IN_TITLE;
    case "renameField":
      return op.list === list && op.from === BUILT_IN_TITLE;
    case "dropField":
      return op.list === list && op.name === BUILT_IN_TITLE;
    default:
      return false;
  }
}

/**
 * Follow every `createList` whose migration never mentions Title with an op
 * clearing Required on the built-in — a mandatory column the model has no
 * property for makes items unsavable through the application.
 *
 * The op carries nothing but the internal name and `required`, so it MERGEs a
 * single attribute and leaves the rest of the column alone. It is appended at
 * the end of the schema run holding its `createList`: late enough to share the
 * wave that adds the list's other fields (a field cannot be touched in the same
 * changeset that creates its list), early enough to land before the next `run`
 * step, whose data writes a required Title would block.
 */
function relaxUndeclaredTitles(
  ops: readonly MigrationOperation[],
): MigrationOperation[] {
  const out: MigrationOperation[] = [];
  let pending: string[] = [];
  const flush = (): void => {
    for (const list of pending) {
      out.push({
        op: "alterField",
        list,
        field: new FieldSpecBuilder(BUILT_IN_TITLE).text({ required: false }),
      });
    }
    pending = [];
  };

  for (const op of ops) {
    if (op.op === "run") {
      flush();
      out.push(op);
      continue;
    }
    out.push(op);
    if (
      op.op === "createList" &&
      !ops.some((o) => declaresTitle(o, op.title))
    ) {
      pending.push(op.title);
    }
  }
  flush();
  return out;
}

/** Run an up/down body against a fresh builder and return the recorded ops. */
export function recordOps(
  body: (b: MigrationBuilder) => void,
): MigrationOperation[] {
  const b = new MigrationBuilder();
  body(b);
  return b.build();
}
