# URL state

## What & when

`useUrlState` binds a surface's shareable state to the page's query string. Reach for it
when a copied link should reproduce what the user is looking at — the selected record, an
active toggle, a chosen view.

The design turn is that the URL becomes the state rather than a mirror of it. Consumers
derive from the hook's values instead of copying them into `useState`. That is not a style
preference: two sources of truth is what makes reader/writer ordering a problem, and there
is nothing to reconcile with one. A deep-linked value is decoded during render, so it is
available on the first paint, before any effect runs.

This is not a router. It never touches the path, matches a route, or navigates. In SPFx the
path belongs to SharePoint, and a page can host several web parts, so "one thing owns the
URL" is not true — every write here is scoped to the keys you declare.

## Canonical example

```tsx
import { useUrlState, urlString, urlBoolean } from "@speel/react";

function ResponsesView({ rows }: { rows: readonly ResponseRow[] }) {
  const [params, setParams] = useUrlState({
    resnum: urlString({ history: "push" }),
    pendingonly: urlBoolean({ default: true }),
  });

  // Derived, not mirrored — recomputed from current rows on every render, so a
  // reload that replaces the row objects needs no re-resolution pass.
  const selected = rows.find((r) => r.title === params.resnum) ?? null;

  const visible = params.pendingonly ? rows.filter((r) => r.pending) : rows;

  return (
    <>
      <Toggle
        label="Pending only"
        checked={params.pendingonly}
        onChange={(_, checked) => setParams({ pendingonly: Boolean(checked) })}
      />
      <ResponseTable
        rows={visible}
        onSelect={(row) => setParams({ resnum: row.title })}
      />
      {selected ? <ResponseDetail row={selected} /> : <EmptyState />}
    </>
  );
}
```

A response named by `resnum` that is not in `rows` — not loaded yet, deleted, or
permission-trimmed — derives to `null`. That is not an error: the empty state renders and
the URL keeps the value, so a retry or a permission change can still resolve it.

## Capabilities

### Codecs

A codec says how one key is read and written. Three ship:

| Codec                                | Value            | Notes                                      |
| ------------------------------------ | ---------------- | ------------------------------------------ |
| `urlString({ default?, history? })`  | `string \| null` | An empty value is treated as absent        |
| `urlBoolean({ default?, history? })` | `boolean`        | Only the literal `'true'` decodes as true  |
| `urlNumber({ default?, history? })`  | `number \| null` | Non-finite input falls back to the default |

Write your own by implementing `UrlCodec<T>` — `decode`, `encode`, `defaultValue`, and
`history`. That is the whole extension story; a codec for a structured value (a saved view,
a filter set) is just another implementation.

### Defaults stay out of the URL

A value whose encoding matches its default's encoding is removed rather than written. So
`pendingonly` only appears once it differs from the default, links stay short, and "absent"
and "default" can never become two states that disagree.

### Per-key history mode

Each codec declares `history: 'push' | 'replace'`, defaulting to `replace`. A selection is
navigational and worth a Back entry; a sort click or a filter toggle usually is not. When one
`setParams` call touches keys of mixed modes, the write pushes — the conservative choice when
any part of the change is navigational.

### Partial merge

`setParams({ resnum: 'R-1' })` changes only the keys you name. Every other parameter survives
— yours, SharePoint's, and any other web part's — because each write is composed from
`window.location.href` as it is at that instant, not from a cached snapshot. One call
produces one history entry however many keys it changes.

### Back, forward, and external changes

The store listens for `popstate` and re-renders subscribers with the new values, so browser
navigation stays in sync rather than leaving stale state on screen.

## Boundaries & gotchas

- **Not a router, deliberately.** No path handling, no route matching, no navigation. If you
  need those in SPFx, you are fighting SharePoint for ownership of the URL.

- **Only put state in the URL that belongs in a link.** State that is expensive to derive, or
  that changes faster than a URL should tolerate — a drag position, a text input's every
  keystroke — does not belong here. Every set writes history.

- **The spec object's keys are assumed stable across renders.** An inline literal is fine, and
  is the expected form; the hook reads it through a ref so its changing identity does not
  recompute. Conditionally adding or removing keys between renders is not supported.

- **Each SPFx bundle gets its own store.** Two web parts on one page do not share subscribers.
  That is correct rather than a limitation: they own disjoint keys, and both compose their
  writes from the live URL, so neither can clobber the other.

- **`useSyncExternalStore` comes from the React team's shim**, because this package's peer
  floor is `react >= 17` and the built-in is React 18+. The store's snapshot is the raw search
  **string** for the same reason a snapshot must always be referentially stable — returning a
  freshly decoded object would re-render forever.

- **A blocked history write does not throw.** If a host forbids `pushState`, the state change
  still renders and only the URL fails to update, which is better than breaking the surface
  mid-interaction.
