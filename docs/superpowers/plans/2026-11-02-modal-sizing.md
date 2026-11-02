# Modal sizing and confirm() Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modals take a `style` of `width`/`height`/`maxWidth`/`maxHeight`/`top`/`left`
(with opt-in `height: "auto"`), panels take `width`/`maxWidth`, and `useSurfaces()` gains a
content-sized `confirm()`.

**Architecture:** One pure function, `modalFrameCss`, turns size preset + `style` +
fullscreen + an optional pixel box into the frame's CSS. Until the user drags or resizes,
the frame is pure CSS (`min()`/`max()`/`calc()`), so auto height, centring, placement, caps
and window resizes need no measuring. At the first drag or resize, a new hook,
`useModalFrame`, measures the frame once and switches to a pixel box it owns from then on.
Both skins position the frame the same way (`position: absolute|fixed` plus `top`/`left`
plus `translate(-50%)` on centred axes), which replaces `useDragResize`'s
centred-plus-compensation model.

**Tech Stack:** React 17 types, TypeScript (NodeNext, `.js` specifiers), vitest + Testing
Library (jsdom), Fluent UI v8, Radix/shadcn (registry), Changesets.

**Spec:** `docs/superpowers/specs/2026-11-02-modal-sizing-design.md`

## Global Constraints

- No visible change to any modal or panel that passes no `style` (preset px sizes, 96vw ×
  92vh caps, centring, drag/resize clamps all as today).
- `style` accepts exactly: modal `width`, `maxWidth`, `height`, `maxHeight`, `top`, `left`;
  panel `width`, `maxWidth`. CSS length strings. Not `React.CSSProperties`.
- Presets: width small 480 / medium 640 / large 840; height 440 / 560 / 640; floor
  `DIALOG_MIN` 360 × 260; maximized 96vw × 92vh.
- Relative imports end in `.js`; NodeNext; `npm run check:node-esm` stays green.
- Fluent v8 skin only in `@speel/react`; shadcn changes are authored in `registry/` and then
  `npm run sync:skin`. Never edit the sample's copy by hand.
- New `DialogProps` members go into v8, the shadcn skin and `test/fakeAdapter.tsx`.
- Public repo: no consumer names anywhere. Commits end with the session's attribution lines.
- Worktree: `/home/peter/source/repos/backlundpf/speel/.claude/worktrees/modal-sizing`. Run
  every command from there.

## Review Focus

1. **A click on the title bar with no movement** must not take over: auto stays on. Test in Task 2.
2. **A window resized after takeover** re-clamps the box onto the screen, within the caps. Test in Task 2.
3. **`top: "85vh"` on a short window** moves the modal up so the floor fits; the footer never goes off screen. CSS-string test in Task 1.
4. **Leaving fullscreen** returns an untouched auto modal to auto, and a taken-over modal to its box. Tests in Tasks 1 and 3.
5. **`style.width: "auto"`** falls back to the preset (no content-sized width). Test in Task 1.

---

## Task 0: Worktree setup (no commit)

- [ ] **Step 1:** Follow memory `project-fresh-worktree-verify-gaps`: `npm install --cache "$TMPDIR/npm-cache"` at the root. Then link `node_modules/@speel/*` to this worktree's packages if they resolve to the main checkout. Install `registry` deps and run `npm run build -w @speel/core -w @speel/identity -w @speel/pnpjs -w @speel/react`.
- [ ] **Step 2:** Run `npm test -w @speel/react` and `npm --prefix registry test`. Expected: all green (baseline).

## Task 1: Style types and the frame-CSS function

**Files:**

- Modify: `packages/speel-react/src/adapter/SpeelUIAdapter.ts` (DialogProps ~266, DrawerProps ~291)
- Create: `packages/speel-react/src/surface/modalGeometry.ts`
- Test: `packages/speel-react/test/modalGeometry.test.ts`

**Interfaces (Produces):**

