# @speel/shadcn-registry

The distribution home and headless test harness for the **speel-shadcn** skin — a
shadcn/ui implementation of `@speel/react`'s `SpeelUIAdapter`. This project is not
published to npm: shadcn skins are copy-in source, so consumers install via
`shadcn add` from the built registry artifact.

It does three things: hold the distributed adapter source, build the shadcn
registry artifact, and prove the source with a fast React-17 test harness. There
is no demo UI here — the human-facing demo is `samples/spfx-sample`.

## Consume the skin in your own app

```bash
# 1. Install the skin source (pulls 17 stock shadcn components + the adapter):
npx shadcn@latest add https://raw.githubusercontent.com/backlundpf/speel/main/registry/public/r/speel-shadcn.json

# 2. Install the core peer (the registry item does not add it):
npm install @speel/core
```

Then wire it into your provider:

```tsx
import { SpeelProvider } from "@speel/react";
import { shadcnAdapter } from "@/components/speel/adapter";

<SpeelProvider db={db} ui={shadcnAdapter}>
  {/* your app */}
</SpeelProvider>;
```

Prerequisites: a shadcn-initialized app with `components.json`, the `@/lib/utils`
`cn` helper, and Tailwind v4. See `packages/speel-react/docs/skins.md` for the full
skin guide and `samples/spfx-sample/README.md` for the SPFx consumption recipe.

## Develop

```bash
npm install
npm run typecheck      # tsc over the source + fixtures (React 17)
npm test               # vitest smoke + integration suite (React 17, headless)
npm run registry:build # rebuild public/r/speel-shadcn.json from registry.json
npm run build:check    # registry:build + fail on any git diff (artifact freshness)
```

`public/r/speel-shadcn.json` is a committed build output; `build:check` is the gate
that keeps it from drifting from source.

## Layout

```
src/speel-shadcn/      the distributed adapter source (adapter, chrome, compat,
                       icons, fields, people-picker, overlays, table) — the only
                       files shipped in the registry item
src/components/ui/     stock shadcn components — committed DEV FIXTURES so the
                       source type-checks here; NOT shipped (consumers get these
                       from upstream shadcn via registryDependencies)
src/lib/utils.ts       cn helper — dev fixture
src/demo/              entities + seed + fake provider — test fixtures only
tests/                 smoke + integration suite (DemoApp.tsx is a test fixture)
registry.json          registry definition → built into public/r/ by shadcn build
public/r/speel-shadcn.json   the committed registry artifact (the shadcn add URL above)
```

## Conventions

- **React 17 is the canonical target** — consumers run in SPFx. The harness runs
  React 17 so what passes here builds in the real target. React 18+ works too.
- **Icon names** use the Fluent vocabulary (`Cancel`, `View`, `Edit`, `Delete`,
  `Filter`, `FullScreen`, `BackToWindow`), mapped to lucide in `icons.tsx`.
- **Keeping up with `@speel/react`:** the adapter implements `SpeelUIAdapter`; after
  upgrading `@speel/react`, re-check the adapter against the interface and rebuild.
