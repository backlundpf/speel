import { describe, it, expect, beforeEach } from "vitest";
import { ModelBuilder } from "../../../src/ModelBuilder/ModelBuilder.js";
import { ChangeTracker } from "../../../src/ChangeTracker/ChangeTracker.js";
import { DbSet } from "../../../src/DbSet.js";
import { FakeStorageProvider } from "../fakes/FakeStorageProvider.js";
import type { IListHandle } from "../../../src/types.js";
import { TestPrincipal as Principal } from "../fakes/testPrincipals.js";

class Project {
  Id?: number;
  Title?: string;
  OwnerId?: number;
  Owner?: Principal;
}

const projectsList: IListHandle = { kind: "title", value: "Projects" };

function build() {
  const mb = new ModelBuilder();
  mb.entity(Principal, (b) => {
    b.toProviderSource({ kind: "provider", key: "principals" });
    b.property((p) => p.Title).isText();
    b.property((p) => p.PrincipalType).isNumber();
  });
  mb.entity(Project, (b) => {
    b.toList("Projects");
    b.property((p) => p.Title).isText();
    b.hasOne(Principal, (p) => p.Owner)
      .withMany()
      .hasForeignKey((p) => p.OwnerId);
  });
  return mb.build();
}

describe("include of a person field resolves through the principals provider source", () => {
  let provider: FakeStorageProvider;
  beforeEach(async () => {
    provider = new FakeStorageProvider();
    // One registry holds both a user and a group, as the User Information List
    // does; the `principals` view serves both by id.
    provider.seedPrincipal({
      Id: 1,
      Title: "Alice",
      LoginName: "i:0#.f|m|alice",
      PrincipalType: 1,
    });
    provider.seedPrincipal({
      Id: 2,
      Title: "Owners",
      LoginName: "Owners",
      PrincipalType: 8,
    });
    provider.seedRow(projectsList, { Title: "P1", OwnerId: 1 });
    provider.seedRow(projectsList, { Title: "P2", OwnerId: 2 });
  });

  it("loads Owner through itemsByIds on the provider source (not a list read)", async () => {
    const model = build();
    const tracker = new ChangeTracker(model, provider);
    const set = new DbSet<Project>(Project, model, provider, tracker);
    const r = await set
      .orderBy((b) => b.Title)
      .include((p) => p.Owner)
      .toArrayAsync();
    expect(r[0]!.Owner).toBeInstanceOf(Principal);
    expect(r[0]!.Owner!.Title).toBe("Alice");
  });

  it("resolves a group from the same call (PrincipalType discriminates)", async () => {
    const model = build();
    const tracker = new ChangeTracker(model, provider);
    const set = new DbSet<Project>(Project, model, provider, tracker);
    const r = await set
      .orderBy((b) => b.Title)
      .include((p) => p.Owner)
      .toArrayAsync();
    // P2's owner is a SharePoint group — resolved by the same read.
    expect(r[1]!.Owner!.Title).toBe("Owners");
    expect(r[1]!.Owner!.PrincipalType).toBe(8);
  });
});
