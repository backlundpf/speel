import { describe, it, expect, beforeAll } from "vitest";
import { FakeStorageProvider } from "../../../src/testing/FakeStorageProvider.js";
import {
  providerConformanceCases,
  type IProviderConformanceHarness,
} from "../../../src/testing/conformance/providerConformance.js";
import { DbContext } from "../../../src/DbContext.js";
import { ModelBuilder } from "../../../src/ModelBuilder/ModelBuilder.js";
import { SpeelEntity } from "../../../src/SpeelEntity.js";

// The harness hands the suite REAL model properties — built by ModelBuilder over
// the same shapes the sample's ProjectDashboardContext declares — so the fake run
// exercises exactly the metadata core sends: FK columns named `${nav}Id`, person
// navigations against a provider-source entity, a document-library entity.
//
// Core ships no Principal: a core-only app models a person column by declaring
// its own class against the `principals` provider source, which is what this does.
class Person {
  Id?: number;
  Title?: string;
  LoginName?: string;
  Email?: string;
  PrincipalType?: number;
}
class Tag extends SpeelEntity {
  Title: string | null = null;
}
class ConformanceItem extends SpeelEntity {
  Title: string | null = null;
  RepoUrl: string | null = null;
  IsPublic: boolean | null = null;
  StartDate: Date | null = null;
  Labels: string[] | null = null;
  Tags: Tag[] | null = null;
  TagsId: number[] | null = null;
  Owner: Person | null = null;
  OwnerId: number | null = null;
  Reviewers: Person[] | null = null;
  ReviewersId: number[] | null = null;
}
class Artifact extends SpeelEntity {
  Title: string | null = null;
}
class ConformanceContext extends DbContext {
  items = this.set(ConformanceItem);
  tags = this.set(Tag);
  artifacts = this.set(Artifact);
  people = this.set(Person);
  protected override onModelCreating(b: ModelBuilder): void {
    b.entity(Person, (e) => {
      e.toProviderSource({ kind: "provider", key: "principals" });
      e.property((p) => p.Title).isText();
      e.property((p) => p.LoginName).isText();
      e.property((p) => p.Email).isText();
      e.property((p) => p.PrincipalType).isNumber();
    });
    b.entity(Tag, (e) => {
      e.toList("Tags");
      e.property((t) => t.Title).isText();
    });
    b.entity(Artifact, (e) => {
      e.toList("ProjectArtifacts", { template: "documentLibrary" });
      e.property((a) => a.Title).isText();
    });
    b.entity(ConformanceItem, (e) => {
      e.toList("Projects");
      e.property((i) => i.Title).isText();
      e.property((i) => i.RepoUrl).isText();
      e.property((i) => i.IsPublic).isBoolean();
      e.property((i) => i.StartDate).isDateTime();
      e.property((i) => i.Labels)
        .isMultiChoice()
        .hasOptions(["Compliance", "Security"]);
      e.hasMany(Tag, (i) => i.Tags)
        .withMany()
        .hasForeignKey((i) => i.TagsId);
      e.hasOne(Person, (i) => i.Owner)
        .withMany()
        .hasForeignKey((i) => i.OwnerId);
      e.hasMany(Person, (i) => i.Reviewers)
        .withMany()
        .hasForeignKey((i) => i.ReviewersId);
    });
  }
}

const USER = {
  Id: 6,
  Title: "Ada Lovelace",
  LoginName: "i:0#.f|membership|ada@contoso.test",
  Email: "ada@contoso.test",
};
const USER2 = {
  Id: 7,
  Title: "Bob Byte",
  LoginName: "i:0#.f|membership|bob@contoso.test",
  Email: "bob@contoso.test",
};
const GROUP = { Id: 12, Title: "Audit Members", LoginName: "Audit Members" };

function buildHarness(): IProviderConformanceHarness & {
  fake: FakeStorageProvider;
} {
  const fake = new FakeStorageProvider();
  // The registry is one record per id, so the seeds can HOLD values in columns a
  // key does not carry (group-only columns on a user, Email on a group). Without
  // them the carriage case is vacuous against this fake: a projection omits an
  // absent value whether or not it guards carriage. Live, a real record proves the
  // same thing by the $select the provider dares to send.
  fake.seedPrincipal({
    ...USER,
    PrincipalType: 1,
    Description: "held, but not a siteUsers column",
    OwnerTitle: "held, but not a siteUsers column",
  });
  fake.seedPrincipal({ ...USER2, PrincipalType: 1 });
  fake.seedPrincipal({
    ...GROUP,
    PrincipalType: 8,
    Email: "held-but-not-a-siteGroups-column@contoso.test",
    Description: "Auditors",
    OwnerTitle: USER.Title,
  });
  // A second group, so a Title filter on siteGroups that was silently dropped
  // would return more than the one group the cases expect.
  fake.seedPrincipal({
    Id: 13,
    Title: "Audit Owners",
    LoginName: "Audit Owners",
    PrincipalType: 8,
  });
  fake.seedPrincipal({
    Id: 15,
    Title: "Everyone except external users",
    LoginName: "c:0-.f|rolemanager|spo-grid-all-users/x",
    PrincipalType: 4,
  });
  const ctx = new ConformanceContext({ provider: fake });
  const item = ctx.model.findEntityType(ConformanceItem)!;
  const artifact = ctx.model.findEntityType(Artifact)!;
  const prop = (name: string) => {
    const p = item.findProperty(name);
    if (!p) throw new Error(`harness: ConformanceItem has no property ${name}`);
    return p;
  };
  return {
    fake,
    provider: fake,
    list: { kind: "title", value: "Projects" },
    baseFields: [{ property: prop("Title"), value: "conformance" }],
    properties: {
      text: prop("RepoUrl"),
      boolean: prop("IsPublic"),
      dateTime: prop("StartDate"),
      multiChoice: prop("Labels"),
      multiLookup: prop("TagsId"),
      person: prop("OwnerId"),
      multiPerson: prop("ReviewersId"),
    },
    libraryTitle: artifact.findProperty("Title")!,
    multiChoiceValues: ["Compliance", "Security"],
    lookupTarget: { kind: "title", value: "Tags" },
    folderPath: "SpeelE2E/Conformance",
    library: { kind: "title", value: "ProjectArtifacts" },
    principals: async () => ({ user: USER, secondUser: USER2, group: GROUP }),
    readBack: async (list, id, columns) => {
      const row = await fake.getItemByIdAsync(list, id, columns);
      if (!row) throw new Error(`readBack: no item ${id} in ${list.value}`);
      return row;
    },
    countPrincipalResolves: async (ids, fn) => {
      const before = fake.principalResolves().length;
      await fn();
      return fake
        .principalResolves()
        .slice(before)
        .filter((id) => ids.includes(id)).length;
    },
  };
}

describe("provider conformance — FakeStorageProvider", () => {
  const h = buildHarness();
  beforeAll(() => {
    h.fake.seedRow(h.lookupTarget, { Title: "alpha" });
    h.fake.seedRow(h.lookupTarget, { Title: "beta" });
  });
  const cases = providerConformanceCases(h);
  it("has unique case names", () => {
    expect(new Set(cases.map((c) => c.name)).size).toBe(cases.length);
  });
  for (const c of cases) it(c.name, c.run);
});
