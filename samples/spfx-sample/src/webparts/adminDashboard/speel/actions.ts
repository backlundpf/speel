import type { ProjectDashboardContext } from "../../../speel/ProjectDashboardContext";
import type { IMigrations } from "./migrations";
import { DbUpdateException, InvalidOperationException } from "@speel/core";
import type { SpeelIdentity } from "@speel/identity";
import { Project } from "../../../entities/Project";
import { Programs } from "../../../entities/Programs";
import { Tags } from "../../../entities/Tags";

// Demo actions that exercise the @speel/core surface against the live
// SharePoint site behind the ProjectDashboardContext. All results print to
// the browser console — there is no UI here.
//
// runDemoSequence() is invoked once from the web part's onInit; the same
// actions are also attached to window.pd so they can be re-run individually
// from the browser DevTools while iterating.

export interface IActions {
  readonly ctx: ProjectDashboardContext;
  listAll(): Promise<void>;
  listActive(): Promise<void>;
  countHighPriority(): Promise<void>;
  firstByTitlePrefix(prefix: string): Promise<void>;
  loadWithIncludes(): Promise<void>;
  filterByOwnerTitle(prefix: string): Promise<void>;
  detachedScan(): Promise<void>;
  cacheProjects(): Promise<void>;
  addAndCleanupDemoProject(): Promise<void>;
  addProjectInFolderDemo(): Promise<void>;
  inspectAuditFields(): Promise<void>;
  inspectRoleAssignments(): Promise<void>;
  demoPermissionRoundTrip(): Promise<void>;
  runAll(): Promise<void>;
}

