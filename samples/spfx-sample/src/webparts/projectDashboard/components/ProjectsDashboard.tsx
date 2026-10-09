import * as React from "react";
import {
  SpeelProvider,
  SpeelEntityTable,
  SpeelTable,
  useOverlays,
  useSpeelUI,
  useUrlState,
  urlNumber,
  urlString,
  type SpeelEntityTableHandle,
  type PeopleSearch,
  type FormSection,
  type SpeelUIAdapter,
} from "@speel/react";
import { fluentV8Adapter } from "@speel/react/fluent-v8";
import { shadcnAdapter } from "@/components/speel/adapter";
// The speel-shadcn skin's stylesheet. Every rule in it is scoped under `.speel-shadcn`,
// so loading it on the Fluent path changes nothing there. The source is the Tailwind
// input src/styles/speel-shadcn.css; `npm run tailwind:build` compiles it into lib/,
// which is what webpack bundles and what this path resolves to.
import "../../../styles/speel-shadcn.css";
import { ProjectDashboardContext } from "../../../speel/ProjectDashboardContext";
import { Project } from "../../../entities/Project";
import { Programs } from "../../../entities/Programs";
import { ArtifactsPanel } from "./ArtifactsPanel";
import { ProjectArtifact } from "../../../entities/ProjectArtifact";

const SECTIONS: FormSection[] = [
  { title: "Basics", fields: ["Title", "Status", "Priority", "DueDate"] },
  { title: "Team", fields: ["Owner", "Reviewers"] },
  {
    title: "Details",
    fields: ["Budget", "RepoUrl", "IsPublic", "Description"],
  },
  { title: "Categorization", fields: ["Program", "Tags"] },
];

/** Distinct tag titles across every project a program owns — needs both include depths. */
const tagsInPlay = (program: Programs): string[] => {
  const seen = new Set<string>();
  for (const project of program.OwnedProjects ?? []) {
    for (const tag of project.Tags ?? []) {
      if (tag.Title) seen.add(tag.Title);
    }
  }
  return [...seen].sort();
};

// Pure-table demo: the caller owns the fetch, so this is where query shaping shows.
//
// Includes resolve breadth-first — every navigation at the same depth is fetched in ONE
// provider call — so this whole tree costs three requests no matter how many programs
// come back:
//
//   1. Programs
//   2. Customers + OwnedProjects   <- one round trip, though they are different shapes:
//                                     a scalar lookup and an inverse collection
//   3. Tags
//
// Depth is what costs, not breadth. Adding another sibling include here would ride along
// in request 2 for free; the .thenInclude is what buys request 3.
const ProgramsSection: React.FC<{ ctx: ProjectDashboardContext }> = ({
  ctx,
}) => {
  const ui = useSpeelUI();
  const [programs, setPrograms] = React.useState<readonly Programs[]>([]);
  const load = React.useCallback(async (): Promise<void> => {
    setPrograms(
      await ctx.programs
        .include((p) => p.Customer)
        .include((p) => p.OwnedProjects)
        .thenInclude((pr) => (pr as Project).Tags)
        .toArrayAsync(),
    );
  }, [ctx]);
  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <div style={{ marginTop: 24 }}>
      <h3>Programs — pure SpeelTable (caller owns the data)</h3>
      <div style={{ marginBottom: 8 }}>
        <ui.Button text="Refresh" onClick={() => void load()} />
      </div>
      <SpeelTable
        of={Programs}
        items={programs}
        columns={(p) => [
          p.Title,
          p.Customer,
          {
            key: "projects",
            header: "Projects",
            align: "end", // a count lines up on its last digit
            render: (r) => r.OwnedProjects?.length ?? 0,
            sortValue: (r) => r.OwnedProjects?.length ?? 0,
          },
          {
            key: "tags",
            header: "Tags in play",
            render: (r) => tagsInPlay(r).join(", ") || "—",
            sortValue: (r) => tagsInPlay(r).join(", "),
          },
        ]}
        emptyMessage="No programs."
      />
    </div>
  );
};

/** This page's URL with `?project=<id>` — the dashboard's own `project` parameter — so a
 *  project title opened in a new tab, or copied, lands here with that project open. */
const projectHref = (id: number): string => {
  const url = new URL(window.location.href);
  url.searchParams.set("project", String(id));
  return url.toString();
};

