import type { WebPartContext } from "@microsoft/sp-webpart-base";
import { Principal } from "@speel/identity";

interface GraphUser {
  displayName?: string;
  mail?: string;
  userPrincipalName?: string;
}

/**
 * A `peopleSearch` resolver backed by MS Graph `/users` (requires the
 * `User.ReadBasic.All` grant in package-solution.json + admin approval).
 * Fail-soft: returns no suggestions on error so the field still works.
 */
export function makeGraphPeopleSearch(
  context: WebPartContext,
): (query: string) => Promise<Principal[]> {
  return async (query: string): Promise<Principal[]> => {
    if (!query) return [];
    try {
      const client = await context.msGraphClientFactory.getClient("3");
      const res = await client
        .api("/users")
        .filter(`startswith(displayName,'${query.replace(/'/g, "''")}')`)
        .select("displayName,mail,userPrincipalName")
        .top(10)
        .get();
      return (res.value as GraphUser[]).map((u) =>
        Object.assign(new Principal(), {
          Title: u.displayName,
          Email: u.mail,
          LoginName: `i:0#.f|membership|${u.userPrincipalName ?? u.mail ?? ""}`,
          PrincipalType: 1,
        }),
      );
    } catch (err) {
      console.warn(
        "[speel] peopleSearch (Graph) failed; returning no suggestions.",
        err,
      );
      return [];
    }
  };
}
