import { describe, it, expect } from "vitest";
import { ModelBuilder } from "../../../src/ModelBuilder/ModelBuilder.js";
import { ChangeTracker } from "../../../src/ChangeTracker/ChangeTracker.js";
import { DbSet } from "../../../src/DbSet.js";
import { FakeStorageProvider } from "../fakes/FakeStorageProvider.js";
import { TestPrincipal as Principal } from "../fakes/testPrincipals.js";

// Regression: .expand() of a Person field must NOT request `<nav>/PrincipalType`.
// SharePoint exposes a person field's UserInfo projection (Id/Title/EMail/Name)
// via inline $expand, but rejects PrincipalType:
//   "The query to field 'Owner/PrincipalType' is not valid."
// PrincipalType is only obtainable by resolving the principal directly (the
// .include() path via web/siteusers), so it stays a Principal column but is
// excluded from the inline-expand default.
class Project {
  Id?: number;
  Title?: string;
  OwnerId?: number;
  Owner?: Principal;
}

function build() {
  const mb = new ModelBuilder();
  mb.entity(Principal, (b) => {
    b.toProviderSource({ kind: "provider", key: "principals" });
    b.property((p) => p.Title).isText();
    b.property((p) => p.Email)
      .isText()
      .hasColumnName("EMail");
    b.property((p) => p.LoginName)
      .isText()
      .hasColumnName("Name");
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

function projectSet(): DbSet<Project> {
  const model = build();
  const provider = new FakeStorageProvider();
  const tracker = new ChangeTracker(model, provider);
  return new DbSet<Project>(Project, model, provider, tracker);
}

describe(".expand() person-field default projection", () => {
  it("asks for the target's whole column set — the provider projects what an inline expand answers", () => {
    const q = projectSet().expand((p) => p.Owner);
    const spec = q.state.expands.find((e) => e.navName === "Owner");
    expect(spec).toBeDefined();
    expect(spec!.fields).toContain("Title");
    expect(spec!.fields).toContain("EMail");
    expect(spec!.fields).toContain("Name");
    expect(spec!.fields).toContain("PrincipalType");
  });

  it("still honors explicit fields verbatim (caller choice is respected)", () => {
    const q = projectSet().expand((p) => p.Owner, ["Title"]);
    const spec = q.state.expands.find((e) => e.navName === "Owner");
    expect(spec!.fields).toEqual(["Title"]);
  });
});
