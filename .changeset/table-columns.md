---
"@speel/react": minor
---

Table columns: `p.Field.with({ width, wrap, … })` gives a proxy column options without a string key — the `columns` callback's parameter is now a map of column refs, so drop any `(p: Entity) =>` annotation. New column options `wrap`, `cellTitle: false` and `headerContent`. The Fluent v8 skin holds a column without a width at a default for its field kind, never narrower than its header's longest word; header labels break only at spaces (an over-long word ends in "…") with the filter button beside them; cut-off cells show their full text on hover. The row-actions column is as wide as its buttons. `TableColumn` gains optional `defaultWidth`, `wrap`, `cellTitle` and `headerContent`, and `setOverflowTitle` is exported for skins.
