import { describe, it, expect } from "vitest";
import {
  DbContext,
  initSpeelDbContext,
  InvalidOperationException,
  type ModelBuilder,
} from "@speel/core";
import { FakeStorageProvider } from "@speel/core/testing";
import { ResourceResolver } from "../src/ResourceResolver.js";
import { item, itemIn, list, web } from "../src/resources.js";

class Contract {
  Id?: number;
  Title?: string;
}
class Unmapped {
  Id?: number;
}

class Ctx extends DbContext {
  public contracts = this.set(Contract);
  protected override onModelCreating(b: ModelBuilder): void {
    b.entity(Contract, (e) => {
      e.toList("Contracts");
      e.property((p) => p.Title).isText();
    });
  }
}

function resolver(): ResourceResolver {
  const db = initSpeelDbContext(Ctx, (b) =>
    b.useProvider(new FakeStorageProvider()),
  );
  return new ResourceResolver(db);
}

describe("ResourceResolver", () => {
  it("resolves a saved entity to its list and id", () => {
    const contract = new Contract();
    contract.Id = 4;
    expect(resolver().resolve(item(contract))).toEqual({
      kind: "item",
      list: "Contracts",
      id: 4,
    });
  });

  it("names the entity when it has no Id yet", () => {
    // An unsaved entity has no item to secure; the message has to say which one.
    expect(() => resolver().resolve(item(new Contract()))).toThrow(/Contract/);
    expect(() => resolver().resolve(item(new Contract()))).toThrow(
      InvalidOperationException,
    );
  });

  it("throws when the entity type is not mapped to a list", () => {
    const stray = new Unmapped();
    stray.Id = 4;
    expect(() => resolver().resolve(item(stray))).toThrow(/Unmapped/);
  });

  it("passes web, list, and item descriptors through untouched", () => {
    const r = resolver();
    expect(r.resolve(web())).toEqual({ kind: "web" });
    expect(r.resolve(list("Contracts"))).toEqual({
      kind: "list",
      list: "Contracts",
    });
    expect(r.resolve(itemIn("Contracts", 9))).toEqual({
      kind: "item",
      list: "Contracts",
      id: 9,
    });
  });
});