export function buildActions(
  ctx: ProjectDashboardContext,
  identity: SpeelIdentity,
): IActions {
  const actions: IActions = {
    ctx,

    // --------------------------------------------------------------------
    // 1. List all projects — empty chain via DbSet.toArrayAsync()
    // --------------------------------------------------------------------
    async listAll() {
      console.group("[speel] listAll");
      try {
        const all = await ctx.projects.toArrayAsync();
        console.log(`Loaded ${all.length} projects`);
        console.table(
          all.map((p) => ({
            Id: p.Id,
            Title: p.Title,
            Status: p.Status,
            Priority: p.Priority,
            DueDate: p.DueDate,
          })),
        );
      } finally {
        console.groupEnd();
      }
    },

    // --------------------------------------------------------------------
    // 2. Active projects, sorted by due date, capped at 10 — exercises
    //    .where + .orderBy + .take chain.
    // --------------------------------------------------------------------
    async listActive() {
      console.group("[speel] listActive");
      try {
        const active = await ctx.projects
          .where((p) => p.Status.eq("Active"))
          .orderBy((p) => p.DueDate, "asc")
          .take(10)
          .toArrayAsync();
        console.log(`${active.length} active project(s):`);
        for (const p of active) {
          console.log(
            `  [${p.Id}] ${p.Title} — due ${p.DueDate?.toISOString().slice(0, 10) ?? "?"}`,
          );
        }
      } finally {
        console.groupEnd();
      }
    },

    // --------------------------------------------------------------------
    // 3. Count of high-priority active projects — multiple .where calls
    //    AND together; terminal is .countAsync (server-side aggregate).
    // --------------------------------------------------------------------
    async countHighPriority() {
      console.group("[speel] countHighPriority");
      try {
        const count = await ctx.projects
          .where((p) => p.Status.eq("Active"))
          .where((p) => p.Priority.in(["High", "Critical"]))
          .countAsync();
        console.log(`High-priority active projects: ${count}`);
      } finally {
        console.groupEnd();
      }
    },

    // --------------------------------------------------------------------
    // 4. First-or-default by Title prefix — exercises .firstOrDefaultAsync
    //    plus the string operator .startsWith.
    // --------------------------------------------------------------------
    async firstByTitlePrefix(prefix: string) {
      console.group(`[speel] firstByTitlePrefix("${prefix}")`);
      try {
        const hit = await ctx.projects
          .where((p) => p.Title.startsWith(prefix))
          .firstOrDefaultAsync();
        if (hit === null) {
          console.log("No project found.");
        } else {
          console.log(`Found [${hit.Id}] ${hit.Title}`);
        }
      } finally {
        console.groupEnd();
      }
    },

    // --------------------------------------------------------------------
    // 5. Include Owner (Principal), Program (Lookup), Tags (multi Lookup) —
    //    exercises eager-load across all three storage variants.
    // --------------------------------------------------------------------
    async loadWithIncludes() {
      console.group("[speel] loadWithIncludes");
      try {
        const projects = await ctx.projects
          .take(5)
          .expand((p) => p.Owner)
          .include((p) => p.Program)
          .include((p) => p.Tags)
          .toArrayAsync();
        for (const p of projects) {
          const tagNames =
            (p.Tags ?? []).map((t) => t.Title).join(", ") || "(none)";
          console.log(
            `[${p.Id}] ${p.Title}\n` +
              `   Owner   : ${p.Owner?.Title ?? "(none)"}\n` +
              `   Program : ${p.Program?.Title ?? "(none)"}\n` +
              `   Tags    : ${tagNames}`,
          );
        }
      } finally {
        console.groupEnd();
      }
    },

    // --------------------------------------------------------------------
    // 6. One-hop nav predicate. Filter projects where Owner.Title starts
    //    with a prefix, then load the Owner person. Person/User fields load
    //    via expand(...) (an expandable column); include(...) on a person
    //    field is not supported yet. FilterBuilder<T> descends reference
    //    navigations, so the where(...) traversal produces OData `Owner/Title`.
    // --------------------------------------------------------------------
    async filterByOwnerTitle(prefix: string) {
      console.group(`[speel] filterByOwnerTitle("${prefix}")`);
      try {
        const projects = await ctx.projects
          .where((p) => p.Owner.Title.startsWith(prefix))
          .expand((p) => p.Owner)
          .toArrayAsync();
        console.log(
          `${projects.length} project(s) owned by users starting with "${prefix}":`,
        );
        for (const p of projects) {
          console.log(`  [${p.Id}] ${p.Title} — Owner: ${p.Owner?.Title}`);
        }
      } finally {
        console.groupEnd();
      }
    },

    // --------------------------------------------------------------------
    // 7. AsNoTracking large scan — exercises the untracked materialization
    //    path; nothing accumulates in the ChangeTracker.
    // --------------------------------------------------------------------
    async detachedScan() {
      console.group("[speel] detachedScan");
      try {
        const before = ctx.changeTracker.entries().length;
        const detached = await ctx.projects
          .asNoTracking()
          .take(50)
          .toArrayAsync();
        const after = ctx.changeTracker.entries().length;
        console.log(
          `Loaded ${detached.length} detached projects; ` +
            `tracker entries before=${before}, after=${after}.`,
        );
      } finally {
        console.groupEnd();
      }
    },

    // --------------------------------------------------------------------
    // 8a. Incremental list cache — cacheAsync() returns every Project in the
    //     list as untracked entities. The first call full-loads and stores the
    //     items plus a change token in IndexedDB; later calls inside the 30s
    //     TTL serve straight from the cache, and calls after it sync only the
    //     delta (Modified ge <token-time> for changes, the change feed for
    //     deletions). Owner is part of the cached shape, so it comes back
    //     populated without a separate round-trip.
    // --------------------------------------------------------------------
    async cacheProjects() {
      console.group("[speel] cacheProjects");
      try {
        const t0 = performance.now();
        const first = await ctx.projects.cacheAsync();
        const t1 = performance.now();
        console.log(
          `First cacheAsync(): ${first.length} project(s) in ${(t1 - t0).toFixed(0)}ms ` +
            `(cold cache → full load; warm cache → delta sync).`,
        );

        const t2 = performance.now();
        const second = await ctx.projects.cacheAsync();
        const t3 = performance.now();
        console.log(
          `Second cacheAsync(): ${second.length} project(s) in ${(t3 - t2).toFixed(0)}ms ` +
            `(served from cache, no network, within the 30s TTL window).`,
        );

        // Untracked: bulk cache reads never accumulate in the ChangeTracker.
        console.log(
          `ChangeTracker entries after cacheAsync(): ${ctx.changeTracker.entries().length}`,
        );

        // Owner is part of the cached shape (expand), materialized inline.
        const withOwner = second.find((p) => p.Owner);
        console.log(
          `Cached shape includes expanded Owner: ` +
            (withOwner
              ? `[${withOwner.Id}] ${withOwner.Title} → ${withOwner.Owner?.Title}`
              : "(no owners set)"),
        );
        console.table(
          second.slice(0, 10).map((p) => ({
            Id: p.Id,
            Title: p.Title,
            Status: p.Status,
            Owner: p.Owner?.Title ?? `#${p.OwnerId ?? "?"}`,
          })),
        );
        console.log(
          "Tip: run addAndCleanupDemoProject() then cacheProjects() again — the save marks\n" +
            "the cache stale, so the next cacheAsync() re-syncs the delta even inside the TTL.",
        );
      } catch (err) {
        // cacheAsync() throws when the context wasn't built with useCaching(...).
        // Caching is optional, so skip gracefully rather than letting the error
        // abort runAll() and starve the remaining read-only actions.
        if (err instanceof InvalidOperationException) {
          console.warn(
            "Skipped — caching is not configured on this context (use useCaching(...) to enable it).",
          );
        } else {
          throw err;
        }
      } finally {
        console.groupEnd();
      }
    },

    // --------------------------------------------------------------------
    // 8. Full write round-trip: add → save → modify → save → remove → save.
    //    Demonstrates the change-tracker driven SaveChangesAsync flow.
    //    The newly-added project is cleaned up at the end so re-running
    //    the demo doesn't accumulate junk in the list.
    // --------------------------------------------------------------------
    async addAndCleanupDemoProject() {
      console.group("[speel] addAndCleanupDemoProject");
      try {
        const p = new Project();
        p.Title = `Speel demo ${new Date().toISOString()}`;
        p.Status = "Planning";
        p.Priority = "Low";
        p.DueDate = new Date(Date.now() + 30 * 86_400_000);
        p.IsPublic = false;

        ctx.projects.add(p);
        const addedCount = await ctx.saveChangesAsync();
        console.log(
          `Saved ${addedCount} new project(s); server-assigned Id = ${p.Id}`,
        );

        // Modify and save again.
        p.Status = "Active";
        p.Priority = "Medium";
        const updatedCount = await ctx.saveChangesAsync();
        console.log(`Saved ${updatedCount} update(s).`);

        // Re-read via the tracked identity map.
        const fresh = await ctx.projects.findAsync(p.Id!);
        console.log(
          `Identity-map check: re-find returns same instance? ${fresh === p}`,
        );

        // Clean up so the demo is idempotent.
        ctx.projects.remove(p);
        const removedCount = await ctx.saveChangesAsync();
        console.log(
          `Saved ${removedCount} delete(s); demo project cleaned up.`,
        );
      } catch (err) {
        console.error("Write round-trip failed:", err);
        if (err instanceof DbUpdateException) {
          err.innerErrors.forEach((inner, i) => {
            const f = inner as { status?: number; body?: unknown };
            console.error(
              `  [entry ${i}] SharePoint rejected the operation (status=${f.status}):`,
              f.body,
            );
          });
        }
        throw err;
      } finally {
        console.groupEnd();
      }
    },

    // --------------------------------------------------------------------
    // 8b. Folder placement on add. add(entity, { folder }) creates the
    //     list-relative folder path (recursively, if missing) and inserts the
    //     item directly inside it on SaveChangesAsync. The added project is
    //     removed at the end so the demo is idempotent; the folder it created
    //     is left in place (folder deletion is out of scope). Requires the
    //     Projects list to permit folder creation (EnableFolderCreation) — the
    //     catch below explains how to enable it if SharePoint rejects the add.
    // --------------------------------------------------------------------
    async addProjectInFolderDemo() {
      console.group("[speel] addProjectInFolderDemo");
      const folder = `SpeelDemo/${new Date().getFullYear()}`;
      try {
        const p = new Project();
        p.Title = `Speel folder demo ${new Date().toISOString()}`;
        p.Status = "Planning";
        p.Priority = "Low";
        p.DueDate = new Date(Date.now() + 30 * 86_400_000);
        p.IsPublic = false;

        // The only new bit: a list-relative folder. Everything else is the
        // same change-tracker driven add → save flow as addAndCleanupDemoProject.
        ctx.projects.add(p, { folder });
        const addedCount = await ctx.saveChangesAsync();
        console.log(
          `Saved ${addedCount} project(s) into '${folder}'; server-assigned Id = ${p.Id}`,
        );

        // Re-read via the tracked identity map to confirm it persisted.
        const fresh = await ctx.projects.findAsync(p.Id!);
        console.log(
          `Identity-map check: re-find returns same instance? ${fresh === p}`,
        );

        // Clean up the item so the demo is idempotent (the created folder remains).
        ctx.projects.remove(p);
        const removedCount = await ctx.saveChangesAsync();
        console.log(
          `Saved ${removedCount} delete(s); demo project cleaned up — folder '${folder}' left in place.`,
        );
      } catch (err) {
        console.error("Folder-placement round-trip failed:", err);
        if (err instanceof DbUpdateException) {
          err.innerErrors.forEach((inner, i) => {
            const f = inner as { status?: number; body?: unknown };
            console.error(
              `  [entry ${i}] SharePoint rejected the operation (status=${f.status}):`,
              f.body,
            );
          });
        }
        console.error(
          "If this failed because folders aren't allowed, enable folder creation on the 'Projects' list: " +
            "List settings → Advanced settings → \"Make 'New Folder' command available\" (EnableFolderCreation).",
        );
        throw err;
      } finally {
        console.groupEnd();
      }
    },

    // --------------------------------------------------------------------
    // 9. (Field-rule inspection moved to @speel/react — core's FormModel
    //    proof was retired; the reactive FieldHandle demo returns with the
    //    React form components.)
    // --------------------------------------------------------------------

    // --------------------------------------------------------------------
    // 10. SharePoint system fields from SpeelEntity. Every entity extending
    //     SpeelEntity gains read-only Created/Modified (DateTime) plus the
    //     Author/Editor person fields ("Created By" / "Modified By"). The
    //     numeric AuthorId/EditorId come back on every read; the full
    //     Author/Editor Principal only loads when expanded. Ordering by the
    //     server-managed Modified column surfaces the freshest items first.
    // --------------------------------------------------------------------
    async inspectAuditFields() {
      console.group("[speel] inspectAuditFields");
      try {
        const projects = await ctx.projects
          .orderBy((p) => p.Modified, "desc")
          .take(5)
          .expand((p) => p.Author)
          .expand((p) => p.Editor)
          .toArrayAsync();
        console.log(`Most recently modified ${projects.length} project(s):`);
        const iso = (d: Date | null | undefined): string =>
          d?.toISOString().slice(0, 10) ?? "?";
        console.table(
          projects.map((p) => ({
            Id: p.Id,
            Title: p.Title,
            Created: iso(p.Created),
            Modified: iso(p.Modified),
            // Person navs are populated by expand(...); fall back to the raw
            // User id (always materialized) when the person wasn't expanded.
            CreatedBy: p.Author?.Title ?? `#${p.AuthorId ?? "?"}`,
            ModifiedBy: p.Editor?.Title ?? `#${p.EditorId ?? "?"}`,
          })),
        );
      } finally {
        console.groupEnd();
      }
    },

    // --------------------------------------------------------------------
    // 11. Item-level permissions. `.expand(p => p.RoleAssignments)` emits the
    //     nested $select/$expand (RoleAssignments/Member + RoleDefinitionBindings)
    //     and materializes the typed RoleAssignment[]. Each Member is a Principal
    //     with a real PrincipalType (1=user, 8=SharePoint group) from the
    //     roleassignments/Member expand; each binding names a role definition.
    // --------------------------------------------------------------------
    async inspectRoleAssignments() {
      console.group("[speel] inspectRoleAssignments");
      try {
        const projects = await ctx.projects
          .take(5)
          .expand((p) => p.RoleAssignments)
          .toArrayAsync();
        for (const p of projects) {
          const assignments = p.RoleAssignments ?? [];
          console.group(
            `[${p.Id}] ${p.Title} — ${assignments.length} role assignment(s)`,
          );
          for (const a of assignments) {
            const kind =
              a.Member.PrincipalType === 8
                ? "group"
                : a.Member.PrincipalType === 1
                  ? "user"
                  : `principalType ${a.Member.PrincipalType ?? "?"}`;
            const roles =
              a.RoleDefinitionBindings.map((r) => r.Name).join(", ") ||
              "(none)";
            console.log(
              `  ${a.Member.Title ?? `#${a.Member.Id}`} (${kind}) → ${roles}`,
            );
          }
          console.groupEnd();
        }
      } finally {
        console.groupEnd();
      }
    },

    // --------------------------------------------------------------------
    // 12. Item-level permission WRITE round-trip (DESTRUCTIVE; not in runAll).
    //     Permission writes go through identity's queue: every mutation stages
    //     on identity.permissions.for(...) and reaches the wire only via
    //     identity.saveChangesAsync(). `.for()` takes the entity itself.
    //     Idempotent: it breaks inheritance (copying existing assignments so
    //     nobody loses access), grants the item's author "Read", then resets
    //     inheritance to restore the original (inherited) state.
    // --------------------------------------------------------------------
    async demoPermissionRoundTrip() {
      console.group("[speel] demoPermissionRoundTrip (DESTRUCTIVE)");
      try {
        const project = (await ctx.projects.take(1).toArrayAsync())[0];
        if (!project) {
          console.log("No projects to operate on.");
          return;
        }
        const read = await identity.roles.getByName("Read");
        if (!read) {
          console.log("No 'Read' role definition on this web.");
          return;
        }
        if (project.AuthorId == null) {
          console.log("Project has no AuthorId to grant.");
          return;
        }

        // Break inheritance + grant the author Read. grant() accepts a raw principal
        // id (the author's User id) or a Principal/SiteUser/SiteGroup, and a role by
        // entity, id, or name.
        identity.permissions
          .for(project)
          .breakInheritance({ copyExisting: true })
          .grant(project.AuthorId, read);
        await identity.saveChangesAsync();
        console.log(
          `[${project.Id}] now has unique permissions; granted author #${project.AuthorId} the "${read.Name}" role.`,
        );

        // Clean up so the demo is idempotent: restore inheritance from the parent.
        identity.permissions.for(project).resetInheritance();
        await identity.saveChangesAsync();
        console.log(
          `[${project.Id}] inheritance restored — demo state cleaned up.`,
        );
      } catch (err) {
        console.error("Permission round-trip failed:", err);
        throw err;
      } finally {
        console.groupEnd();
      }
    },

    // --------------------------------------------------------------------
    // Run every read-only action in sequence. The write round-trips
    // (addAndCleanupDemoProject, demoPermissionRoundTrip) are intentionally
    // NOT included here — they mutate the live SharePoint site and should be
    // invoked explicitly from the console.
    // --------------------------------------------------------------------
    async runAll() {
      console.group("[speel] runAll (read-only)");
      try {
        await this.listAll();
        await this.listActive();
        await this.countHighPriority();
        await this.firstByTitlePrefix("Q");
        await this.loadWithIncludes();
        await this.filterByOwnerTitle("P");
        await this.detachedScan();
        await this.cacheProjects();
        await this.inspectAuditFields();
        await this.inspectRoleAssignments();
        console.log(
          "Read-only demo complete. To exercise the write paths, run:\n" +
            "  await window.pd.actions.addAndCleanupDemoProject()\n" +
            "  await window.pd.actions.addProjectInFolderDemo()\n" +
            "  await window.pd.actions.demoPermissionRoundTrip()",
        );
      } catch (err) {
        console.error("[speel] runAll error:", err);
      } finally {
        console.groupEnd();
      }
    },
  };

  return actions;
}

