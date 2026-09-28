// Fluent principal entities core's own tests model a person column against: the
// "an app declares its own class over a provider source" story. They coexist with
// core's decorated Principal/SiteUser/SiteGroup (provider keys are not unique per
// model); SpeelEntity's Author/Editor target core's SiteUser, not these.
import type { ModelBuilder } from "../../../src/ModelBuilder/ModelBuilder.js";
import type { EntityTypeBuilder } from "../../../src/ModelBuilder/EntityTypeBuilder.js";

export class TestPrincipal {
  Id?: number;
  Title?: string;
  LoginName?: string;
  Email?: string;
  PrincipalType?: number;
}
export class TestSiteUser extends TestPrincipal {}
export class TestSiteGroup extends TestPrincipal {
  Description?: string;
  OwnerTitle?: string;
}

export const PRINCIPALS = { kind: "provider", key: "principals" } as const;
export const SITE_USERS = { kind: "provider", key: "siteUsers" } as const;
export const SITE_GROUPS = { kind: "provider", key: "siteGroups" } as const;

function principalColumns<T extends TestPrincipal>(
  b: EntityTypeBuilder<T>,
): void {
  b.property((p) => p.Title).isText();
  b.property((p) => p.LoginName).isText();
  b.property((p) => p.Email).isText();
  b.property((p) => p.PrincipalType).isNumber();
}

/** Register the test principal types; `which` limits it (a model may want only one). */
export function registerTestPrincipals(
  mb: ModelBuilder,
  which: readonly ("principals" | "siteUsers" | "siteGroups")[] = [
    "principals",
    "siteUsers",
    "siteGroups",
  ],
): void {
  if (which.includes("principals"))
    mb.entity(TestPrincipal, (b) => {
      b.toProviderSource(PRINCIPALS);
      principalColumns(b);
    });
  if (which.includes("siteUsers"))
    mb.entity(TestSiteUser, (b) => {
      b.toProviderSource(SITE_USERS);
      principalColumns(b);
    });
  if (which.includes("siteGroups"))
    mb.entity(TestSiteGroup, (b) => {
      b.toProviderSource(SITE_GROUPS);
      principalColumns(b);
      b.property((g) => g.Description).isText();
      b.property((g) => g.OwnerTitle).isText();
    });
}