const DashboardBody: React.FC<{
  ctx: ProjectDashboardContext;
  /** The project named in the URL (`?project=`), if any. */
  project: number | undefined;
  onProjectChange: (id: number | undefined) => void;
}> = ({ ctx, project, onProjectChange }) => {
  const ui = useSpeelUI();
  const { toast, tasks, showForm, showDocumentForm } = useOverlays();
  const tableRef = React.useRef<SpeelEntityTableHandle>(null);
  const artifactsTableRef = React.useRef<SpeelEntityTableHandle>(null);
  const reload = (): void => {
    void tableRef.current?.reload();
  };

  // The select column: a box per row, and one in the header for every row the table matches.
  const [matched, setMatched] = React.useState<readonly Project[]>([]);
  const [selected, setSelected] = React.useState<ReadonlySet<number>>(
    new Set(),
  );
  const idOf = (r: Project): number => r.Id ?? 0; // a loaded row always has its Id
  const allSelected =
    matched.length > 0 && matched.every((r) => selected.has(idOf(r)));
  const toggleRow = (r: Project): void =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(idOf(r))) next.add(idOf(r));
      return next;
    });

  const uploadArtifact = async (p: Project): Promise<void> => {
    // Pre-set nav + FK: the form's lookup displays it without a fetch, and
    // relationship fixup carries it at save (nav wins).
    const draft = Object.assign(new ProjectArtifact(), {
      Project: p,
      ProjectId: p.Id ?? null,
    });
    const { action } = await showDocumentForm({
      surface: "modal",
      title: `Add artifact — ${p.Title ?? ""}`,
      entity: draft,
      mode: "create",
    });
    if (action === "submit") {
      toast.success("Artifact uploaded");
      void artifactsTableRef.current?.reload();
    }
  };
  const errMsg = (e: unknown): string =>
    e instanceof Error ? e.message : String(e);

  const createProject = async (): Promise<void> => {
    const { action } = await showForm({
      surface: "modal",
      title: "New project",
      entity: new Project(),
      mode: "create",
      sections: SECTIONS,
    });
    if (action === "submit") {
      toast.success("Project created");
      reload();
    }
  };
  const editProject = async (p: Project): Promise<void> => {
    const { action } = await showForm({
      title: `Edit: ${p.Title ?? ""}`,
      entity: p,
      mode: "edit",
      sections: SECTIONS,
    });
    if (action === "submit") {
      toast.success("Project saved");
      reload();
    }
  };
  // Opening a project names it in the URL for as long as its view is up (`showForm`
  // resolves when the view closes), so the address bar is always the open project's link.
  const openProject = (p: Project): void => {
    onProjectChange(idOf(p));
    showForm({
      surface: "modal",
      title: p.Title ?? "Project",
      entity: p,
      mode: "view",
      sections: SECTIONS,
    })
      .then(() => onProjectChange(undefined))
      .catch((e) => toast.error(errMsg(e)));
  };
  // Arriving with ?project=<id> (a title opened in a new tab, or a shared link): load that
  // project and open its view. Mount-only on purpose — after that the URL follows the open
  // view, not the other way round. An id that matches nothing is dropped from the URL.
  React.useEffect(() => {
    if (project === undefined) return;
    let live = true;
    ctx.projects
      .findAsync(project)
      .then((p) => {
        if (!live) return;
        if (p) openProject(p);
        else onProjectChange(undefined);
      })
      .catch((e) => {
        if (live) toast.error(errMsg(e), { title: "Could not open project" });
      });
    return () => {
      live = false;
    };
  }, []);
  const removeProject = (p: Project): void => {
    ctx.set(Project).remove(p);
    tasks
      .run(() => ctx.saveChangesAsync(), {
        label: "Deleting project…",
        blocking: true,
      })
      .then(() => {
        toast.success("Project deleted");
        reload();
      })
      .catch((e) => toast.error(errMsg(e), { title: "Delete failed" }));
  };

  return (
    <>
      <h3>Projects — SpeelEntityTable (self-loading)</h3>
      <div style={{ marginBottom: 8 }}>
        <ui.Button
          text="New project"
          appearance="primary"
          onClick={() => void createProject()}
        />
      </div>
      <SpeelEntityTable
        ref={tableRef}
        of={Project}
        onMatchedRowsChange={setMatched}
        // Column alignment on show: start (the default — Priority, Due date, Owner), center
        // (Select, Status, Health) and end (Budget). `align` is text alignment, so the
        // checkboxes — block-level controls — sit in inline-block spans to move with it.
        columns={(p) => [
          {
            key: "select",
            header: "Select",
            width: 40,
            align: "center",
            headerContent: (
              <span style={{ display: "inline-block" }}>
                <ui.Checkbox
                  ariaLabel="Select all projects"
                  checked={allSelected}
                  onChange={() =>
                    setSelected(
                      allSelected ? new Set() : new Set(matched.map(idOf)),
                    )
                  }
                />
              </span>
            ),
            render: (r) => (
              <span style={{ display: "inline-block" }}>
                <ui.Checkbox
                  ariaLabel={`Select ${r.Title ?? "project"}`}
                  checked={selected.has(idOf(r))}
                  onChange={() => toggleRow(r)}
                />
              </span>
            ),
          },
          // The title opens the project in place. It is a real link to this page with
          // ?project=<id>, so the link's own menu (or a middle click) opens the project in
          // a new tab. It stays on one line, keeps the start of a long title, and shows the
          // whole title on hover when cut off.
          p.Title.with({
            render: (r) => (
              <ui.Link
                href={projectHref(idOf(r))}
                text={r.Title ?? ""}
                onClick={() => openProject(r)}
              />
            ),
          }),
          p.Description.with({ wrap: true }),
          p.Status.with({ align: "center" }),
          p.Priority,
          p.Budget.with({ align: "end" }),
          p.DueDate,
          p.Owner,
          {
            key: "health",
            header: "Health",
            align: "center",
            render: (r) =>
              r.DueDate && r.DueDate < new Date() ? (
                <span style={{ color: "crimson" }}>Late</span>
              ) : (
                <span style={{ color: "green" }}>On track</span>
              ),
            sortValue: (r) => (r.DueDate ? r.DueDate.getTime() : 0),
          },
        ]}
        rowActions={{
          onView: openProject,
          onEdit: (p) => void editProject(p),
          onDelete: removeProject,
          custom: [
            {
              key: "upload-artifact",
              iconName: "Upload",
              title: "Upload artifact",
              onClick: (p) => void uploadArtifact(p),
            },
          ],
        }}
        emptyMessage="No projects yet — create one."
        loadingMessage="Loading projects…"
      />
      <ProgramsSection ctx={ctx} />
      <ArtifactsPanel tableRef={artifactsTableRef} />
    </>
  );
};