```ts
// SpeelUIAdapter.ts
export interface PanelStyle { width?: string; maxWidth?: string }
export interface ModalStyle extends PanelStyle {
  height?: string; maxHeight?: string; top?: string; left?: string;
}
// DialogProps gains:
style?: ModalStyle;
/** Id of the element that describes the dialog (aria-describedby). */
ariaDescribedBy?: string;
/** What takes focus on open, instead of the skin's default (first body field / frame). */
initialFocus?: () => HTMLElement | null | undefined;
// DrawerProps becomes: extends Omit<DialogProps, "style"> { position?; style?: PanelStyle }

// modalGeometry.ts
export const DIALOG_WIDTH = { small: 480, medium: 640, large: 840 } as const;
export const DIALOG_HEIGHT = { small: 440, medium: 560, large: 640 } as const;
export const DIALOG_MIN = { w: 360, h: 260 } as const;
export interface FrameBox { x: number; y: number; w: number; h: number } // viewport px, top-left
export interface ModalFrameCss {
  width: string; height: string; maxWidth: string; maxHeight: string;
  top: string; left: string; transform: string;
}
export function modalFrameCss(o: {
  size?: "small" | "medium" | "large"; style?: ModalStyle;
  fullscreen: boolean; box: FrameBox | null;
}): ModalFrameCss;
/** A CSS length resolved to px by a hidden fixed probe; undefined when it measures 0 (no layout). */
export function cssLengthPx(value: string, axis: "w" | "h"): number | undefined;
```

- [ ] **Step 1: Write the failing tests** (`modalFrameCss` table):
  - No style, medium: `{ width:"640px", height:"560px", maxWidth:"96vw", maxHeight:"92vh", top:"50%", left:"50%", transform:"translate(-50%, -50%)" }`.
  - `size:"small"` → `width "480px"`, `height "440px"`.
  - `style {width:"20vw", height:"auto"}` → `width "20vw"`, `height "auto"`. Still centred.
  - `style {width:"auto"}` → `width "640px"` (falls back to the preset).
  - `style {maxHeight:"1200px", maxWidth:"900px"}` → `maxHeight "min(1200px, 92vh)"`, `maxWidth "min(900px, 96vw)"`.
  - `style {top:"85vh"}` → `top "min(85vh, calc(96vh - 260px))"`, `maxHeight "min(92vh, max(calc(96vh - 85vh), 260px))"`, `transform "translate(-50%, 0)"`, `left "50%"`.
  - `style {left:"10px", maxWidth:"500px"}` → `left "min(10px, calc(98vw - 360px))"`, `maxWidth "min(500px, 96vw, max(calc(98vw - 10px), 360px))"`, `transform "translate(0, -50%)"`.
  - Both `top` and `left` → `transform "none"`.
  - `box {x:10,y:20,w:500,h:300}` → `width "500px"`, `height "300px"`, `top "20px"`, `left "10px"`, `transform "none"`. Caps keep the style-derived strings.
  - `fullscreen: true` (with or without box/style) → `width "96vw"`, `height "92vh"`, `maxWidth "96vw"`, `maxHeight "92vh"`, `top "50%"`, `left "50%"`, `transform "translate(-50%, -50%)"`.
  - `cssLengthPx("100px","w")` in jsdom → `undefined`.
- [ ] **Step 2:** Run `npx vitest run test/modalGeometry.test.ts` (in `packages/speel-react`). Expected: FAIL, module not found.
- [ ] **Step 3: Implement** the types and `modalFrameCss` / `cssLengthPx`. The strings must match the tests exactly. The probe is a `position:fixed; visibility:hidden` div appended to `document.body`, read with `offsetWidth`/`offsetHeight` and then removed. It returns `undefined` outside a browser or on 0.
- [ ] **Step 4:** Rerun the test (PASS). Run `npx tsc -p tsconfig.json --noEmit` in speel-react. Expected: errors only where skins/fakeAdapter haven't caught up, or none. The new members are optional, so the build should pass.
- [ ] **Step 5: Commit** `feat(react): modal style types and frame CSS (#101)`.

## Task 2: `useModalFrame`

**Files:**

