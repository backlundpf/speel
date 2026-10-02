---
"@speel/react": minor
---

Adapter primitives gain optional hints for standalone use: `CheckboxProps.ariaLabel` and
`indeterminate`, `ButtonProps.tooltip` (shown even while the button is disabled, and used as
its accessible description), and `placeholder` on `DropdownProps` and `ComboboxProps`. A
custom skin may implement them; the Fluent v8 and shadcn skins do.

Fix: a mouse press on the Fluent v8 combobox's caret now opens the list once. It used to
open on mousedown and close again on release.
