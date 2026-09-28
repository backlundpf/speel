import { describe, it, expect } from "vitest";
import {
  QueryExecutor,
  type IQueryState,
} from "../../../src/Query/QueryExecutor.js";
import { ChangeTracker } from "../../../src/ChangeTracker/ChangeTracker.js";
import { Model } from "../../../src/Metadata/Model.js";
import { EntityType } from "../../../src/Metadata/EntityType.js";
import { Property } from "../../../src/Metadata/Property.js";
import { and, type FilterNode } from "../../../src/Query/FilterNode.js";
import type { IGetItemsOptions } from "../../../src/providers/ISharePointProvider.js";
import { FakeStorageProvider } from "../fakes/FakeStorageProvider.js";

class Doc {
  Id?: number;
  Title?: string;
}

function setup() {
  const id = new Property({
    propertyName: "Id",
    columnName: "ID",
    displayName: "ID",
    config: { kind: "Number" },
    required: true,
    readOnly: true,
    key: true,
  });
  const title = new Property({
    propertyName: "Title",
    columnName: "Title",
    displayName: "Title",
    config: { kind: "Text", multiline: false },
    required: false,
    readOnly: false,
    key: false,
  });
  const et = new EntityType<Doc>({
    ctor: Doc,
    list: { kind: "title", value: "Docs" },
    properties: [id, title],
  });
  const model = new Model([et]);
  const provider = new FakeStorageProvider();
  const tracker = new ChangeTracker(model);

  const seenPaged: (IGetItemsOptions | undefined)[] = [];
  const seenCount: (
    { filter?: FilterNode; includeContainers?: boolean } | undefined
  )[] = [];
  const origPaged = provider.getItemsPagedAsync.bind(provider);
  provider.getItemsPagedAsync = async (
    list,
    fields,
    pageSize,
    cursor,
    options,
  ) => {
    seenPaged.push(options);
    return origPaged(list, fields, pageSize, cursor, options);
  };
  const origCount = provider.countAsync.bind(provider);
  provider.countAsync = async (list, options) => {
    seenCount.push(options);
    return origCount(list, options);
  };

  const exec = new QueryExecutor<Doc>(provider, tracker);
  const state: IQueryState<Doc> = {
    entityType: et,
    orderBy: [],
    noTracking: true,
    includes: [],
    expands: [],
  };
  return { exec, state, seenPaged, seenCount };
}

const marker: FilterNode = { kind: "include-containers" };
const cmp: FilterNode = {
  kind: "compare",
  column: "Title",
  op: "eq",
  value: "A",
};

describe("QueryExecutor container hoisting", () => {
  it("passes no includeContainers flag for a marker-free query", async () => {
    const { exec, state, seenPaged } = setup();
    await exec.toArrayAsync({ ...state, filter: cmp });
    expect(seenPaged[0]?.filter).toEqual(cmp);
    expect(seenPaged[0]?.includeContainers).toBeUndefined();
  });

  it("strips the marker and sets includeContainers for toArrayAsync", async () => {
    const { exec, state, seenPaged } = setup();
    await exec.toArrayAsync({ ...state, filter: and(marker, cmp) });
    expect(seenPaged[0]?.filter).toEqual(cmp);
    expect(seenPaged[0]?.includeContainers).toBe(true);
  });

  it("a marker-only filter hoists to the flag with no filter at all", async () => {
    const { exec, state, seenPaged } = setup();
    await exec.toArrayAsync({ ...state, filter: marker });
    expect(seenPaged[0]?.filter).toBeUndefined();
    expect(seenPaged[0]?.includeContainers).toBe(true);
  });

  it("countAsync hoists identically", async () => {
    const { exec, state, seenCount } = setup();
    await exec.countAsync({ ...state, filter: and(marker, cmp) });
    expect(seenCount[0]?.filter).toEqual(cmp);
    expect(seenCount[0]?.includeContainers).toBe(true);
  });
});