/** The skins this dashboard can render in; the URL's `?skin=` picks one. */
const SKINS = {
  fluent: { label: "Fluent UI v8", adapter: fluentV8Adapter },
  shadcn: { label: "shadcn/ui", adapter: shadcnAdapter },
} satisfies Record<string, { label: string; adapter: SpeelUIAdapter }>;
type Skin = keyof typeof SKINS;
const isSkin = (s: string | null): s is Skin => s !== null && s in SKINS;

/** The skin select, drawn in whichever skin is current. Fluent is the default and
 *  leaves the URL bare; any other choice is written as `?skin=`. */
const SkinPicker: React.FC<{ skin: Skin; onChange: (s: Skin) => void }> = ({
  skin,
  onChange,
}) => {
  const ui = useSpeelUI();
  return (
    <div style={{ maxWidth: 240, marginBottom: 16 }}>
      <ui.Dropdown
        label="Skin"
        value={skin}
        options={(Object.keys(SKINS) as Skin[]).map((key) => ({
          key,
          text: SKINS[key].label,
          data: key,
        }))}
        onChange={(v) => onChange(v as Skin)}
      />
    </div>
  );
};

/**
 * One dashboard, two skins. The same components render through whichever adapter the
 * URL names, so switching shows the adapter contract doing its job: nothing below the
 * provider knows which skin it is in. shadcn's scoped Tailwind CSS needs its
 * `.speel-shadcn` root; Fluent renders against the theme SharePoint already injects.
 */
export const ProjectsDashboard: React.FC<{
  ctx: ProjectDashboardContext;
  peopleSearch?: PeopleSearch;
}> = ({ ctx, peopleSearch }) => {
  const [params, setParams] = useUrlState({
    skin: urlString(),
    project: urlNumber(),
  });
  const skin: Skin = isSkin(params.skin) ? params.skin : "fluent";
  const tree = (
    <SpeelProvider
      // A new key per skin: the adapter's components are different component types,
      // so a remount is what a switch is anyway — this makes it explicit and resets
      // any open surface rather than carrying it across skins.
      key={skin}
      db={ctx}
      ui={SKINS[skin].adapter}
      {...(peopleSearch ? { peopleSearch } : {})}
    >
      <SkinPicker
        skin={skin}
        onChange={(next) =>
          setParams({ skin: next === "fluent" ? null : next })
        }
      />
      <DashboardBody
        ctx={ctx}
        project={params.project ?? undefined}
        onProjectChange={(id) => setParams({ project: id ?? null })}
      />
    </SpeelProvider>
  );
  return skin === "shadcn" ? <div className="speel-shadcn">{tree}</div> : tree;
};
