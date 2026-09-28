import { describe, it, expect } from "vitest";
import { toSiteUser, toSiteGroup, toPrincipal } from "../src/mapPrincipal.js";
import { Principal, SiteGroup, SiteUser } from "@speel/core";

describe("mapPrincipal", () => {
  it("maps a site-user record", () => {
    const u = toSiteUser({
      Id: 7,
      Title: "Ada",
      Email: "ada@x.com",
      LoginName: "i:0#.f|membership|ada@x.com",
      PrincipalType: 1,
    });
    expect(u.Id).toBe(7);
    expect(u.Title).toBe("Ada");
    expect(u.Email).toBe("ada@x.com");
    expect(u.LoginName).toBe("i:0#.f|membership|ada@x.com");
    expect(u.PrincipalType).toBe(1);
  });

  it("accepts ID as well as Id, which is what some provider reads return", () => {
    expect(toSiteUser({ ID: 9 }).Id).toBe(9);
  });

  it("leaves an absent field undefined", () => {
    expect(toSiteUser({ Id: 7 }).Email).toBeUndefined();
  });

  it("maps a site group", () => {
    const g = toSiteGroup({
      Id: 3,
      Title: "Auditors",
      Description: "The auditors",
      OwnerTitle: "Ada",
      LoginName: "Auditors",
    });
    expect(g.Id).toBe(3);
    expect(g.Title).toBe("Auditors");
    expect(g.Description).toBe("The auditors");
    expect(g.OwnerTitle).toBe("Ada");
    expect(g.LoginName).toBe("Auditors");
  });

  it("maps a principal, keeping the type discriminator", () => {
    const p = toPrincipal({
      Id: 3,
      Title: "Auditors",
      PrincipalType: 8,
      Email: "a@x.com",
      LoginName: "c:0(.s|true",
    });
    expect(p.PrincipalType).toBe(8);
    expect(p.Title).toBe("Auditors");
    expect(p.Email).toBe("a@x.com");
    expect(p.LoginName).toBe("c:0(.s|true");
  });
});

describe("mapPrincipal — spelling and kind", () => {
  // Every IIdentityProvider read answers in model spelling — the same names the
  // decorated entities declare — so that is the one spelling the mappers read.
  // A record from a list-item read spells the key `ID`; that alias is kept.
  it("maps every model-spelled field, and nothing it was not asked to know", () => {
    const u = toSiteUser({
      Id: 7,
      Title: "Ada",
      Email: "ada@x.com",
      LoginName: "i:0#.f|membership|ada@x.com",
      PrincipalType: 1,
      EMail: "wrong@x.com",
      Name: "not-the-login",
    });
    expect(u).toBeInstanceOf(SiteUser);
    expect(u.Email).toBe("ada@x.com");
    expect(u.LoginName).toBe("i:0#.f|membership|ada@x.com");
    expect((u as unknown as Record<string, unknown>).EMail).toBeUndefined();
    expect((u as unknown as Record<string, unknown>).Name).toBeUndefined();
  });

  it("treats null like absent", () => {
    expect(toSiteUser({ Id: 7, Email: null }).Email).toBeUndefined();
  });

  it("gives a group the PrincipalType its endpoint omits", () => {
    // `web/siteGroups` never returns one, but everything it returns is a SharePoint
    // group — so a group mapped here agrees with the same group read through
    // `ctx.siteGroups`, which synthesises the 8 the same way.
    expect(toSiteGroup({ Id: 3, Title: "Auditors" }).PrincipalType).toBe(8);
    expect(toSiteGroup({ Id: 3, Title: "Auditors" })).toBeInstanceOf(SiteGroup);
  });

  it("leaves a principal's own PrincipalType alone", () => {
    // The counterpart to the rule above, and the whole reason `toPrincipal` is a
    // separate function: a role assignment's member may be a user or a group, and
    // the record says which. Stamping a kind here would overwrite the answer.
    expect(
      toPrincipal({ Id: 7, Title: "Ada", PrincipalType: 1 }).PrincipalType,
    ).toBe(1);
    expect(toPrincipal({ Id: 7 })).toBeInstanceOf(Principal);
  });
});
