import {
  ModelBuilder,
  Principal,
  SiteGroup,
  SiteUser,
  type EntityCtor,
  type Model,
} from "@speel/core";

// The three types' own model — built once — so what a principal's fields are called
// is stated exactly once, on the decorators, and these mappers read it from there.
let model: Model | undefined;
function principalModel(): Model {
  if (!model) {
    const mb = new ModelBuilder();
    mb.entity(Principal);
    mb.entity(SiteUser);
    mb.entity(SiteGroup);
    model = mb.build();
  }
  return model;
}

/**
 * Provider records into identity's principal types.
 *
 * Records arrive in model spelling (`Id`/`Title`/`LoginName`/`Email`/`PrincipalType`)
 * from every `IIdentityProvider` read; `ID` is accepted for `Id` because list-item
 * reads spell it so. Values are copied as the provider typed them; `null` and absent
 * both leave the field undefined.
 *
 * These keep their own names because they are `@speel/identity`'s public seam for the
 * provider records no `DbSet` ever sees — group membership, role assignments, the
 * current user, an ensured user.
 */
function materializeAs<T extends Principal>(
  rec: Record<string, unknown>,
  ctor: EntityCtor<T>,
): T {
  const et = principalModel().findEntityType(ctor)!;
  const out = new ctor() as unknown as Record<string, unknown>;
  for (const p of et.properties) {
    const v = p.key ? (rec.Id ?? rec.ID) : rec[p.columnName];
    if (v !== undefined && v !== null) out[p.propertyName] = v;
  }
  return out as unknown as T;
}

export function toSiteUser(rec: Record<string, unknown>): SiteUser {
  return materializeAs(rec, SiteUser);
}

/**
 * Provenance settles the type: every record this is handed — a group listing, the
 * associated groups, a just-created group, a user's memberships — came from
 * `web/siteGroups`, which omits `PrincipalType` and returns nothing but SharePoint
 * groups. Stamping 8 is what makes a group from here agree with the same group read
 * through `ctx.siteGroups`.
 */
export function toSiteGroup(rec: Record<string, unknown>): SiteGroup {
  const g = materializeAs(rec, SiteGroup);
  g.PrincipalType = 8;
  return g;
}

/** No kind: a role assignment's member may be a user or a group, and the record carries its own `PrincipalType`. */
export function toPrincipal(rec: Record<string, unknown>): Principal {
  return materializeAs(rec, Principal);
}
