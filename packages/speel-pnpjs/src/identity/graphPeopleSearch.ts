// src/identity/graphPeopleSearch.ts — the optional Microsoft Graph (Entra ID) people source.

/**
 * One Graph GET, structured rather than a URL so an adapter never has to guess at encoding:
 * `query` values are unencoded.
 */
export interface GraphGetRequest {
  /** Relative to the Graph version root — `/users`. */
  readonly path: string;
  /** OData parameters by name (`$search`, `$select`, `$top`), unencoded. */
  readonly query: Readonly<Record<string, string>>;
  readonly headers: Readonly<Record<string, string>>;
}

/**
 * How the identity provider reaches Microsoft Graph: perform the GET and resolve with the
 * parsed JSON body. A function rather than a client type, so `MSGraphClientV3`,
 * `AadHttpClient`, `@pnp/graph` or `fetch` plus a token each adapt in a few lines and this
 * package takes no dependency on any of them. Needs delegated `User.ReadBasic.All`.
 */
export type GraphGet = (request: GraphGetRequest) => Promise<unknown>;

interface DirectoryUser {
  displayName?: string | null;
  mail?: string | null;
  userPrincipalName?: string | null;
}

type Rec = Record<string, unknown>;

/** Commas are separators too, so "Smith, John" is the same two tokens as "John Smith". */
export function tokenize(query: string): string[] {
  return query
    .replace(/,/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

/** Inside a `$search` clause, `"` and `\` are backslash-escaped; nothing else is. */
const clause = (property: string, token: string): string =>
  `"${property}:${token.replace(/["\\]/g, (c) => `\\${c}`)}"`;

/**
 * Every token must prefix a word of the display name, or prefix the given name or surname —
 * in any order. A lone token may also prefix the mail or the UPN, which is how a login or an
 * address being typed is found. Graph tokenizes `displayName` (word-prefix); every other
 * property is a startsWith.
 */
export function buildPeopleSearch(tokens: readonly string[]): string {
  const properties =
    tokens.length === 1
      ? ["displayName", "givenName", "surname", "mail", "userPrincipalName"]
      : ["displayName", "givenName", "surname"];
  return tokens
    .map((t) => `(${properties.map((p) => clause(p, t)).join(" OR ")})`)
    .join(" AND ");
}

/** A directory user as a principal record — the same shape a people-picker hit maps onto. */
function fromDirectoryUser(user: DirectoryUser): Rec | undefined {
  if (!user.userPrincipalName) return undefined;
  const rec: Rec = {};
  if (user.displayName) rec.Title = user.displayName;
  // The SharePoint claims login for an Entra ID member. No Id: like a picker hit for someone
  // who never visited the site, ensure() provisions the site user when they are picked.
  rec.LoginName = `i:0#.f|membership|${user.userPrincipalName.toLowerCase()}`;
  if (user.mail) rec.Email = user.mail;
  rec.PrincipalType = 1;
  return rec;
}

export async function searchDirectoryUsers(
  graph: GraphGet,
  query: string,
  maxResults: number,
): Promise<Rec[]> {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  const body = (await graph({
    path: "/users",
    query: {
      $search: buildPeopleSearch(tokens),
      $select: "displayName,givenName,surname,mail,userPrincipalName",
      $top: String(maxResults),
    },
    // $search on directory objects is an advanced query; Graph refuses it without this.
    headers: { ConsistencyLevel: "eventual" },
  })) as { value?: DirectoryUser[] } | null | undefined;
  return (body?.value ?? [])
    .map(fromDirectoryUser)
    .filter((r): r is Rec => r !== undefined);
}
