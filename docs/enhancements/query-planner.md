# Query planner — enhancement backlog

Gaps found while building real surfaces on the `include` / `thenInclude` pipeline. This is a
backlog, not a design. Consumer documentation lives in
[packages/speel-core/docs/querying.md](../../packages/speel-core/docs/querying.md).

## Top-level include branches are not deduplicated

`resolveIncludeTree` walks `state.includes` in a plain loop and calls `resolveIncludeLevel`
for every node, with no check for a node it has already resolved
(`packages/speel-core/src/Query/QueryExecutor.ts`). Two top-level branches naming the same
navigation therefore each issue a complete fetch of that navigation — for an inverse-FK
collection, a full chunked-and-paged `fetchInverseChildren` over every parent.

This is reachable through ordinary use, because of the next item.

## No sibling `thenInclude`

`Query.include()` always pushes a new **root** node, and `IncludableQuery.thenInclude()` always
descends into the node it was called on. There is no way to attach two navigations to the
_same_ included node in one chain:

```ts
// Wanted: docs AND owner AND contact, all hanging off Responses.
// Expressible only as three root branches that each refetch every response:
q.include((r) => r.Responses)
  .thenInclude((r) => r.ResponseDocs)
  .include((r) => r.Responses)
  .thenInclude((r) => r.ActionOffice)
  .include((r) => r.Responses)
  .thenInclude((r) => r.POC);
```

So the API pushes callers toward exactly the shape the planner handles worst. Two ways out,
and they compose:

1. **Dedupe in the planner** — merge top-level nodes naming the same navigation before
   resolving, unioning their children. This alone makes the chain above correct and cheap
   without any API change, which is the argument for doing it first.
2. **A sibling-capable API** — e.g. `thenInclude` accepting several selectors, or an
   `includeMany(r => r.Responses, r => [r.ResponseDocs, r.ActionOffice])` shape. Better to
   express, but it is an API decision and can follow the planner fix.

## Include resolution is sequential

The same loop awaits each top-level node in turn, so independent branches are serial round
trips. Sibling includes at the root — several person navigations on one query, say — could
run concurrently; nothing about them is ordered. Levels within a branch are genuinely
sequential (a child level needs its parents materialized first) and must stay that way.

Worth bounding any parallelism introduced here, so a wide include list cannot open an
unbounded number of simultaneous requests against SharePoint.

## Practical impact today

Callers who need several navigations under one included collection currently either accept the
duplicate fetches or restructure — loading a small related list separately and joining by id in
application code, or deferring the extra navigations to a second query against a narrower set.
Both are workable and neither is obvious, which is the cost.

Where a person navigation is involved there is also a cheaper route that sidesteps the planner
entirely: `expand` resolves it inline on the same request rather than as an extra include
level. It cannot populate `PrincipalType`, so it fits any surface that only displays a
principal's title.
