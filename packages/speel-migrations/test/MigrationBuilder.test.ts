import { describe, it, expect } from "vitest";
import { recordOps } from "../src/operations/MigrationBuilder.js";
import { defineMigration } from "../src/defineMigration.js";

describe("MigrationBuilder", () => {
  it("records operations in declared order", () => {
    const ops = recordOps((b) => {
      b.createList("Projects", {
        template: "genericList",
        url: "Lists/Projects",
      });
      b.addField("Projects", "Title", (f) => f.text({ required: true }));
      b.addIndex("Projects", "Title");
      b.dropList("Old");
    });
    // Title is the built-in column, so declaring it alters rather than adds.
    expect(ops.map((o) => o.op)).toEqual([
      "createList",
      "alterField",
      "addIndex",
      "dropList",
    ]);
    expect(ops[0]).toEqual({
      op: "createList",
      title: "Projects",
      spec: {
        title: "Projects",
        template: "genericList",
        url: "Lists/Projects",
      },
    });
    expect(ops[1]).toMatchObject({
      op: "alterField",
      list: "Projects",
      field: { kind: "Text", internalName: "Title", required: true },
    });
  });

  it("createList defaults template to genericList", () => {
    const [op] = recordOps((b) => b.createList("X"));
    expect(op).toEqual({
      op: "createList",
      title: "X",
      spec: { title: "X", template: "genericList" },
    });
  });

  it("run records a RunCustom holding the fn", () => {
    const fn = async () => {};
    const ops = recordOps((b) => b.run(fn));
    expect(ops[0]).toEqual({ op: "run", run: fn });
  });

  it("defineMigration returns { id, up, down }", () => {
    const m = defineMigration("20260605T1200_X", {
      up: (b) => b.dropList("Y"),
      down: (b) => b.createList("Y"),
    });
    expect(m.id).toBe("20260605T1200_X");
    expect(recordOps(m.up).map((o) => o.op)).toEqual(["dropList"]);
    // createList trails an alterField relaxing the built-in Title it declares none for.
    expect(recordOps(m.down).map((o) => o.op)).toEqual([
      "createList",
      "alterField",
    ]);
  });
});

describe("MigrationBuilder.run labels", () => {
  it("records a label when one is supplied, and still records the function", async () => {
    const ops = recordOps((b) => {
      b.run("backfill task statuses", async ({ state }) => {
        state.hit = true;
      });
    });
    expect(ops).toHaveLength(1);
    const op = ops[0]!;
    expect(op.op).toBe("run");
    if (op.op !== "run") throw new Error("expected a run op");
    expect(op.label).toBe("backfill task statuses");
    const state: Record<string, unknown> = {};
    await op.run({ context: {} as never, state });
    expect(state.hit).toBe(true);
  });

  it("omits label entirely for the unlabelled form", () => {
    const ops = recordOps((b) => {
      b.run(async () => {});
    });
    const op = ops[0]!;
    if (op.op !== "run") throw new Error("expected a run op");
    expect("label" in op).toBe(false);
  });
});
