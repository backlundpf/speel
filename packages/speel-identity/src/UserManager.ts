import type { IIdentityProvider } from "./IIdentityProvider.js";
import type { IdentityDbContext } from "./IdentityDbContext.js";
import type { Principal, SiteUser } from "@speel/core";
import { toPrincipal, toSiteUser } from "./mapPrincipal.js";

/**
 * The current user, and the site's users.
 *
 * `me`, `ensure` and `search` reach the identity seam; the lookups are `.where()` reads
 * over the context's `siteUsers` set. This package is the front door, not a second
 * implementation.
 */
export class UserManager {
  #me: Promise<SiteUser> | undefined;

  constructor(
    private readonly db: IdentityDbContext,
    private readonly provider: IIdentityProvider,
  ) {}

  /**
   * The current user, resolved once — a page lives minutes and the answer does not change
   * within one. A *failed* lookup is not an answer, so it is evicted rather than cached;
   * otherwise one transient network error would poison every later call.
   */
  me(): Promise<SiteUser> {
    if (this.#me === undefined) {
      const pending = this.provider.getCurrentUserAsync().then(toSiteUser);
      void pending.catch(() => {
        if (this.#me === pending) this.#me = undefined;
      });
      this.#me = pending;
    }
    return this.#me;
  }

  /** Drop the cached current user; the next `me()` asks again. */
  clearCache(): void {
    this.#me = undefined;
  }

  all(): Promise<SiteUser[]> {
    return this.db.siteUsers.toArrayAsync();
  }
  getById(id: number): Promise<SiteUser | null> {
    return this.db.siteUsers.findAsync(id);
  }
  getByLoginName(loginName: string): Promise<SiteUser | null> {
    return this.db.siteUsers
      .where((b) => b.LoginName.eq(loginName))
      .firstOrDefaultAsync();
  }
  getByEmail(email: string): Promise<SiteUser | null> {
    return this.db.siteUsers
      .where((b) => b.Email.eq(email))
      .firstOrDefaultAsync();
  }

  /** Resolve a login to a site user, provisioning the record if the person has never visited. */
  async ensure(loginName: string): Promise<SiteUser> {
    return toSiteUser(await this.provider.ensureUserAsync(loginName));
  }

  /**
   * Directory search, which is wider than the site's user list — someone who has never
   * visited the site has no site-user record yet but is still a valid person to pick.
   */
  async search(query: string, maxResults = 20): Promise<Principal[]> {
    return (await this.provider.searchPrincipalsAsync(query, maxResults)).map(
      toPrincipal,
    );
  }
}
