---
"@speel/core": patch
---

A navigation decorator's `optionsCreateAsync` and `optionsQueryAsync` accept a callback declared with its own type, such as `OptionsCreator<Person, JobTitle>`. They were typed with `any` as the target, which TypeScript refused for every explicitly typed callback, so only inline lambdas compiled. The navigation's target now decides the callback's target, so a callback for a different entity is refused.
