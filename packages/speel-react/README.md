# @speel/react

Fluent UI v8 component layer over `@speel/core` for SPFx — forms, data tables, modal/panel
surfaces, toast feedback, and a migrations admin UI, all wired to the same `DbContext` that
drives your data layer. Components are model-driven: field labels, validation rules, choice
options, and visibility predicates are all configured once in `onModelCreating`; the UI reads
that metadata so forms and tables reflect your model without per-component wiring.
`@speel/migrations` supplies the Migrator that the migrations admin surface consumes;
`@speel/pnpjs` provides the SharePoint provider that backs the `DbContext` you pass in.

## Install

```bash
npm install @speel/react@beta @speel/core@beta react react-dom @fluentui/react
```

Required peers: `react >=17`, `react-dom >=17`, `@speel/core`, `@fluentui/react >=8`.
`@fluentui/react` is only required when using the Fluent v8 skin (almost always in SPFx).

## Quickstart

```tsx
import { initSpeelDbContext } from "@speel/core";
import "@speel/pnpjs";
import { SpeelProvider, SpeelEntityTable, useOverlays } from "@speel/react";
import { fluentV8Adapter } from "@speel/react/fluent-v8";
import { ProjectDashboardContext } from "./speel/ProjectDashboardContext";

// In a WebPart's onInit():
const ctx = initSpeelDbContext(ProjectDashboardContext, (b) =>
  b.useSharePoint(this.context),
);

// The table drives itself — fetches, sorts, filters, and keeps a reload handle.
function ProjectsView({ ctx }) {
  const tableRef = React.useRef(null);
  const { toast, showForm } = useOverlays();

  const createProject = async () => {
    const { action } = await showForm({
      surface: "modal",
      title: "New project",
      entity: new Project(),
      mode: "create",
    });
    if (action === "submit") {
      toast.success("Project created");
      tableRef.current?.reload();
    }
  };

  const editProject = async (p) => {
    const { action } = await showForm({
      title: `Edit: ${p.Title ?? ""}`,
      entity: p,
      mode: "edit",
    });
    if (action === "submit") {
      toast.success("Project saved");
      tableRef.current?.reload();
    }
  };

  return (
    <SpeelEntityTable
      ref={tableRef}
      of={Project}
      columns={(p) => [p.Title, p.Status, p.DueDate, p.Owner]}
      rowActions={{ onEdit: (p) => void editProject(p) }}
      emptyMessage="No projects yet."
    />
  );
}

// Wrap your component tree in SpeelProvider once, at the root:
export function App({ ctx }) {
  return (
    <SpeelProvider db={ctx} ui={fluentV8Adapter}>
      <ProjectsView ctx={ctx} />
    </SpeelProvider>
  );
}
```

## Conventions

**Fluent v8 only.** SPFx ships `@fluentui/react` v8 as a shared singleton — every web part on
the page shares the same Fabric runtime. Adding a second UI framework version breaks that
shared singleton, so `@speel/react` deliberately provides only a single v8 skin. The skin is
provider-free: controls render against the ambient Fabric theme SharePoint already injects, so
no `ThemeProvider` wrapper is needed.

**Three subpath exports:**

- `.` (`@speel/react`) — all components and hooks: `SpeelProvider`, `SpeelEntityTable`,
  `SpeelTable`, `SpeelForm`, `SpeelField`, `EntityFields`, `SpeelModal`, `SpeelPanel`,
  `useSurfaces`, `useOverlays`, `useEntityForm`, `useToast`, `useActiveTasks`, and the
  `SpeelUIAdapter` contract types.
- `./fluent-v8` (`@speel/react/fluent-v8`) — the `fluentV8Adapter` object that implements
  `SpeelUIAdapter` using Fluent v8 primitives. Pass this as the `ui` prop to `SpeelProvider`.
- `./migrations` (`@speel/react/migrations`) — `MigrationsManager`, an admin panel for listing
  and applying migrations. Renders through the skin, so it needs one in context.

**Model-driven principle.** Configure entities in `onModelCreating` (field types, labels,
required rules, choice options, visibility predicates) — every form and table reads that
metadata. You do not wire per-field props; you configure the model once.

**`SpeelProvider` is required** for all components and hooks from the `.` export. It injects
the `DbContext`, the UI skin, an optional people-search resolver, and mounts the always-on
overlay hosts (toasts, active tasks, imperative surfaces). `MigrationsManager` from
`./migrations` needs only the skin, so a standalone admin web part with no data context can
wrap it in `SpeelUIProvider` instead.

**`SpeelEntityTable` vs `SpeelTable`.** `SpeelEntityTable` is self-loading (fetches items from
the context, exposes a `reload()` handle via `ref`). `SpeelTable` is a pure data table — the
caller owns the items array, which is useful when you need custom fetch logic or manual
navigation expands.

## Topic pages

- [Setup](docs/setup.md) — read when wiring up `SpeelProvider`, choosing or customising the
  Fluent v8 skin, or understanding how the layer stack fits together.
- [Forms](docs/forms.md) — read when building entity forms with `useEntityForm`, `SpeelForm`,
  `SpeelField`, or `EntityFields`.
- [Selection fields](docs/selection.md) — read when a Choice or lookup picker offers the wrong
  rows, loads too much, should add what the user typed, or renders radios with "Other".
- [Tables](docs/tables.md) — read when displaying entity data with `SpeelTable` or
  `SpeelEntityTable`, customising columns, or using the reload handle.
- [Surfaces](docs/surfaces.md) — read when opening modal/panel overlays imperatively with
  `useSurfaces` / `useOverlays`, or declaratively with `SpeelModal` / `SpeelPanel`.
- [Feedback](docs/feedback.md) — read when showing toasts, notifications, or progress for
  long-running operations with `useToast` or `useActiveTasks`.
- [Migrations UI](docs/migrations-ui.md) — read when embedding the `MigrationsManager` admin
  surface to apply or revert schema migrations.
- [Skins](docs/skins.md) — read when rendering Speel with a different component library (Fluent v8 or shadcn).
- [URL state](docs/url-state.md) — read when a surface's state should survive a copied link.
- [User settings](docs/user-settings.md) — read when a preference should follow the user rather
  than the browser, or when wiring `identity` into `SpeelProvider`.
- [Table views](docs/table-views.md) — read when a table needs saved views, shareable links, or
  per-user column arrangements.

## Reference app

[`../../samples/spfx-sample`](../../samples/spfx-sample)
