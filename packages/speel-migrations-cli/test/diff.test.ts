import { describe, it, expect } from "vitest";
import { diffSnapshots } from "../src/diff.js";
import type { SnapshotDoc } from "../src/snapshot.js";

const empty: SnapshotDoc = { version: 1, entities: [] };
const withProjects: SnapshotDoc = {
  version: 1,
  entities: [
    {
      list: { title: "Projects", template: "genericList" },
      fields: [
        {
          kind: "Text",
          internalName: "Title",
          multiline: false,
          required: true,
        },
        { kind: "Number", internalName: "Rank" },
      ],
    },
  ],
};

describe("diffSnapshots", () => {
  it("new list → createList + addField per field; down drops the list", () => {
    const { up, down } = diffSnapshots(empty, withProjects);
    expect(up.map((o) => o.op)).toEqual(["createList", "addField", "addField"]);
    expect(up[0]).toMatchObject({ op: "createList", title: "Projects" });
    expect(down.map((o) => o.op)).toEqual(["dropList"]);
    expect(down[0]).toEqual({ op: "dropList", title: "Projects" });
  });

  it("removed list → dropList; down recreates it with its fields", () => {
    const { up, down } = diffSnapshots(withProjects, empty);
    expect(up).toEqual([{ op: "dropList", title: "Projects" }]);
    expect(down.map((o) => o.op)).toEqual([
      "createList",
      "addField",
      "addField",
    ]);
  });

  it("added field → addField; removed field → dropField (mirrored in down)", () => {
    const next: SnapshotDoc = {
      version: 1,
      entities: [
        {
          list: { title: "Projects", template: "genericList" },
          fields: [
            {
              kind: "Text",
              internalName: "Title",
              multiline: false,
              required: true,
            },
          ],
        },
      ],
    };
    const { up, down } = diffSnapshots(withProjects, next); // Rank removed
    expect(up).toEqual([{ op: "dropField", list: "Projects", name: "Rank" }]);
    expect(down).toEqual([
      {
        op: "addField",
        list: "Projects",
        field: { kind: "Number", internalName: "Rank" },
      },
    ]);
  });

  it("changed attribute → alterField (to new) with down alterField (to old)", () => {
    const next: SnapshotDoc = {
      version: 1,
      entities: [
        {
          list: { title: "Projects", template: "genericList" },
          fields: [
            {
              kind: "Text",
              internalName: "Title",
              multiline: false,
              required: false,
            }, // required flipped
            { kind: "Number", internalName: "Rank" },
          ],
        },
      ],
    };
    const { up, down } = diffSnapshots(withProjects, next);
    expect(up).toEqual([
      {
        op: "alterField",
        list: "Projects",
        field: {
          kind: "Text",
          internalName: "Title",
          multiline: false,
          required: false,
        },
      },
    ]);
    expect(down).toEqual([
      {
        op: "alterField",
        list: "Projects",
        field: {
          kind: "Text",
          internalName: "Title",
          multiline: false,
          required: true,
        },
      },
    ]);
  });

  it("index-only change → addIndex/dropIndex (not alterField)", () => {
    const before: SnapshotDoc = {
      version: 1,
      entities: [
        {
          list: { title: "P", template: "genericList" },
          fields: [{ kind: "Number", internalName: "N" }],
        },
      ],
    };
    const after: SnapshotDoc = {
      version: 1,
      entities: [
        {
          list: { title: "P", template: "genericList" },
          fields: [{ kind: "Number", internalName: "N", indexed: true }],
        },
      ],
    };
    const { up, down } = diffSnapshots(before, after);
    expect(up).toEqual([{ op: "addIndex", list: "P", field: "N" }]);
    expect(down).toEqual([{ op: "dropIndex", list: "P", field: "N" }]);
  });

  it("no changes → empty up and down", () => {
    expect(diffSnapshots(withProjects, withProjects)).toEqual({
      up: [],
      down: [],
      warnings: [],
    });
  });

  it("creates all lists before any fields so cross-list lookups resolve", () => {
    const two: SnapshotDoc = {
      version: 1,
      entities: [
        {
          list: { title: "Projects", template: "genericList" },
          fields: [
            {
              kind: "Lookup",
              internalName: "TagsId",
              list: "Tags",
              showField: "Title",
              multi: true,
            },
          ],
        },
        {
          list: { title: "Tags", template: "genericList" },
          fields: [{ kind: "Text", internalName: "Title", multiline: false }],
        },
      ],
    };
    const { up } = diffSnapshots(empty, two);
    const lastCreate = up.map((o) => o.op).lastIndexOf("createList");
    const firstAdd = up.findIndex((o) => o.op === "addField");
    expect(up.filter((o) => o.op === "createList")).toHaveLength(2);
    expect(lastCreate).toBeLessThan(firstAdd); // every createList precedes every addField
  });
});

describe("diffSnapshots data-loss warnings", () => {
  const withValue = (multiline: boolean): SnapshotDoc => ({
    version: 1,
    entities: [
      {
        list: { title: "Config", template: "genericList" },
        fields: [{ kind: "Text", internalName: "Value", multiline }],
      },
    ],
  });

  it("flags the narrowing direction of a type change — here the down", () => {
    const diff = diffSnapshots(withValue(false), withValue(true));
    expect(diff.warnings).toHaveLength(1);
    expect(diff.warnings?.[0]).toMatchObject({ direction: "down" });
    expect(diff.warnings?.[0]?.op).toBe(diff.down[0]);
    expect(diff.warnings?.[0]?.message).toMatch(/255 characters/);
  });

  it("flags the up when the model narrows", () => {
    const diff = diffSnapshots(withValue(true), withValue(false));
    expect(diff.warnings?.map((w) => w.direction)).toEqual(["up"]);
    expect(diff.warnings?.[0]?.op).toBe(diff.up[0]);
  });
});