// Expose the context and actions on `window.pd` so the developer can poke at
// them from the browser DevTools. The console banner lists the available
// commands so it's obvious what to try.
declare global {
  interface Window {
    pd?: {
      ctx: ProjectDashboardContext;
      actions: IActions;
      // Re-export the entity classes for convenience: `new window.pd.Project()`
      // inside the console saves an import.
      Project: typeof Project;
      Programs: typeof Programs;
      Tags: typeof Tags;
      migrations?: IMigrations;
      seed?: () => Promise<void>;
      conformance?: import("./conformance").IConformance;
    };
  }
}

export function exposeOnWindow(
  ctx: ProjectDashboardContext,
  actions: IActions,
): void {
  window.pd = { ctx, actions, Project, Programs, Tags };
  console.log(
    "%cspeel-core dashboard ready",
    "color:#0ea5e9;font-weight:bold;",
    "\n  window.pd.ctx          — DbContext instance",
    "\n  window.pd.actions      — IActions (listAll, listActive, countHighPriority,",
    "\n                           firstByTitlePrefix, loadWithIncludes, filterByOwnerTitle,",
    "\n                           detachedScan, cacheProjects, addAndCleanupDemoProject,",
    "\n                           addProjectInFolderDemo, inspectAuditFields, inspectRoleAssignments,",
    "\n                           demoPermissionRoundTrip, runAll)",
    "\n  window.pd.Project      — entity ctor (new Project())",
  );
}
