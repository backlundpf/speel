# @speel/pnpjs

PnPjs-backed SharePoint provider for [`@speel/core`](../speel-core) plus the
SharePoint schema provider for [`@speel/migrations`](../speel-migrations).
Owns `@pnp/sp` as a typed peer; importing the package root applies the
`useSharePoint(…)` augmentation to `DbContextOptionsBuilder` and exposes the
typed `getSPFI(context)` escape hatch. You only need this package in production
SPFx — tests can plug a fake provider into `@speel/core` directly (see
[core's providers page](../speel-core/docs/providers.md)) without installing this package.

---

## Install

```bash
npm install @speel/pnpjs@beta @speel/core@beta @pnp/sp @pnp/queryable @pnp/logging
```

`@speel/migrations` is an **optional peer** — install it only when you use the
schema provider:

```bash
npm install @speel/migrations@beta        # only for migration apply / schema work
```

---

## Quickstart

```ts
// 1. Side-effect import — applies the useSharePoint augmentation.
//    Must appear before calling initSpeelDbContext.
import "@speel/pnpjs";

import {
  DbContext,
  ModelBuilder,
  SpeelEntity,
  initSpeelDbContext,
} from "@speel/core";

class Task extends SpeelEntity {
  public Title: string | null = null;
  public Status: "Open" | "Done" | null = null;
}

class TaskContext extends DbContext {
  public tasks = this.set(Task);

  protected override onModelCreating(builder: ModelBuilder): void {
    builder.entity(Task, (b) => {
      b.toList("Tasks");
      b.property((e) => e.Title)
        .isText()
        .isRequired();
      b.property((e) => e.Status)
        .isChoice()
        .hasOptions(["Open", "Done"]);
    });
  }
}

// 2. In your SPFx WebPart's onInit() — pass the SPFx context directly.
const ctx = initSpeelDbContext(TaskContext, (b) =>
  b.useSharePoint(this.context),
);

// 3. Use the context normally.
const openTasks = await ctx.tasks
  .where((b) => b.Status.eq("Open"))
  .orderBy((b) => b.Title, "asc")
  .toArrayAsync();
```

---

## Conventions

- **Side-effect import is required.** `import '@speel/pnpjs'` must appear before
  the first `initSpeelDbContext` call in your entry point. It registers the
  `useSharePoint` method on `DbContextOptionsBuilder` via module augmentation.

- **Two registration shapes.** Pass the raw SPFx context (`this.context`) for the
  common case, or pass an `IUseSharePointOptions` object when you need to override
  the web URL or supply a pre-built `SPFI` instance:

  ```ts
  // Common — SPFx context
  b.useSharePoint(this.context);

  // Override URL (e.g. cross-site reads)
  b.useSharePoint({
    spfxContext: this.context,
    webUrl: "https://contoso.sharepoint.com/sites/hub",
  });

  // Advanced — pre-built SPFI (for testing or custom pipelines)
  b.useSharePoint({ spInstance: myConfiguredSpfi });
  ```

- **`@pnp/*` peers must be hoisted.** SPFx bundles `@pnp/sp` as a shared
  singleton; ensure `@pnp/sp`, `@pnp/queryable`, and `@pnp/logging` resolve to
  the same instance across your project.

- **`file:` links bundle a second `@pnp/sp`.** Consuming speel from a local
  checkout (`"@speel/pnpjs": "file:../speel/packages/speel-pnpjs"`) installs a
  symlink. Webpack resolves symlinks to their real path, so `@pnp/sp` imported
  from inside speel resolves against the checkout's own `node_modules`, not
  yours — two `@pnp/sp` copies in one bundle. PnP registers its selectors
  (`sp.web`, `.lists`, …) per copy, so a selector import applied to one copy
  is missing on the other, and the failure surfaces far from its cause. Fix
  it either way: align the `@pnp/*` versions and leave one copy on disk
  (remove the checkout's `node_modules/@pnp`, or `npm dedupe`), or stop
  webpack following the link with `resolve.symlinks: false` (in a Heft-based
  SPFx project, `config/spfx-customize-webpack.js`; in a gulp-based one,
  `build.configureWebpack` in `gulpfile.js`). Installing from the registry
  has neither problem.

---

## Topic pages

- [Provider](docs/provider.md) — read when querying SharePoint, placing items in
  folders, batching writes, or dropping to raw PnPjs.
- [Principals](docs/principals.md) — read when reading users or groups through the
  provider, writing person columns, or puzzling over `PrincipalType`.
- [Schema provider](docs/schema.md) — read when wiring `useSharePointSchema` into
  a `Migrator` or understanding how FieldSpec kinds map to SharePoint columns.

## Reference app

[`../../samples/spfx-sample`](../../samples/spfx-sample)
