import { describe, it, expect } from "vitest";
import { ModelBuilder } from "../../../src/ModelBuilder/ModelBuilder.js";
import type { EntityTypeBuilder } from "../../../src/ModelBuilder/EntityTypeBuilder.js";
import { TestSiteUser as SiteUser } from "../fakes/testPrincipals.js";

class Project {
  Id?: number;
  Title?: string;
  Owner?: SiteUser | null;
  OwnerId?: number;
}

function build(configure: (b: EntityTypeBuilder<Project>) => void) {
  const mb = new ModelBuilder();
  mb.entity(SiteUser, (b) => {
    b.toList({ title: "UserInfo" });
    b.property((u) => u.Title).isText();
  });
  mb.entity(Project, (b) => {
    b.toList("Projects");
    b.property((p) => p.Title).isText();
    b.hasOne(SiteUser, (p) => p.Owner)
      .withMany()
      .hasForeignKey((p) => p.OwnerId);
    configure(b);
  });
  return mb.build().findEntityType(Project)!;
}

describe("EntityTypeBuilder.useCaching", () => {
  it("is absent (cache undefined) when never called", () => {
    const et = build(() => {
      /* no caching */
    });
    expect(et.cache).toBeUndefined();
  });

  it("default useCaching() enables caching with no timeout and no expands", () => {
    const et = build((b) => b.useCaching());
    expect(et.cache).toEqual({ expands: [] });
  });

  it("captures timeout and expands from the config builder", () => {
    const et = build((b) =>
      b.useCaching((c) => c.withTimeout(60_000).expand((p) => p.Owner)),
    );
    expect(et.cache!.timeout).toBe(60_000);
    expect(et.cache!.expands).toEqual([{ navName: "Owner" }]);
  });

  it("captures explicit expand fields", () => {
    const et = build((b) =>
      b.useCaching((c) => c.expand((p) => p.Owner, ["Title", "EMail"])),
    );
    expect(et.cache!.expands).toEqual([
      { navName: "Owner", fields: ["Title", "EMail"] },
    ]);
  });
});
