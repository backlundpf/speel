# Modal sizing and a confirm dialog — design

Branch: `feat/modal-sizing-101`. Issues: #101 (modal sizing), #102 (`useSurfaces().confirm()`).
Package: `@speel/react`, plus the shadcn skin in `registry/` (synced into the sample with
`npm run sync:skin`). Two parts, one branch; docs delta and one changeset before the squash merge.

This supersedes the decisions recorded in #101 and in
`2026-11-02-react-fix-wave-design.md` § "Deferred: modal content sizing": content sizing is
now opt-in, and it tracks content until the user takes over, instead of freezing once the
first content is displayed.

## Intent

`SpeelModal` takes its height from the `size` presets (`small` 440px, `medium` 560px,
`large` 640px). A one-line confirmation sits in a 440px window, and an app cannot set a
specific width or height, or place a modal anywhere but the centre. Apps also each build
their own yes/no confirmation on `SpeelModal`.

**Goals:** a caller can size a modal in any CSS length, cap it, place it, and ask for a
modal that fits its content; an app gets a ready-made confirmation dialog that fits its
message; every existing modal and panel looks and behaves exactly as today unless it asks.

**Non-goals:** content-sized width; content-sized panels; a `minHeight`/`minWidth` (the
brief spinner-height frame before content arrives is accepted); arbitrary CSS on the
surface; a confirm with more than two choices or with input fields.

**Anti-goals:** any visible change to a modal that passes no `style`; a modal whose header,
footer or resize handle ends up off screen; a `style` prop that lets callers set CSS that
fights the drag/resize transform (`transform`, `position`, `margin`, ...); naming any
consumer app in code, tests, docs, spec, plan or commits.

## Part 1 — modal sizing (#101)

### The `style` prop (user decision)

Surfaces take a new `style` prop. It is **not** `React.CSSProperties`: it accepts exactly
these keys, each a CSS length as a string (`"640px"`, `"40vw"`, `"80vh"`, `"calc(...)"`):

| Key         | Modal | Panel | Meaning                                                        |
| ----------- | ----- | ----- | -------------------------------------------------------------- |
| `width`     | yes   | yes   | Overrides the width `size` would set.                          |
| `maxWidth`  | yes   | yes   | Width cap. Default: the maximized width (modal 96vw).          |
| `height`    | yes   | —     | Overrides the height `size` would set; `"auto"` = fit content. |
| `maxHeight` | yes   | —     | Height cap. Default: the maximized height (92vh).              |
| `top`       | yes   | —     | The modal's top edge, from the viewport top. Unset: centred.   |
| `left`      | yes   | —     | The modal's left edge, from the viewport left. Unset: centred. |

The types say so: the panel's `style` type has only `width` and `maxWidth`; the modal's adds
the other four. `DialogProps`/`DrawerProps` carry the matching type, and
`surfaceProps.ts` (`SurfaceChromeProps` / `ModalChromeProps`) carries it for `SpeelModal`,
`SpeelPanel`, `SurfaceForm` and `FormRequest`. `FormRequest` composes both chromes today, so
it accepts the modal keys; a request routed to a panel ignores the modal-only keys, the same
way it ignores `draggable` today.

`size` keeps its meaning: it sets width and height from the presets. A `style.width` or
`style.height` replaces the corresponding preset; the other axis still comes from `size`.

### Caps always yield to the screen

The effective cap on each axis is the smaller of the caller's `max*` and the maximized size
(96vw × 92vh), so `maxHeight: "1200px"` on a laptop still keeps the footer on screen. When
`top` is set, the effective height cap is also no more than the room between `top` and the
viewport bottom; likewise `left` and the right edge. The caps bound everything: an explicit
`height`/`width` larger than the cap renders at the cap, auto growth stops at it (then the
body scrolls), and a manual resize stops at it.

### Auto height (user decision: opt-in)

`height: "auto"` asks for a content-fitted modal. Without it nothing about height changes.

- The frame's height follows its content: header + the body's natural content height +
  footer, clamped to the effective cap. Past the cap the body scrolls and the header and
  footer stay put — today's scroll behaviour.
- It follows content in both directions: it grows when content grows **and shrinks when
  content shrinks** (user decision). It tracks continuously (spinner → form, a section
  expanding, validation messages), not just on first render.
- Which way it moves (user decision):
  - **No `top`:** grows and shrinks equally up and down; the modal stays vertically centred.
  - **With `top`:** the top edge stays put; it grows and shrinks at the bottom only.
- **The user takes over:** once the user drags the modal (an actual move, not a click on
  the title bar) or resizes it (pointer or keyboard), auto ends for that modal's lifetime.
  The frame keeps the pixel height it had at that moment and no longer tracks content.
- **Fullscreen:** while maximized, auto has no effect. Leaving fullscreen resumes auto if
  the user never moved or resized; otherwise the modal returns to its pre-fullscreen size
  and position, as today.
