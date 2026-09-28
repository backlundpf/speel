import { describe, it, expect, beforeEach } from "vitest";
import { ModelBuilder } from "../../../src/ModelBuilder/ModelBuilder.js";
import { ChangeTracker } from "../../../src/ChangeTracker/ChangeTracker.js";
import { DbSet } from "../../../src/DbSet.js";
import { FakeStorageProvider } from "../fakes/FakeStorageProvider.js";
import type { IListHandle } from "../../../src/types.js";
import { TestPrincipal as Principal } from "../fakes/testPrincipals.js";

// Mirrors the spfx-sample shape: a multi-value Person field
// (`Reviewers: Principal[]`) declared via hasMany(Principal).withMany(),
// which produces a `self-fk-array` nav with a number[] FK (`ReviewersId`).
class Project {
  Id?: number;
  Title?: string;
  ReviewersId?: number[];
  Reviewers?: Principal[];
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
    b.hasMany(Principal, (p) => p.Reviewers)
      .withMany()
      .hasForeignKey((p) => p.ReviewersId);
  });
  return mb.build();
}

describe("include of a multi-value person field (self-fk-array) routes through the principals source", () => {
  let provider: FakeStorageProvider;
  beforeEach(async () => {
    provider = new FakeStorageProvider();
    // One registry holds users and the group, as the User Information List does.
    provider.seedPrincipal({
      Id: 1,
      Title: "Alice",
      LoginName: "i:0#.f|m|alice",
      PrincipalType: 1,
    });
    provider.seedPrincipal({
      Id: 2,
      Title: "Bob",
      LoginName: "i:0#.f|m|bob",
      PrincipalType: 1,
    });
    provider.seedPrincipal({
      Id: 5,
      Title: "Owners",
      LoginName: "Owners",
      PrincipalType: 8,
    });
    provider.seedRow(projectsList, { Title: "P1", ReviewersId: [1, 2, 5] });
    provider.seedRow(projectsList, { Title: "P2", ReviewersId: [] });
  });

  it("materializes an array of Principals (users + group), collected from the FK array", async () => {
    const model = build();
    const tracker = new ChangeTracker(model, provider);
    const set = new DbSet<Project>(Project, model, provider, tracker);
    const r = await set.include((p) => p.Reviewers).toArrayAsync();

    const p1 = r.find((p) => p.Title === "P1")!;
    const p2 = r.find((p) => p.Title === "P2")!;

    expect(Array.isArray(p1.Reviewers)).toBe(true);
    expect(p1.Reviewers!.length).toBe(3);
    expect(p1.Reviewers!.every((x) => x instanceof Principal)).toBe(true);
    expect(p1.Reviewers!.map((x) => x.Title).sort()).toEqual([
      "Alice",
      "Bob",
      "Owners",
    ]);
    // group resolved from the same single read; PrincipalType discriminates
    expect(p1.Reviewers!.find((x) => x.Title === "Owners")!.PrincipalType).toBe(
      8,
    );

    // empty FK array → empty nav
    expect(p2.Reviewers).toEqual([]);
  });
});
