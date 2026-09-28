import type { WebPartContext } from "@microsoft/sp-webpart-base";
import { Migrator } from "@speel/migrations";
import { useSharePointSchema } from "@speel/pnpjs";
import type { MigrateResult } from "@speel/migrations";
import type { ProjectDashboardContext } from "../../../speel/ProjectDashboardContext";
import { migrations } from "../../../migrations";

export interface MigrationStatus {
  applied: string[];
  pending: string[];
}

/** Construct the Migrator for the Project Tracker model against the live site.
 *  Shared by the <MigrationsManager> UI and the window.pd console wrapper. */
export function buildMigrator(
  ctx: ProjectDashboardContext,
  spfxContext: WebPartContext,
): Migrator {
  return new Migrator({
    context: ctx,
    schema: useSharePointSchema(spfxContext),
    migrations,
  });
}

// Console-friendly wrapper exposed on window.pd.migrations — like the destructive
// demo actions, invoked explicitly from DevTools, never auto-run. Each method
// returns its result (plain/serializable).
export interface IMigrations {
  status(): Promise<MigrationStatus>;
  up(): Promise<MigrateResult>;
  to(id: string): Promise<MigrateResult>;
}

export function buildMigrations(migrator: Migrator): IMigrations {
  return {
    async status() {
      const s = await migrator.status();
      console.log(
        "[speel] migrations — applied:",
        s.applied,
        "| pending:",
        s.pending,
      );
      return s;
    },
    async up() {
      console.group("[speel] migrations.up (PROVISIONING — mutates the site)");
      try {
        const r = await migrator.migrate();
        console.log("Applied:", r.ran.length ? r.ran : "(nothing pending)");
        return r;
      } finally {
        console.groupEnd();
      }
    },
    async to(id: string) {
      console.group(`[speel] migrations.to("${id}")`);
      try {
        const r = await migrator.migrateTo(id);
        console.log(`Ran ${r.direction}:`, r.ran);
        return r;
      } finally {
        console.groupEnd();
      }
    },
  };
}
