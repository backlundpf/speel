import { describe, it, expect } from "vitest";
import { computeWaves, splitFences } from "../src/plan/waves.js";
import type {
  MigrationOperation,
  SchemaOperation,
} from "../src/operations/operations.js";

const createList = (title: string): SchemaOperation => ({
  op: "createList",
  title,
  spec: { title, template: "genericList" },
});
const addBool = (list: string, name: string): SchemaOperation => ({
  op: "addField",
  list,
  field: { kind: "Boolean", internalName: name },
});
const addLookup = (
  list: string,
  name: string,
  target: string,
): SchemaOperation => ({
  op: "addField",
  list,
  field: {
    kind: "Lookup",
    internalName: name,
    list: target,
    showField: "Title",
    multi: false,
  },
});

describe("computeWaves", () => {
  it("keeps independent ops in one wave", () => {
    const ops = [createList("A"), createList("B"), createList("C")];
    expect(computeWaves(ops)).toEqual([ops]);
  });

  it("splits when a field targets a list created in the same wave", () => {
    const waves = computeWaves([
      createList("A"),
      createList("B"),
      addBool("A", "Done"),
    ]);
    expect(waves).toHaveLength(2);
    expect(waves[0]).toHaveLength(2);
    expect(waves[1]).toEqual([addBool("A", "Done")]);
  });

  it("splits when a lookup points at a list created in the same wave", () => {
    const waves = computeWaves([
      createList("Owners"),
      addLookup("Tasks", "Owner", "Owners"),
    ]);
    expect(waves).toHaveLength(2);
  });

  it("keeps a lookup at a pre-existing list in one wave", () => {
    const waves = computeWaves([
      createList("Tasks"),
      addLookup("Other", "Owner", "Owners"),
    ]);
    expect(waves).toHaveLength(1);
  });

  it("does not split on drop-after-add, since the list already existed", () => {
    const waves = computeWaves([
      addBool("A", "Done"),
      { op: "dropList", title: "A" },
    ]);
    expect(waves).toHaveLength(1);
  });

  it("splits again for a third dependency level", () => {
    const waves = computeWaves([
      createList("A"),
      addBool("A", "Done"),
      { op: "renameList", from: "A", to: "B" },
      addBool("B", "Extra"),
    ]);
    expect(waves).toHaveLength(3);
  });

  it("never reorders", () => {
    const ops = [
      createList("A"),
      addBool("A", "X"),
      createList("B"),
      addBool("B", "Y"),
    ];
    expect(computeWaves(ops).flat()).toEqual(ops);
  });

  it("returns no waves for no ops", () => {
    expect(computeWaves([])).toEqual([]);
  });

  it("models a lists-then-fields baseline as exactly two waves", () => {
    const ops = [
      ...["Alpha", "Beta", "Gamma"].map(createList),
      ...["Alpha", "Beta", "Gamma"].flatMap((l) => [
        addBool(l, "One"),
        addBool(l, "Two"),
      ]),
    ];
    const waves = computeWaves(ops);
    expect(waves).toHaveLength(2);
    expect(waves[0]).toHaveLength(3);
    expect(waves[1]).toHaveLength(6);
  });
});

describe("splitFences", () => {
  it("fences schema ops around each run op", () => {
    const run: MigrationOperation = {
      op: "run",
      run: async () => {},
      label: "seed",
    };
    const fences = splitFences([createList("A"), run, addBool("A", "Done")]);
    expect(fences).toEqual([
      { kind: "schema", ops: [createList("A")] },
      { kind: "run", op: run },
      { kind: "schema", ops: [addBool("A", "Done")] },
    ]);
  });

  it("emits a single schema fence when there are no run ops", () => {
    const fences = splitFences([createList("A"), createList("B")]);
    expect(fences).toHaveLength(1);
    expect(fences[0]).toEqual({
      kind: "schema",
      ops: [createList("A"), createList("B")],
    });
  });

  it("handles a migration that is only run ops", () => {
    const run: MigrationOperation = { op: "run", run: async () => {} };
    expect(splitFences([run, run])).toEqual([
      { kind: "run", op: run },
      { kind: "run", op: run },
    ]);
  });

  it("returns nothing for no ops", () => {
    expect(splitFences([])).toEqual([]);
  });
});
