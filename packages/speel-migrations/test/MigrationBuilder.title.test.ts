import { describe, it, expect } from "vitest";
import { recordOps } from "../src/operations/MigrationBuilder.js";

describe("MigrationBuilder — the built-in Title column", () => {
  it("records a declared Title as an alterField, never an addField", () => {
    const ops = recordOps((b) => {
      b.createList("Emails");
      b.addField("Emails", "Title", (f) =>
        f.text({ displayName: "Subject", maxLength: 255 }),
      );
    });
    expect(ops.map((o) => o.op)).toEqual(["createList", "alterField"]);
    expect(ops[1]).toMatchObject({
      op: "alterField",
      list: "Emails",
      field: {
        kind: "Text",
        internalName: "Title",
        displayName: "Subject",
        maxLength: 255,
      },
    });
  });

  it("relaxes the built-in Title of a created list that declares none", () => {
    const ops = recordOps((b) => {
      b.createList("Tasks");
    });
    expect(ops.map((o) => o.op)).toEqual(["createList", "alterField"]);
    expect(ops[1]).toEqual({
      op: "alterField",
      list: "Tasks",
      field: {
        kind: "Text",
        internalName: "Title",
        multiline: false,
        required: false,
      },
    });
  });

  it("leaves the built-in alone when the migration declares a Title", () => {
    const ops = recordOps((b) => {
      b.createList("Emails");
      b.addField("Emails", "Title", (f) => f.text({ required: true }));
    });
    expect(ops.filter((o) => o.op === "alterField")).toHaveLength(1);
  });

  it("leaves the built-in alone when the migration renames it", () => {
    const ops = recordOps((b) => {
      b.createList("Tasks");
      b.renameField("Tasks", "Title", "Subject");
    });
    expect(ops.map((o) => o.op)).toEqual(["createList", "renameField"]);
  });

  it("leaves the built-in alone when the migration alters it directly", () => {
    const ops = recordOps((b) => {
      b.createList("Tasks");
      b.alterField("Tasks", "Title", (f) => f.text({ required: true }));
    });
    expect(ops.map((o) => o.op)).toEqual(["createList", "alterField"]);
  });

  it("relaxes nothing for a list this migration did not create", () => {
    const ops = recordOps((b) => {
      b.addField("Existing", "Name", (f) => f.text({}));
    });
    expect(ops.map((o) => o.op)).toEqual(["addField"]);
  });

  it("appends the relax ops after every field, so they share one wave", () => {
    const ops = recordOps((b) => {
      b.createList("A");
      b.createList("B");
      b.addField("A", "Name", (f) => f.text({}));
    });
    expect(ops.map((o) => o.op)).toEqual([
      "createList",
      "createList",
      "addField",
      "alterField",
      "alterField",
    ]);
    expect(ops[3]).toMatchObject({ list: "A" });
    expect(ops[4]).toMatchObject({ list: "B" });
  });

  it("relaxes before a following run step, so data writes are not blocked", () => {
    const ops = recordOps((b) => {
      b.createList("Tasks");
      b.run(async () => {});
    });
    expect(ops.map((o) => o.op)).toEqual(["createList", "alterField", "run"]);
  });
});
