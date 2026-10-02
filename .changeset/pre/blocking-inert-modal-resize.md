---
"@speel/react": minor
---

A running blocking task now holds the whole page still, keyboard and assistive tech
included: every body-level layer outside the overlay (open modals and panels too) is
`inert`, falling back to `aria-hidden` where `inert` is missing. Key events aimed
elsewhere are stopped, and focus moves into the overlay's status region. The overlay is
an `alertdialog` with `aria-busy`. When the last blocking task ends, focus goes back to the
element that held it, if that element is still on the page.

Modal drag and resize (`useDragResize`) now take touch and pen through pointer events
(`pointercancel` included), accept `max` and `bounds` to keep the modal inside the
viewport, and give the corner a named, focusable handle that the arrow keys resize. Both
skins draw the corner grip and light it on hover or focus. Breaking for custom skins: the
handle props now carry `onPointerDown` (not `onMouseDown`), and the corner handle must no
longer be `aria-hidden`.
