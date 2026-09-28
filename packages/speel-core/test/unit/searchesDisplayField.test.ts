// test/unit/searchesDisplayField.test.ts
import { describe, it, expect, vi } from "vitest";
import { DbContext } from "../../src/DbContext.js";
import { ModelBuilder } from "../../src/ModelBuilder/ModelBuilder.js";
import { initSpeelDbContext } from "../../src/initSpeelDbContext.js";
import {
  searchesDisplayField,
  OPTIONS_QUERY_TAKE,
} from "../../src/Metadata/optionsLoader.js";
import { FakeStorageProvider } from "./fakes/FakeStorageProvider.js";

class Office {
  Id?: number;
  Title?: string;
  Code?: string;
}

class Ctx extends DbContext {
  public offices = this.set(Office);
  protected override onModelCreating(mb: ModelBuilder): void {
    mb.entity(Office, (b) => {
      b.toList("Offices");
      b.property((e) => e.Id).isNumber();
      b.property((e) => e.Title).isText();
      b.property((e) => e.Code).isText();
    });
  }
}

function newCtx(): { db: Ctx; fake: FakeStorageProvider } {
  const fake = new FakeStorageProvider();
  const db = initSpeelDbContext(Ctx, (b) => b.useProvider(fake));
  return { db, fake };
}

describe("searchesDisplayField", () => {
  it("narrows on the display column at the source and caps the read", async () => {
    const { db, fake } = newCtx();
    const spy = vi.spyOn(fake, "getItemsPagedAsync");
    const loader = searchesDisplayField();

    await loader({
      query: "Lon",
      set: db.set(Office),
      db,
      source: {},
      displayField: "Title",
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const [, , pageSize, , options] = spy.mock.calls[0]!;
    expect(pageSize).toBe(OPTIONS_QUERY_TAKE);
    expect(options?.filter).toEqual({
      kind: "string",
      column: "Title",
      op: "contains",
      value: "Lon",
    });
  });

  it("reads the first page unfiltered when nothing is typed", async () => {
    const { db, fake } = newCtx();
    const spy = vi.spyOn(fake, "getItemsPagedAsync");
    const loader = searchesDisplayField();

    await loader({
      query: "",
      set: db.set(Office),
      db,
      source: {},
      displayField: "Title",
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const [, , pageSize, , options] = spy.mock.calls[0]!;
    expect(pageSize).toBe(OPTIONS_QUERY_TAKE);
    expect(options?.filter).toBeUndefined();
  });

  it("takes a custom cap", async () => {
    const { db, fake } = newCtx();
    const spy = vi.spyOn(fake, "getItemsPagedAsync");
    const loader = searchesDisplayField({ take: 20 });

    await loader({
      query: "",
      set: db.set(Office),
      db,
      source: {},
      displayField: "Title",
    });

    const [, , pageSize] = spy.mock.calls[0]!;
    expect(pageSize).toBe(20);
  });

  it("searches whichever column the lookup displays", async () => {
    const { db, fake } = newCtx();
    const spy = vi.spyOn(fake, "getItemsPagedAsync");
    const loader = searchesDisplayField();

    await loader({
      query: "AB",
      set: db.set(Office),
      db,
      source: {},
      displayField: "Code",
    });

    const [, , , , options] = spy.mock.calls[0]!;
    expect(options?.filter).toEqual({
      kind: "string",
      column: "Code",
      op: "contains",
      value: "AB",
    });
  });
});
