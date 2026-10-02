# Directory people search — design

Issue: #37. Package: `@speel/pnpjs` (`SharePointIdentityProvider.searchPrincipalsAsync`).

## Problem

People search relies on `sp.profiles.clientPeoplePickerSearchUser` alone, which misses users
it should find: the people picker does not reliably match a reordered name ("Smith John",
"Smith, John") or a partial of each word ("Smi Jo").

## Decision

Add Microsoft Graph (Entra ID users) as an optional **second source**, merged after the
people picker. With no Graph source configured, behaviour is exactly today's.

### Matching rule

Typing — or starting to type — any of "John Smith", "Smith, John", "Smith John", "Smi Jo" or
"smithj@…" finds John Smith (`smithj@contoso.com`):

- The query is tokenized: commas become spaces, then split on whitespace.
- **Every** token must prefix-match some word of `displayName`, or prefix `givenName` /
  `surname`. Order-insensitive.
- A **single** token also matches when `mail` or `userPrincipalName` starts with it — which is
  what makes "smithj" and "smithj@contoso.com" work.

### Graph request

One request: `GET /users` with `ConsistencyLevel: eventual` and

```
$search=("displayName:smi" OR "givenName:smi" OR "surname:smi") AND ("displayName:jo" OR …)
```

plus, for a single token, `OR "mail:tok" OR "userPrincipalName:tok"` inside its group.
Per the Graph `$search` docs, `displayName` is tokenized (word-prefix, order-insensitive) and
every other property "defaults to `$filter` with startsWith behavior", parentheses and
`AND`/`OR` are supported, and `"` / `\` inside a clause are backslash-escaped. `$select`
trims the payload; `$top` is `maxResults`.

### The seam

`SharePointIdentityProvider` takes an optional `{ graph?: GraphGet }`, and
`useSharePointIdentity` passes `graph` through:

```ts
type GraphGet = (request: {
  path: string; // "/users"
  query: Record<string, string>; // $search, $select, $top — unencoded
  headers: Record<string, string>; // ConsistencyLevel: eventual
}) => Promise<unknown>; // the parsed JSON body ({ value: [...] })
```

A function rather than a client type: SPFx's `MSGraphClientV3`, `AadHttpClient`, `@pnp/graph`
or a bare `fetch` + token adapt to it in a few lines, and `@speel/pnpjs` gains no dependency.
The request is structured (not a URL) so an adapter never has to guess at encoding.

### Results

- Graph users become principal records the way picker hits do: `LoginName` is the claims
  login `i:0#.f|membership|<upn>`, `Title`/`Email` from `displayName`/`mail`,
  `PrincipalType: 1`, no `Id` — like a picker hit for someone who never visited the site,
  they are provisioned by `users.ensure(login)` when picked.
- Merge: picker results first (its ranking wins), then Graph results whose login (case-
  insensitive) the picker did not return. `maxResults` is applied after the merge.
- The two sources run concurrently. A Graph failure (permission not consented, network)
  falls back to the picker's results; a picker failure still rejects, as today.

### Permission

Delegated `User.ReadBasic.All`. SPFx solutions request it with `webApiPermissionRequests`
in `config/package-solution.json` (resource `Microsoft Graph`); a tenant admin approves it
in the SharePoint admin center's API access page.

## Non-goals

- No contains-match on display names (Graph `$search` does not support it).
- Groups are not searched in Graph; the picker still returns SharePoint and security groups.
- No client-side re-filtering of Graph results — Graph's tokenizer is the authority.