- Auto applies to height only. `width: "auto"` is not supported (content-sized width with
  wrapping text runs straight to the cap).

### Minimums (builder's call, settled in review)

The built-in floor (`DIALOG_MIN`, 360 × 260 in both skins) exists to stop a user resizing a
modal into uselessness. It does not apply to auto height or to a caller's `style.width` /
`style.height`: a one-line confirm fits its message (~170px), and `height: "200px"` renders
200px. When the user takes over a frame already below the floor, the resize floor on that
axis is the frame's current size, so the first resize never jumps the frame.

### Placement

`top` and `left` are independent: either, both, or neither. An unset axis stays centred.
Dragging moves the modal from wherever it starts, centred or placed, and the existing
clamps still apply: a drag cannot carry it past a viewport edge, and a resize cannot grow it
past the right or bottom edge.

**The screen beats placement (builder's call, settled in review).** Normally a placed
modal keeps its `top`/`left` and the room-below cap above shortens it (the body scrolls).
Only when that room is smaller than the built-in floor (`DIALOG_MIN`, 260px tall / 360px
wide; `top: "85vh"`, a short window) does the modal move up/left, just far enough that the
floor fits, rather than letting the footer or handle go off screen or collapsing the body.
Placement is a preference; staying on screen is the rule.
Caps, clamps and this fit are recomputed when the window resizes, not only at render
(today's pixel bounds are read only at render; with pixel placement and auto height that
gap would show).

### Panels

A panel takes `style.width` (replacing the preset) and `style.maxWidth` (its resize and
render cap, yielding to the viewport like the modal's). Its height stays full-height.

### Both skins

The Fluent v8 dialog (`fluent-v8/primitives.tsx`) and the shadcn dialog
(`registry/src/speel-shadcn/overlays.tsx`, registry first, then `npm run sync:skin`) get the
same behaviour; both build on `useDragResize`. Panels likewise in both skins. The test
`fakeAdapter` accepts the new prop.

## Part 2 — `useSurfaces().confirm()` (#102)

`useSurfaces()` gains `confirm(options) => Promise<boolean>`, beside `showForm` and
`showDocumentForm`, rendered through the same surface manager.

- **Options:** `title` (required — it names the dialog), `message` (the body; it describes
  the dialog), `confirmText`, `cancelText`, `destructive`.
- **Result:** `true` when the user confirms; `false` on Cancel, Escape, the close button or
  a click outside.
- **Shape:** a modal with `height: "auto"` and `size: "small"`; no resize handle, no drag,
  no fullscreen toggle. The footer holds Cancel and the confirm button; `destructive`
  renders the confirm button with the `danger` appearance, otherwise `primary`.
- **Focus:** opens on the safe choice, Cancel, so Enter alone never confirms. This is the
  one place a footer button takes initial focus (today's modals focus the first body field
  or the frame).
- **Accessibility:** the dialog is named by its title and described by its message
  (`aria-describedby`).
- **Contract growth (builder's call, settled in review):** two optional `DialogProps`
  members, implemented in both skins and accepted by `fakeAdapter`: a "described by" id,
  and an initial-focus target (the v8 dialog otherwise focuses the first body field or the
  frame, and Radix its first tabbable, a header button). Both stay on the skin contract
  only; `SpeelModal`, `SurfaceChromeProps` and `FormRequest` do not expose them until an
  app asks. A custom skin that ignores them still works: the confirm is then undescribed
  and focuses wherever that skin puts it.

## Also on this branch

The shadcn dialog ignores `defaultFullscreen` (`useState(false)`; v8 honours it). Fixed
here: the fullscreen round trip is tested in both skins, and a prop accepted and dropped is
the bug `surfaceProps.ts` exists to prevent. It changes only modals that already ask to
open maximized (builder's call, settled in review).

## Verification

- Unit tests (vitest, both skins' dialog tests): preset sizes unchanged with no `style`;
  `width`/`height` override presets; caps yield to the viewport; auto grows and shrinks
  with content, centred without `top` and bottom-only with it; auto ends on drag and on
  resize; fullscreen round trip; panel width/maxWidth; `confirm` resolves true/false on each
  path, focuses Cancel, is named and described.
- `npm run verify` and `format:check`; the sample still passes `heft build`; `check:skin`
  passes after the sync.
- A live look in the sample is the user's call (the serve is never started without asking).

## Left to the builder

- How content height is measured (a `ResizeObserver` on the body content is the obvious
  route) and how `useDragResize` re-bases on a measured or CSS-length size and on a placed
  (`top`/`left`) rather than centred box, keeping its clamps.
- How the v8 `Modal`'s flex centring is overridden for `top`/`left`.
- Exact type names for the two `style` shapes and for the "described by" `DialogProps`
  member; `confirmText`/`cancelText` defaults.
- Test file placement.
