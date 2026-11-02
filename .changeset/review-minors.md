---
"@speel/react": patch
---

The unnamed-surface warning (a modal or panel with neither a title nor an `ariaLabel`) now reads `process.env.NODE_ENV` directly, so a bundler's production define silences it in production builds; a bundle with no `process` still counts as development. Doc comment and docs fixes: `RowAction` has its own doc comment again, `pendingDefaultEdits` describes every view that holds edits in the session, and the table-views page notes that Save as new view needs the user to be able to save views.
