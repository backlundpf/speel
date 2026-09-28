# Surfaces — enhancement backlog

Gaps found while building real surfaces on `useSurfaces` / `useOverlays`. This is a backlog,
not a design. Consumer documentation lives in
[packages/speel-react/docs/surfaces.md](../../packages/speel-react/docs/surfaces.md).

## No confirmation surface

`SurfaceApi` is `showForm` and `showDocumentForm` — both entity-shaped. There is no way to ask
a yes/no question, which is the most common overlay in a CRUD app: confirm a delete, confirm an
irreversible submit, confirm discarding a draft.

The declarative `SpeelModal` content variant can render one, but it wants `open`/`onOpenChange`
state and a callback, so an "ask, then act on the answer" flow ends up split across a state
variable and two handlers. What callers want is the shape `showForm` already has:

```ts
const ok = await showConfirm({
  title: "Submit this response package?",
  message: "You will not be able to upload more documents afterwards.",
  confirmText: "Submit",
  destructive: false,
});
if (!ok) return;
```

Without it, apps reach for `window.confirm` — blocking, unthemed, and visually foreign in a
Fluent app — or hand-roll the hook. One consuming app's dashboard already hand-rolled it
(a `useConfirm` hook), which is the second app-level reimplementation worth counting
before deciding the built-in shape.

Worth settling when it is built: whether the confirm surface resolves `boolean` or the same
`SurfaceResult` shape the form surfaces use. `boolean` reads better at the call site; the
uniform shape composes better with the existing stack. `boolean` looks right — a confirmation
has no entity to hand back.