- Create: `packages/speel-react/src/surface/useModalFrame.ts`
- Modify: `packages/speel-react/src/index.ts` (export `useModalFrame`, its types, `modalFrameCss`, `ModalStyle`, `PanelStyle`); `packages/speel-react/src/surface/useDragResize.ts` (add `@deprecated Use useModalFrame` on the export, no behaviour change)
- Test: `packages/speel-react/test/useModalFrame.test.tsx`

**Interfaces:**

- Consumes: `modalFrameCss`, `cssLengthPx`, `DIALOG_MIN`, `FrameBox` (Task 1); `CornerResizeHandleProps` from `useDragResize.ts`.
- Produces:

```ts
export interface ModalFrameOptions {
  size?: "small" | "medium" | "large";
  style?: ModalStyle;
  fullscreen: boolean;
  step?: number; // arrow-key px, default 16
  label?: string; // resize handle name, default "Resize"
}
export interface ModalFrameState {
  frameRef: React.RefObject<HTMLDivElement>; // the element whose rect is the frame
  css: ModalFrameCss;
  dragHandleProps: { onPointerDown: (e: React.PointerEvent) => void };
  resizeHandleProps: CornerResizeHandleProps;
}
export function useModalFrame(o: ModalFrameOptions): ModalFrameState;
```

Behaviour (the tests pin it):

- `box` state starts `null`, and `css = modalFrameCss({ ...o, box })`.
- **Grab:** a drag pointerdown (ignored when the target is inside a `button`), a resize pointerdown or a resize arrow key reads `base = box ?? measure()`, where `measure()` is `frameRef.current.getBoundingClientRect()` → `{x:left, y:top, w:width, h:height}`. The first time, it also records `floor = { w: min(DIALOG_MIN.w, base.w), h: min(DIALOG_MIN.h, base.h) }`.
- **Drag move:** zero delta does nothing (box stays `null`). Otherwise `box = {...base, x: clamp(base.x+dx, 0, max(0, vw-w)), y: clamp(base.y+dy, 0, max(0, vh-h))}`.
- **Resize** (pointer or arrow key): `w = clamp(base.w+dx, floor.w, min(capW, vw - base.x))`, same for h. `x`/`y` stay unchanged (top-left anchored). `capW = cssLengthPx(css.maxWidth,"w") ?? floor(0.96*innerWidth)`; `capH` is the same with 0.92.
- **Window `resize`** with a box: shrink `w`/`h` to the caps, then clamp `x`/`y` on screen.
- Pointer tracking stays in the capture phase on `window`, with `pointermove`/`pointerup`/`pointercancel`, as in `useDragResize`. The resize key handler `stopPropagation`s, as today.

- [ ] **Step 1: Write the failing tests.** Render a probe component with `frameRef` attached to a div. Stub `getBoundingClientRect` → `{left:100, top:50, width:400, height:170}`, and set `window.innerWidth/innerHeight` = 1000 × 800.
  - `untouched_is_css_mode`: `css.top === "50%"`, `transform` centred, `height "auto"` for `style {height:"auto"}`.
  - `header_click_without_move_keeps_auto`: pointerdown + pointerup on the drag handle with no move → css unchanged.
  - `drag_takes_over_from_measured_rect`: pointerdown (0,0), move (30,40) → `css.top "90px"`, `left "130px"`, `height "170px"`, `transform "none"`.
  - `drag_clamps_on_screen`: move (2000, 2000) → `left "600px"` (1000-400), `top "630px"` (800-170).
  - `resize_floor_is_current_size_below_min`: an ArrowUp keypress on the resize handle → `height "170px"` (floor 170, no jump to 260); ArrowDown → `"186px"`.
  - `resize_caps_at_viewport_and_right_edge`: resize move (+2000, 0) → `width "900px"` (1000 - x 100 = 900 < 960).
  - `window_resize_reclamps`: after a drag to `left 600`, set innerWidth 700 and dispatch `resize` → `width "400px"`, `left "300px"`.
  - `fullscreen_keeps_box`: after takeover, rerender `fullscreen:true` → `top "50%"`. Then `fullscreen:false` → back to the box px.
