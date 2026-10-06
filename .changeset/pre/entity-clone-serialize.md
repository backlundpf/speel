---
"@speel/core": minor
"@speel/react": minor
---

Entities: `DbSet.clone`, `serialize`/`deserialize` with a typed `SerializedEntity<T, M>`, and `EntityEntry.setValues`. `update()` given a different instance for a tracked row now applies its values (previously they were silently dropped). `add()` warns about read-only values instead of throwing, never writes them, and the insert clears them. Forms swap bare navigation stubs for the tracked row.
