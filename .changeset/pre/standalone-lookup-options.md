---
"@speel/react": patch
---

A standalone lookup (`useStandaloneField` with a `Lookup` config, rendered through `SpeelField`) now offers options inside a `SpeelProvider`. It resolves its target's set from the config, so it loads the target's rows by default and runs a declared `optionsQueryAsync` or `optionsCreateAsync`, as a form-bound lookup does. Before, only a literal `options` list worked. Outside a provider it still offers only a literal list.
