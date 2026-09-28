import { DbContext, type IDbContextOptions } from "@speel/core";
import type { ModelBuilder } from "@speel/core";
import type { ISchemaProvider } from "../schema/ISchemaProvider.js";
import type { SchemaOperation } from "../operations/operations.js";
import {
  applyResultToSnapshot,
  type SchemaSnapshot,
} from "../schema/SchemaSnapshot.js";
import { MigrationApplyError } from "../MigrationApplyError.js";
import type { IHistoryStore } from "./IHistoryStore.js";

/** List title used when the consumer does not name one. */
export const DEFAULT_HISTORY_LIST = "SpeelMigrationsHistory";

export class MigrationHistory {
  Id?: number;
  MigrationId?: string;
  AppliedUtc?: Date;
}

/**
 * A context private to @speel/migrations — never exposed on the consumer's DbContext.
 *
 * Reading `this.listTitle` from onModelCreating is safe because DbContext builds its
 * model lazily on first use, not in the constructor, so the field is assigned by then.
 */
class MigrationHistoryContext extends DbContext {
  constructor(
    options: IDbContextOptions,
    private readonly listTitle: string,
  ) {
    super(options);
  }

  protected override onModelCreating(mb: ModelBuilder): void {
    mb.entity(MigrationHistory, (b) => {
      b.toList(this.listTitle);
      b.property((e) => e.MigrationId)
        .isText()
        .hasColumnName("Title");
      b.property((e) => e.AppliedUtc).isDateTime();
    });
  }
}

export class SharePointHistoryStore implements IHistoryStore {
  private readonly ctx: MigrationHistoryContext;

  constructor(
    parent: DbContext,
    private readonly schema: ISchemaProvider,
    private readonly listTitle: string = DEFAULT_HISTORY_LIST,
  ) {
    // Reuse the consumer's provider/connection; separate model + change-tracker.
    this.ctx = new MigrationHistoryContext(
      { provider: parent.provider },
      listTitle,
    );
  }

  async bootstrap(snapshot: SchemaSnapshot): Promise<void> {
    if (snapshot.lists.has(this.listTitle)) return;
    // Two waves: the list must exist before its column can be added, and
    // SharePoint cannot see an entity created earlier in the same changeset.
    await this.applyWave(snapshot, [
      {
        op: "createList",
        title: this.listTitle,
        spec: { title: this.listTitle, template: "genericList" },
      },
    ]);
    await this.applyWave(snapshot, [
      {
        op: "addField",
        list: this.listTitle,
        field: {
          kind: "DateTime",
          internalName: "AppliedUtc",
          displayName: "Applied (UTC)",
          displayFormat: "DateTime",
          friendlyFormat: "Disabled",
        },
      },
    ]);
  }

  private async applyWave(
    snapshot: SchemaSnapshot,
    ops: readonly SchemaOperation[],
  ): Promise<void> {
    const results = await this.schema.applyAsync(ops, snapshot);
    for (const r of results) applyResultToSnapshot(snapshot, r);
    const failures = results.filter((r) => r.status === "failed");
    if (failures.length > 0) {
      throw new MigrationApplyError("(history bootstrap)", failures);
    }
  }

  async applied(): Promise<string[]> {
    const rows = await this.ctx.set(MigrationHistory).toArrayAsync();
    return rows
      .map((r) => r.MigrationId)
      .filter((id): id is string => typeof id === "string");
  }

  async record(id: string): Promise<void> {
    const row = new MigrationHistory();
    row.MigrationId = id;
    row.AppliedUtc = new Date();
    this.ctx.set(MigrationHistory).add(row);
    await this.ctx.saveChangesAsync();
  }

  async unrecord(id: string): Promise<void> {
    const rows = await this.ctx.set(MigrationHistory).toArrayAsync();
    const row = rows.find((r) => r.MigrationId === id);
    if (!row) return;
    this.ctx.set(MigrationHistory).remove(row);
    await this.ctx.saveChangesAsync();
  }
}
