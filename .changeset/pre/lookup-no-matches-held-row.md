---
"@speel/react": patch
---

A searchable lookup no longer shows its held value and "No matches." at the same time. On a typed search, both skins list a held value the search did not return only when its text contains what was typed, so a search that matches nothing shows the message alone. A held value that matches but was left off a page of results is still listed. shadcn skin users: re-run the registry `add` to pick up the change.
