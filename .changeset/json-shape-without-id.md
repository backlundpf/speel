---
"@speel/core": patch
---

`mb.shape()`, `@JsonField` and `@MultiJsonField` accept a shape class with no `Id`. Shapes are embedded and have no key, but the entry points required `IEntity`, so TypeScript rejected every Id-less shape as having no properties in common with it.
