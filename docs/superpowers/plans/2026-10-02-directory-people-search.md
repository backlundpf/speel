# Directory people search — plan

Spec: `docs/superpowers/specs/2026-10-02-directory-people-search-design.md`. Issue #37.

All work in `packages/speel-pnpjs`. TDD: each task starts with a failing test in
`test/SharePointIdentityProvider.search.test.ts`, whose fake Graph evaluates the generated
`$search` the way the Graph docs describe (displayName word-prefix, other properties
startsWith, groups ANDed, clauses ORed).

1. **No-graph fallback.** A provider built without `graph` calls only the people picker and
   returns exactly what it returned before.
2. **Query building.** `src/identity/graphPeopleSearch.ts`: tokenize (commas → spaces, split
   on whitespace, drop empties), escape `"`/`\`, build `$search` groups; single token adds
   `mail`/`userPrincipalName`; `$select`, `$top`, `ConsistencyLevel: eventual`. Tests: "John
   Smith", "Smith, John", "Smith John", "Smi Jo" all find the user; "smithj" and
   "smithj@contoso.com" find by UPN/mail; a blank query skips Graph.
3. **Mapping + merge.** Graph user → claims login record; picker first, de-dupe by login
   case-insensitively, `maxResults` after merge.
4. **Failure isolation.** Graph rejects → picker results; picker rejects → rejects.
5. **Wiring.** `SharePointIdentityProvider(sp, { graph })`, `useSharePointIdentity({ …, graph })`;
   export the `GraphGet` / `GraphGetRequest` types from `src/index.ts`.
6. **Docs + changeset.** `packages/speel-pnpjs/docs/principals.md` (or the identity page that
   covers search) Capabilities: the Graph source, the matching rule, the
   `User.ReadBasic.All` permission and `webApiPermissionRequests`. Minor changeset.
