import { describe, it, expect } from "vitest";
import {
  emptySnapshot,
  isSatisfied,
  applyResultToSnapshot,
  type SchemaSnapshot,
} from "../src/schema/SchemaSnapshot.js";
import type { SchemaOperation } from "../src/operations/operations.js";

function snapWith(): SchemaSnapshot {
  const snap = emptySnapshot();
  snap.lists.set("Tasks", {
    id: "tasks-guid",
    title: "Tasks",
    fields: new Map([
      [
        "Due",
        {
          internalName: "Due",
          typeAsString: "DateTime",
          required: false,
          indexed: true,
        },
      ],
    ]),
  });
  return snap;
}

const createTasks: SchemaOperation = {
  op: "createList",
  title: "Tasks",
  spec: { title: "Tasks", template: "genericList" },
};

describe("isSatisfied", () => {
  it("skips createList when the list is present, sends it when absent", () => {
    expect(isSatisfied(snapWith(), createTasks)).toBe(true);
    expect(isSatisfied(emptySnapshot(), createTasks)).toBe(false);
  });

  it("skips dropList when the list is already gone", () => {
    const op: SchemaOperation = { op: "dropList", title: "Tasks" };
    expect(isSatisfied(emptySnapshot(), op)).toBe(true);
    expect(isSatisfied(snapWith(), op)).toBe(false);
  });

  it("skips renameList once the source title is gone", () => {
    const op: SchemaOperation = { op: "renameList", from: "Tasks", to: "Work" };
    expect(isSatisfied(emptySnapshot(), op)).toBe(true);
    expect(isSatisfied(snapWith(), op)).toBe(false);
  });

  it("skips addField when the field is present", () => {
    const present: SchemaOperation = {
      op: "addField",
      list: "Tasks",
      field: {
        kind: "DateTime",
        internalName: "Due",
        displayFormat: "DateOnly",
        friendlyFormat: "Disabled",
      },
    };
    const absent: SchemaOperation = {
      op: "addField",
      list: "Tasks",
      field: { kind: "Boolean", internalName: "Done" },
    };
    expect(isSatisfied(snapWith(), present)).toBe(true);
    expect(isSatisfied(snapWith(), absent)).toBe(false);
  });

  it("skips dropField when the field is already gone", () => {
    expect(
      isSatisfied(snapWith(), { op: "dropField", list: "Tasks", name: "Due" }),
    ).toBe(false);
    expect(
      isSatisfied(snapWith(), { op: "dropField", list: "Tasks", name: "Gone" }),
    ).toBe(true);
  });

  it("reads real index state for addIndex / dropIndex", () => {
    expect(
      isSatisfied(snapWith(), { op: "addIndex", list: "Tasks", field: "Due" }),
    ).toBe(true);
    expect(
      isSatisfied(snapWith(), { op: "dropIndex", list: "Tasks", field: "Due" }),
    ).toBe(false);
  });

  it("sends index ops loudly when the field is missing entirely", () => {
    expect(
      isSatisfied(snapWith(), { op: "addIndex", list: "Tasks", field: "Nope" }),
    ).toBe(false);
    expect(
      isSatisfied(snapWith(), {
        op: "dropIndex",
        list: "Tasks",
        field: "Nope",
      }),
    ).toBe(false);
  });

  it("never skips alterField or renameField", () => {
    const alter: SchemaOperation = {
      op: "alterField",
      list: "Tasks",
      field: {
        kind: "DateTime",
        internalName: "Due",
        displayFormat: "DateOnly",
        friendlyFormat: "Disabled",
      },
    };
    expect(isSatisfied(snapWith(), alter)).toBe(false);
    expect(
      isSatisfied(snapWith(), {
        op: "renameField",
        list: "Tasks",
        from: "Due",
        to: "Deadline",
      }),
    ).toBe(false);
  });
});

describe("applyResultToSnapshot", () => {
  it("adds a created list under the id the batch returned", () => {
    const snap = emptySnapshot();
    applyResultToSnapshot(snap, {
      op: createTasks,
      status: "applied",
      listId: "new-guid",
    });
    expect(snap.lists.get("Tasks")?.id).toBe("new-guid");
    expect(snap.lists.get("Tasks")?.fields.size).toBe(0);
  });

  it("ignores failed results", () => {
    const snap = emptySnapshot();
    applyResultToSnapshot(snap, {
      op: createTasks,
      status: "failed",
      error: new Error("boom"),
    });
    expect(snap.lists.size).toBe(0);
  });

  it("records an added field with its required and indexed flags", () => {
    const snap = snapWith();
    applyResultToSnapshot(snap, {
      op: {
        op: "addField",
        list: "Tasks",
        field: {
          kind: "Boolean",
          internalName: "Done",
          required: true,
          indexed: true,
        },
      },
      status: "applied",
    });
    expect(snap.lists.get("Tasks")?.fields.get("Done")).toEqual({
      internalName: "Done",
      typeAsString: "Boolean",
      required: true,
      indexed: true,
    });
  });

  it("drops a deleted field and a recycled list", () => {
    const snap = snapWith();
    applyResultToSnapshot(snap, {
      op: { op: "dropField", list: "Tasks", name: "Due" },
      status: "applied",
    });
    expect(snap.lists.get("Tasks")?.fields.has("Due")).toBe(false);
    applyResultToSnapshot(snap, {
      op: { op: "dropList", title: "Tasks" },
      status: "applied",
    });
    expect(snap.lists.has("Tasks")).toBe(false);
  });

  it("re-keys a renamed list and flips index state", () => {
    const snap = snapWith();
    applyResultToSnapshot(snap, {
      op: { op: "renameList", from: "Tasks", to: "Work" },
      status: "applied",
    });
    expect(snap.lists.has("Tasks")).toBe(false);
    expect(snap.lists.get("Work")?.title).toBe("Work");
    applyResultToSnapshot(snap, {
      op: { op: "dropIndex", list: "Work", field: "Due" },
      status: "applied",
    });
    expect(snap.lists.get("Work")?.fields.get("Due")?.indexed).toBe(false);
  });

  it("leaves the internal-name key alone for renameField", () => {
    const snap = snapWith();
    applyResultToSnapshot(snap, {
      op: { op: "renameField", list: "Tasks", from: "Due", to: "Deadline" },
      status: "applied",
    });
    expect(snap.lists.get("Tasks")?.fields.has("Due")).toBe(true);
    expect(snap.lists.get("Tasks")?.fields.has("Deadline")).toBe(false);
  });
});
