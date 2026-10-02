# @speel/core

## 0.1.0-beta.2

### Patch Changes

- eed7911: `mb.shape()`, `@JsonField` and `@MultiJsonField` accept a shape class with no `Id`. Shapes are embedded and have no key, but the entry points required `IEntity`, so TypeScript rejected every Id-less shape as having no properties in common with it.
- eed7911: A navigation decorator's `optionsCreateAsync` and `optionsQueryAsync` accept a callback declared with its own type, such as `OptionsCreator<Person, JobTitle>`. They were typed with `any` as the target, which TypeScript refused for every explicitly typed callback, so only inline lambdas compiled. The navigation's target now decides the callback's target, so a callback for a different entity is refused.
