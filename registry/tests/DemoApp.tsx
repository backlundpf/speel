import { useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import {
  SpeelEntityTable,
  SpeelProvider,
  useOverlays,
  type FormSection,
  type SpeelEntityTableHandle,
} from "@speel/react";

import { Button } from "@/components/ui/button";

import { shadcnAdapter } from "@/speel-shadcn/adapter";
import { DemoContext } from "@/demo/DemoContext";
import { Project } from "@/demo/entities";
import { createDemoDb, searchPeople } from "@/demo/seed";

const SECTIONS: FormSection[] = [
  { title: "Basics", fields: ["Title", "Status", "DueDate", "Budget"] },
  { title: "Team", fields: ["Owner", "Reviewers", "Program"] },
  { title: "Details", fields: ["IsPublic", "Description"] },
];

function Dashboard({ ctx }: { ctx: DemoContext }): ReactElement {
  const { toast, tasks, showForm } = useOverlays();
  const tableRef = useRef<SpeelEntityTableHandle>(null);
  const reload = (): void => {
    void tableRef.current?.reload();
  };

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
    // Default surface = panel → exercises the Drawer skin.
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
  const viewProject = (p: Project): void => {
    void showForm({
      surface: "modal",
      title: p.Title ?? "Project",
      entity: p,
      mode: "view",
      sections: SECTIONS,
    });
  };
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
      .catch((e: unknown) =>
        toast.error(e instanceof Error ? e.message : String(e), {
          title: "Delete failed",
        }),
      );
  };

  return (
    <main className="speel-shadcn mx-auto max-w-5xl p-8">
      <h1 className="mb-1 text-2xl font-bold">Speel × shadcn</h1>
      <p className="text-muted-foreground mb-6 text-sm">
        SpeelEntityTable + forms rendered by the speel-shadcn skin against an
        in-memory provider.
      </p>
      <div className="mb-3">
        <Button onClick={() => void createProject()}>New project</Button>
      </div>
      <SpeelEntityTable
        ref={tableRef}
        of={Project}
        query={(set) =>
          set
            .include((e) => e.Owner)
            .include((e) => e.Reviewers)
            .include((e) => e.Program)
        }
        columns={(p) => [
          {
            key: "Title",
            render: (r) => (
              <button
                type="button"
                className="text-primary underline-offset-4 hover:underline"
                onClick={() => viewProject(r)}
              >
                {r.Title}
              </button>
            ),
          },
          p.Status,
          p.Budget,
          p.DueDate,
          p.Owner,
          p.Program,
        ]}
        rowActions={{
          onView: viewProject,
          onEdit: (p) => void editProject(p),
          onDelete: removeProject,
        }}
        emptyMessage="No projects yet — create one."
        loadingMessage="Loading projects…"
      />
    </main>
  );
}

export function App(): ReactElement {
  const [db, setDb] = useState<DemoContext>();
  useEffect(() => {
    void createDemoDb().then(setDb);
  }, []);
  if (!db) return <div className="p-8 text-sm">Seeding demo data…</div>;
  return (
    <SpeelProvider db={db} ui={shadcnAdapter} peopleSearch={searchPeople}>
      <Dashboard ctx={db} />
    </SpeelProvider>
  );
}