- [ ] **Step 2:** Run `npx vitest run test/useModalFrame.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** `useModalFrame` per the behaviour above. Reuse `CornerResizeHandleProps` (role button, aria-keyshortcuts as today).
- [ ] **Step 4:** Rerun (PASS). Rerun `test/useDragResize.test.tsx` (unchanged, PASS).
- [ ] **Step 5: Commit** `feat(react): useModalFrame — CSS until takeover, measured box after (#101)`.

## Task 3: V8 dialog on `useModalFrame`

**Files:**

- Modify: `packages/speel-react/src/fluent-v8/primitives.tsx` (`V8Dialog` ~584-790; delete its local `DIALOG_*`/`viewportBounds`, import from `modalGeometry.ts`)
- Test: `packages/speel-react/test/v8DialogSizing.test.tsx`

**Interfaces:** Consumes `useModalFrame` (Task 2), `DialogProps.style/ariaDescribedBy/initialFocus` (Task 1).

Layout (needed for `height:auto`; also correct for fixed heights):

- `styles.main` gets `{ ...css, position: "absolute", display: "flex", flexDirection: "column", overflow: "hidden" }`.
- `scrollableContent` gets `{ overflow: "hidden", display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight: 0, maxHeight: "none" }`.
- The `.speel-modal` wrapper is no longer `position:absolute; inset:0`. It becomes `{ display:"flex", flexDirection:"column", flex:"1 1 auto", minHeight:0, outline:"none" }`, carrying `frameRef`.
- The resize handle stays `position:absolute` (its containing block is now `main`).

Other changes:

- `subtitleAriaId={p.ariaDescribedBy}` when given.
- The open-focus effect tries `p.initialFocus?.()` first, then the first body focusable, then the frame.

- [ ] **Step 1: Write the failing tests** (render `V8Dialog` inside the existing v8 test setup; see `test/v8SurfaceFocus.test.tsx` for the harness):
  - `no_style_matches_presets`: the main element's computed style (`getComputedStyle(document.querySelector(".ms-Dialog-main"))`) has `width "640px"` and `height "560px"`.
  - `style_height_auto_passes_through`: `height "auto"`.
  - `described_by`: `getByRole("dialog", { description: "Body text" })` when the children contain `<p id="d">Body text</p>` and `ariaDescribedBy="d"`.
  - `initial_focus_target`: `initialFocus={() => document.getElementById("b")}` with a footer `<button id="b">` → it has focus after timers flush.
  - `fullscreen_round_trip_restores_auto`: toggle fullscreen twice → `height "auto"` again.
  - Existing v8 surface tests (`v8SurfaceFocus`, `fluentV8.surfaceNames`, `surfaceReturnFocus`) stay green.
- [ ] **Step 2:** Run. Expected: FAIL on the new tests.
- [ ] **Step 3: Implement** as above. jsdom may drop `min()` values from computed style, so the tests assert only plain values.
- [ ] **Step 4:** Run `npm test -w @speel/react`. Expected: all PASS.
- [ ] **Step 5: Commit** `feat(react): v8 modal takes style, auto height, describedBy, initialFocus (#101, #102)`.

## Task 4: shadcn dialog on `useModalFrame`

**Files:**

- Modify: `registry/src/speel-shadcn/overlays.tsx` (`ShadDialog` ~175-315); regenerated `registry/public/r/*.json`; the sample's synced copy via `npm run sync:skin`
- Test: `registry/tests/overlays-sizing.test.tsx`

**Interfaces:** Consumes `useModalFrame`, `DIALOG_*` (both exported from `@speel/react` in Task 2; export the presets too if not already).

Changes:

- `style={{ ...css, translate: "none" }}`; `fullscreen` comes from `useState(p.defaultFullscreen ?? false)`.
- The body becomes `min-h-0 flex-auto overflow-auto` (basis `auto`, so auto height measures content).
- `ref={frameRef}` goes on `DialogContent`.
- `aria-describedby={p.ariaDescribedBy}`.
- `onOpenAutoFocus={(e) => { const t = p.initialFocus?.(); if (t) { e.preventDefault(); t.focus(); } }}`.

- [ ] **Step 1: Write the failing tests:** inline `style.width`/`height` match the presets with no `style`; `height "auto"` passes through; `defaultFullscreen` opens with `width "96vw"`; described by; `initialFocus` takes focus.
- [ ] **Step 2:** Rebuild `@speel/react` dist (`npm run build -w @speel/react`), then run `npm --prefix registry test`. Expected: FAIL on the new tests.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run `npm --prefix registry test`, `npm --prefix registry run typecheck`, `npm --prefix registry run registry:build`, `npm run sync:skin` and `npm run check:skin`. Expected: all green.
- [ ] **Step 5: Commit** (including `registry/public/r` and the synced sample files) `feat(shadcn): dialog takes style, auto height, describedBy, initialFocus; honours defaultFullscreen (#101, #102)`.

## Task 5: Panels take `style.width` / `style.maxWidth`

**Files:**

- Modify: `packages/speel-react/src/surface/useResizable.ts` (add `measure?: () => { w?: number; h?: number } | undefined`, used for the start size when the hook has no size on an axis); `fluent-v8/primitives.tsx` `V8Panel` ~1586; `registry/src/speel-shadcn/overlays.tsx` `ShadDrawer`
- Test: `packages/speel-react/test/useResizable.test.tsx` (extend), `packages/speel-react/test/v8PanelSizing.test.tsx`, `registry/tests/overlays-sizing.test.tsx` (extend)

Behaviour:

- With `style.width`, the skin omits `initial.w` and renders `style.width` until the first resize. `measure` returns the panel element's rect width, so the resize starts from the real width.
- The resize max is `min(cssLengthPx(style.maxWidth,"w") ?? ∞, max(320, innerWidth - 48))`.
- CSS cap:
  - v8 adds `styles.main.maxWidth = style.maxWidth` only when it is given (v8 has no panel cap today).
  - shadcn uses `min(${maxWidth}, 96vw)` or `"96vw"`.
- The floor stays 320 (accepted: a caller width under 320 jumps to 320 on the first resize).

- [ ] **Step 1: Write the failing tests:**
  - `useResizable` with `measure: () => ({ w: 500 })` and no initial: ArrowRight → `w 516`.
  - v8 panel with `style {width:"40vw"}` renders that width.
  - shadcn drawer with `style {maxWidth:"700px"}` gets `maxWidth "min(700px, 96vw)"`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run both test suites. Run registry `registry:build`, `sync:skin` and `check:skin`.
- [ ] **Step 5: Commit** `feat(react,shadcn): panels take style width/maxWidth (#101)`.

## Task 6: Chrome plumbing and fakeAdapter

**Files:**

- Modify: `surface/surfaceProps.ts` (`SurfaceChromeProps.style?: PanelStyle`; `ModalChromeProps` overrides it with `style?: ModalStyle`); `surface/SpeelModal.tsx` (pass `style`); `surface/SpeelPanel.tsx`; `surface/SurfaceForm.tsx` (its `Surface` type becomes `ComponentType<Omit<DrawerProps,"style"> & { style?: ModalStyle }>`, passes `style`); `surface/SurfaceManager.tsx` (pass `o.style`); `test/fakeAdapter.tsx` (Dialog/Drawer accept `style` and render `data-style={JSON.stringify(style ?? {})}`; Dialog renders `aria-describedby={ariaDescribedBy}` and, in an effect on open, focuses `initialFocus?.()`)
- Test: `packages/speel-react/test/surfaceChrome.test.tsx` (extend)

- [ ] **Step 1: Write the failing tests:** `SpeelModal` content variant with `style {height:"auto", top:"10px"}` → the dialog's `data-style` contains both. `SpeelModal` form variant: same. `showForm({ surface:"modal", style:{ width:"50vw" } })` → `data-style` contains `width`. `SpeelPanel` with `style {width:"30vw"}`: same.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3: Implement.** Follow the existing conditional-spread pattern (`...(style !== undefined ? { style } : {})`).
- [ ] **Step 4:** Run `npm test -w @speel/react` (PASS) and `npx tsc` for speel-react, including `test/**`.
- [ ] **Step 5: Commit** `feat(react): surfaces pass style through (#101)`.

## Task 7: `useSurfaces().confirm()`

**Files:**

- Modify: `surface/SurfaceManager.tsx` (add `ConfirmRequest`, `SurfaceApi.confirm`, a separate `confirms` state list and a `ConfirmSurface` component); `index.ts` (export the `ConfirmRequest` type)
- Test: `packages/speel-react/test/SurfaceManager.confirm.test.tsx`

**Interfaces (Produces):**

```ts
export interface ConfirmRequest {
  title: string;
  message: ReactNode;
  confirmText?: string;  // default "OK"
  cancelText?: string;   // default "Cancel"
  destructive?: boolean; // confirm button appearance "danger" (else "primary")
}
// SurfaceApi gains:
confirm(opts: ConfirmRequest): Promise<boolean>;
```

`ConfirmSurface` renders `ui.Dialog` with:

- `open`, `title`, `size: "small"`, `style: { height: "auto" }`, and `resizable`/`draggable`/`fullscreenToggle` all `false`;
- `ariaDescribedBy` set to the id of a `<div>` wrapping `message` (`useStableId`; import it from `fluent-v8/useStableId.js`, or move the helper to a shared spot if the import crosses the skin boundary);
- `initialFocus` = the Cancel button, found through a wrapping `<span ref>` with `querySelector("button")`;
- a footer in the existing order: confirm button first, then Cancel (`formFooter.tsx` puts Save before Cancel).

Settling:

- Confirm resolves `true`.
- Cancel, or `onOpenChange(false)` (Escape, close, outside click), resolves `false`.
- Settling is idempotent, and the entry is removed afterwards.

- [ ] **Step 1: Write the failing tests** (fakeAdapter):
  - `confirm_resolves_true_on_confirm`.
  - `confirm_resolves_false_on_cancel`.
  - `confirm_resolves_false_on_close` (clicking fakeAdapter's Close).
  - `confirm_named_and_described`: `getByRole("dialog", { name: "Delete item?", description: "This cannot be undone." })`.
  - `confirm_focuses_cancel`.
  - `confirm_has_no_resize_or_fullscreen`.
  - `destructive_uses_danger`: fakeAdapter Button exposes the appearance as `data-appearance`; check fakeAdapter first and add it if missing.
  - `defaults_ok_cancel`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run `npm test -w @speel/react`. Expected: all PASS.
- [ ] **Step 5: Commit** `feat(react): useSurfaces().confirm() (#102)`.

## Task 8: Docs delta, changeset, full gates

**Files:**

- `packages/speel-react/docs/surfaces.md` (Capabilities: `style` sizing and placement, `height:"auto"`, panel width, `confirm()`, `useModalFrame` for skin authors, `useDragResize` deprecated). The page is at 241 lines with a 250-line cap: tighten existing text, or move sizing into a new topic page (`docs/surface-sizing.md`, four H2s, plus a README TOC line) if it won't fit. Re-verify the canonical example against `src/index.ts`.
- `registry` docs, if the skin README mentions dialog sizing (grep first).
- `.changeset/modal-sizing.md`: `"@speel/react": minor` with a one-paragraph summary.

- [ ] **Step 1:** Write the docs and the changeset.
- [ ] **Step 2:** Run `npm run verify`, `npm run format:check`, `npm --prefix registry run typecheck`, `npm --prefix registry run build:check` and `npm run check:skin`. Then run the sample type-check (memory `project-fresh-worktree-verify-gaps` §3, or a `heft build` if the sample deps are installed). Expected: all green.
- [ ] **Step 3: Commit** `docs(react): surface sizing and confirm() (#101, #102)`.
- [ ] **Step 4:** Live check in the sample (layout can't be proven in jsdom). **Ask the user before starting the serve.** Check that:
  - preset modals look unchanged;
  - `height:"auto"` grows and shrinks around the centre, and from the top when `top` is set;
  - drag and resize take over;
  - fullscreen round-trips;
  - `confirm()` fits its message.
