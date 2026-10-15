---
"@speel/core": patch
"@speel/react": minor
---

A codec runs per element only on multi-valued columns, so a Note or Text column whose model is an array saves one string (#69). Panels and modals return focus without scrolling the page, with `returnFocus` to choose the target (#71). Popovers are labelled dialogs with trigger aria wiring, Tab-out and focus return to the trigger (#72). `PopoverProps.trigger` may now be a function: re-pull a copied shadcn skin (an older copy renders the function as a child and the column chooser's button disappears), and a custom skin must call a function `trigger` (`usePopoverFocus().renderTrigger` does); the trigger toggles `open` itself in both skins. Field primitives take `ariaLabel`, text and number inputs `placeholder`, multiline text `autoGrow`, icon buttons `ariaLabel`; standalone fields pass them through (#76). Arrow keys open a closed v8 Dropdown instead of changing its value (#77).
