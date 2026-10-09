# `ui.Link` — one link primitive, identical to a real link in each skin — design

Date: 2026-10-09 · Status: approved in conversation, pending written-spec review · Branch:
`feat/table-columns-57-62-67` (fourth cycle; supersedes the `appearance: "link"` part of
`2026-10-08-table-align-link-design.md`) · Issue: #70 (part 2)

## Goal

A link drawn by Speel must look exactly like a real link in the same skin. Today it doesn't:

- The shadcn skin's scoped base styles reset `.speel-shadcn a` to `color: inherit; text-decoration:
inherit`, so a raw `<a>` — the document form's file link, the sample's File column — renders as
  plain text, even on hover.
- In v8 a raw `<a>` gets the browser's default blue underline, while the `appearance: "link"` button
  is Fluent's `Link` (theme blue, underline on hover).

And an SPA needs the full link contract: a real `href` (so right-click → open in new tab, copy link
and middle-click work) with the click captured to update the current page.

## Decisions

### The primitive

`SpeelUIAdapter.Link: ComponentType<LinkProps>`:

```ts
export interface LinkProps {
  /** The link's text — also its hover title when cut off. */
  text: string;
  /** Where the link goes. With it the link is a real `<a href>`; without it, a `<button>`. */
  href?: string;
  /** With `href`: called on a plain left click instead of navigating. A modified click (Ctrl/Cmd,
   *  Shift, Alt, middle button) is left to the browser. Without `href`: the link's action. */
  onClick?: () => void;
  /** `_blank` adds `rel="noreferrer noopener"`. */
  target?: string;
  ariaLabel?: string;
  disabled?: boolean;
}
```

| Topic                | Decision                                                                                                                                                                                                                                                                                                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shape                | Mirrors Fluent's `Link`: `href` → `<a href>`; no `href` → `<button type="button">`.                                                                                                                                                                                                                                                                              |
| SPA override         | With `href` and `onClick`, a plain primary-button click with no modifier keys calls `e.preventDefault()` then `onClick()`. Any modified click (`ctrlKey`, `metaKey`, `shiftKey`, `altKey`) or a non-primary button is left alone, so the browser opens a new tab/window. Keyboard Enter on an `<a>` fires a plain click → `onClick`.                             |
| Disabled             | `aria-disabled="true"`, no navigation and no `onClick`, still focusable; the skin's disabled colour. (No hover title on a disabled cut-off link — known follow-up, unchanged.)                                                                                                                                                                                   |
| Truncation           | One line, cut off at its **end**, never centred: `display: inline-block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: top; text-align: start`. A cut-off link sets its own `title` (full text) on hover via `setOverflowTitle`. In a table cell the link truncates itself, so the cell shows one hover text. |
| No icons, no tooltip | Out of scope (Fluent's `Link` has neither).                                                                                                                                                                                                                                                                                                                      |

### Identical to a real link, per skin

- **v8:** Fluent's `Link` itself (`href` → `<a class="ms-Link">`, else `<button class="ms-Link">`), with the
  truncation styles — so the anchor and the action form are identical by construction. The SPA click
  handling wraps `onClick`.
- **shadcn:** one class constant applied to both the `<a>` and the `<button>`: `text-primary
font-normal underline-offset-4 hover:underline` (underline on hover only, like Fluent) plus the
  truncation classes, `cursor-pointer`, a visible focus ring, and `aria-disabled:` muted styling.

### Removing `appearance: "link"` (unreleased)

`ButtonProps.appearance` loses `"link"` (it existed only on this branch). Removed with it: v8's
`V8LinkButton` / link styles / link tooltip-host cap / `FocusableButton` (if nothing else uses it),
shadcn's link branch in `ShadButton`, their tests and layout scenarios, and docs. The #58 tooltip
anchoring for ordinary buttons stays.

### Adoption

- Core: the document form's file link (`packages/speel-react/src/form/documentFormParts.tsx`) renders
  `ui.Link` with `href={FileRef}`.
- Sample: the artifacts File column uses `ui.Link` with `target="_blank"` (and its outdated comment
  goes); the projects table's Title is `ui.Link` with `href` = the dashboard URL plus
  `?project=<id>` and `onClick` = open the project's view in place. The dashboard reads a `project`
  URL parameter (`useUrlState`, `urlNumber()`), so a link opened in a new tab shows that project.

### Adapter surface

New member `Link` in `SpeelUIAdapter` (v8, the test `fakeAdapter`, the registry shadcn skin + sync);
`LinkProps` exported. `ButtonProps.appearance` back to `"primary" | "secondary" | "subtle" | "danger"`.

## Testing

- **jsdom (`@speel/react`, v8):** `href` renders `<a>` with `ms-Link`; no `href` renders a `button`;
  plain click calls `onClick` and the event is default-prevented; Ctrl-, Meta-, Shift-click and a
  middle click are not prevented and don't call `onClick`; `target="_blank"` sets `rel`; disabled →
  `aria-disabled`, no `onClick`; cut-off hover title; truncation styles.
- **fake adapter + core:** the document form renders its file link through `ui.Link`.
- **registry (jsdom):** the same behaviour set for the shadcn `Link`; the `<a>` and the `<button>`
  carry the identical class string.
- **Real layout (Playwright, both skins):** an `<a>` link and a `<button>` link side by side have the
  same computed `color`, `font-weight`, `text-decoration-line` (none at rest, underline on hover) and
  `cursor`; a long link in a narrow cell shows its beginning and ends cut off, with the full text on
  hover; a link row is no taller than a text row. The previous link-button scenarios are replaced.

## Docs, release

- `docs/table-columns.md`: "A cell that opens its row" uses `ui.Link` with `href` + `onClick` (open in
  new tab still works). Stay ≤ 250 lines.
- `docs/skins.md`: the adapter contract gains `Link` (anchor and action forms identical; SPA click
  rule) and drops the link appearance. Stay ≤ 250 lines.
- Changeset: replace the `appearance: "link"` sentence with `ui.Link`.

## Out of scope

Icons or tooltips on links; a navigation router integration; styling raw `<a>` elements consumers
write themselves (use `ui.Link`); the disabled-link hover title.
