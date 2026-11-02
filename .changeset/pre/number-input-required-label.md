---
"@speel/react": patch
---

The fluent-v8 skin's Number/Currency fields lost their required marker and, with a prefix, rendered the label inline behind it ("USD Amount" instead of a label above "USD"). V8NumberInput now lets the V8Field chrome own the label, as it already does for text fields, and the SpinButton keeps only the adornment row (#100).
