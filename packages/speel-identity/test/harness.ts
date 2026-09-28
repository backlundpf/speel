import { initSpeelDbContext } from "@speel/core";
import { FakeStorageProvider } from "@speel/core/testing";
import { FakeIdentityProvider } from "../src/testing/FakeIdentityProvider.js";
import { IdentityDbContext } from "../src/IdentityDbContext.js";
import { initSpeelIdentity } from "../src/initSpeelIdentity.js";
import type { SpeelIdentity } from "../src/SpeelIdentity.js";

/** No entities of its own — the three principal sets IdentityDbContext declares are all identity needs. */
class TestContext extends IdentityDbContext {}

export interface Harness {
  identity: SpeelIdentity;
  /** The identity seam: current user, membership, search. */
  ids: FakeIdentityProvider;
  /** Core's provider: site users and site groups — reached through the context. */
  sp: FakeStorageProvider;
  db: TestContext;
}

export function build(): Harness {
  const sp = new FakeStorageProvider();
  const ids = new FakeIdentityProvider();
  const db = initSpeelDbContext(TestContext, (b) => b.useProvider(sp));
  return {
    identity: initSpeelIdentity(db, (b) => b.useProvider(ids)),
    ids,
    sp,
    db,
  };
}

/**
 * Seeds a user into BOTH fakes. Identity deliberately reads some things through the context
 * and some through its own provider, so a test that seeds only one side passes or fails for
 * reasons that have nothing to do with what it meant to assert.
 */
export function seedUser(
  h: Harness,
  user: { Id: number; Title?: string; LoginName?: string; Email?: string },
): void {
  h.sp.seedPrincipal({
    Id: user.Id,
    Title: user.Title ?? `user ${user.Id}`,
    LoginName: user.LoginName ?? `i:0#.f|membership|u${user.Id}@x`,
    ...(user.Email !== undefined ? { Email: user.Email } : {}),
    PrincipalType: 1,
  });
  h.ids.seedUser(user);
}

export function seedGroup(
  h: Harness,
  group: { Id: number; Title?: string; Description?: string },
): void {
  h.sp.seedPrincipal({
    Id: group.Id,
    Title: group.Title ?? `group ${group.Id}`,
    LoginName: group.Title ?? `group ${group.Id}`,
    ...(group.Description !== undefined
      ? { Description: group.Description }
      : {}),
    PrincipalType: 8,
  });
  h.ids.seedGroup(group);
}
