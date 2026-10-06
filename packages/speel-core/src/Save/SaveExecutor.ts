// src/Save/SaveExecutor.ts
import type { Model } from "../Metadata/Model.js";
import type {
  IStorageProvider,
  IBatchOperation,
  IBatchOperationResult,
  IListHandle,
  IFileUploadResult,
} from "../providers/ISharePointProvider.js";
import { ChangeTracker } from "../ChangeTracker/ChangeTracker.js";
import {
  EntityEntry,
  EntityState,
  isPendingState,
} from "../ChangeTracker/EntityEntry.js";
import { PayloadBuilder } from "./PayloadBuilder.js";
import { requireFileSystem } from "../providers/capabilities.js";
import { fileFactsPatch } from "./fileUpload.js";
import { listKey } from "../Cache/listKey.js";
import { DbUpdateException, SaveAbortedException } from "../errors.js";
import { clearReadOnlyMembers } from "../Entities/readOnlyMembers.js";

export interface ISaveChangesOptions {
  batched?: boolean;
  continueOnError?: boolean;
  maxBatchSize?: number;
  /**
   * Cooperative abort: checked before each unit of work (batch chunk, file
   * upload, pass, permission flush). Fired requests complete and reconcile —
   * abort prevents FURTHER work; there is no rollback. Rejects with
   * SaveAbortedException.
   */
  signal?: AbortSignal;
}

interface IPendingOp {
  entry: EntityEntry;
  operation: IBatchOperation;
}

const DEFAULT_MAX_BATCH = 100;

function newToken(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new SaveAbortedException();
}

export class SaveExecutor {
  constructor(
    private readonly model: Model,
    private readonly provider: IStorageProvider,
    private readonly tracker: ChangeTracker,
  ) {}

  async saveChangesAsync(options: ISaveChangesOptions = {}): Promise<number> {
    const batched = options.batched ?? true;
    const continueOnError = options.continueOnError ?? false;
    const maxBatchSize = options.maxBatchSize ?? DEFAULT_MAX_BATCH;
    const signal = options.signal;
    throwIfAborted(signal);

    this.tracker.fixupRelationships();
    this.tracker.detectChanges();

    const isPending = (e: EntityEntry): boolean => isPendingState(e.state);

    let totalProcessed = 0;

    // Capture inverse-collection originals BEFORE pass 1 — flushing a parent refreshes its
    // snapshot, which would otherwise erase the membership the inverse pass diffs against.
    const inverseOriginals = this.tracker.captureInverseOriginals();

    // Pass 1 — self/parent entities (inserts assign the ids the inverse pass needs).
    const pass1 = this.tracker.entries().filter(isPending);
    if (pass1.length > 0) {
      totalProcessed += await this.flushEntityOps(
        pass1,
        batched,
        continueOnError,
        maxBatchSize,
        signal,
      );
    }

    // Pass 2 — re-parent inverse-collection children now that parent ids exist, then flush them.
    throwIfAborted(signal);
    await this.tracker.fixupInverseAsync(inverseOriginals);
    this.tracker.detectChanges();
    const pass2 = this.tracker.entries().filter(isPending);
    if (pass2.length > 0) {
      totalProcessed += await this.flushEntityOps(
        pass2,
        batched,
        continueOnError,
        maxBatchSize,
        signal,
      );
    }

    return totalProcessed;
  }

  private async flushEntityOps(
    pendingEntries: EntityEntry[],
    batched: boolean,
    continueOnError: boolean,
    maxBatchSize: number,
    signal?: AbortSignal,
  ): Promise<number> {
    const stateOrder: Record<EntityState, number> = {
      [EntityState.Detached]: 99,
      [EntityState.Unchanged]: 99,
      [EntityState.Deleted]: 0,
      [EntityState.Modified]: 1,
      [EntityState.Added]: 2,
    };
    pendingEntries.sort((a, b) => stateOrder[a.state] - stateOrder[b.state]);

    // File adds can't ride the HTTP $batch (chunked upload, progress, abort) —
    // they run through provider.uploadFileAsync after the batched ops below.
    const fileAdds = pendingEntries.filter(
      (e) => e.state === EntityState.Added && e.targetFile !== undefined,
    );
    const fileAddSet = new Set(fileAdds);
    // add({ file }) already refused a store without files; this is the defence
    // for an entry staged some other way — asked BEFORE any batch is sent, so a
    // missing capability never surfaces after the row writes have committed.
    const fileSystem =
      fileAdds.length > 0
        ? requireFileSystem(this.provider, "add({ file })")
        : undefined;

    // Folder pre-pass: ensure target folders exist and resolve to server-relative
    // URLs BEFORE building ops, so a foldered insert references an existing folder.
    const folderUrlByEntry = new Map<EntityEntry, string>();
    const foldered = pendingEntries.filter(
      (e) => e.state === EntityState.Added && e.targetFolder !== undefined,
    );
    if (foldered.length > 0) {
      const byList = new Map<
        string,
        { list: IListHandle; entries: EntityEntry[] }
      >();
      for (const e of foldered) {
        const list = e.entityType.list;
        const key = listKey(list);
        let g = byList.get(key);
        if (!g) {
          g = { list, entries: [] };
          byList.set(key, g);
        }
        g.entries.push(e);
      }
      for (const { list, entries } of byList.values()) {
        const paths = [...new Set(entries.map((e) => e.targetFolder!))];
        // add({ folder }) already refused a store without folders; this is the
        // defence for an entry that was staged some other way.
        const resolved = await requireFileSystem(
          this.provider,
          "add({ folder })",
        ).ensureFoldersAsync(list, paths);
        for (const e of entries) {
          const url = resolved.get(e.targetFolder!);
          if (url === undefined) {
            throw new DbUpdateException(
              `ensureFoldersAsync did not resolve folder '${e.targetFolder}' for ${e.entityType.ctor.name}.`,
              [e],
              [],
            );
          }
          folderUrlByEntry.set(e, url);
        }
      }
    }

    const pending: IPendingOp[] = pendingEntries
      .filter((entry) => !fileAddSet.has(entry))
      .map((entry) => {
        const et = entry.entityType;
        const clientToken = newToken();
        let op: IBatchOperation;
        if (entry.state === EntityState.Added) {
          // One typed insert whether the row lands at the list root or in a
          // folder: the provider picks the API and owns every encoding, person
          // columns included (it resolves the claims a form-values write needs).
          op = {
            kind: "insert",
            list: et.list,
            fields: PayloadBuilder.buildForAdd(entry.entity, et),
            folderServerRelativeUrl: folderUrlByEntry.get(entry) ?? null,
            clientToken,
          };
        } else if (entry.state === EntityState.Modified) {
          op = {
            kind: "update",
            list: et.list,
            id: (entry.entity as { Id?: number }).Id!,
            fields: PayloadBuilder.buildForUpdate(
              entry.entity,
              et,
              entry.getDirtyColumns(),
            ),
            etag: "*",
            clientToken,
          };
        } else {
          op = {
            kind: "delete",
            list: et.list,
            id: (entry.entity as { Id?: number }).Id!,
            etag: "*",
            permanent: entry.permanentDelete,
            clientToken,
          };
        }
        return { entry, operation: op };
      });

    const chunkSize = batched ? maxBatchSize : 1;
    let totalProcessed = 0;
    const failedEntries: EntityEntry[] = [];
    const failedErrors: unknown[] = [];

    for (let i = 0; i < pending.length; i += chunkSize) {
      throwIfAborted(signal);
      const chunk = pending.slice(i, i + chunkSize);
      const results = await this.provider.executeBatchAsync(
        chunk.map((p) => p.operation),
      );
      const byToken = new Map<string, IBatchOperationResult>(
        results.map((r) => [r.clientToken, r]),
      );

      let chunkHadFailure = false;
      for (const p of chunk) {
        const r = byToken.get(p.operation.clientToken);
        if (!r || r.kind === "failure") {
          failedEntries.push(p.entry);
          failedErrors.push(r ?? new Error("missing result"));
          chunkHadFailure = true;
          continue;
        }
        this.reconcile(p, r);
        totalProcessed++;
      }

      if (chunkHadFailure && !continueOnError) {
        throw new DbUpdateException(
          `SaveChangesAsync failed (${failedEntries.length} entries).`,
          failedEntries,
          failedErrors,
        );
      }
    }

    for (const entry of fileAdds) {
      throwIfAborted(signal);
      const et = entry.entityType;
      const staged = entry.targetFile!;
      try {
        const result = await fileSystem!.uploadFileAsync(
          et.list,
          folderUrlByEntry.get(entry) ?? null,
          {
            fileName: staged.fileName,
            content: staged.content,
            overwrite: staged.overwrite,
            // The upload's fileName names the file; a FileLeafRef field applied
            // as metadata afterwards would rename it behind the reconcile below.
            fields: PayloadBuilder.buildForAdd(entry.entity, et).filter(
              (f) => f.property.columnName !== "FileLeafRef",
            ),
            onProgress: staged.onProgress,
            // The staged per-file signal wins for the in-flight upload; otherwise
            // the save-level signal is forwarded so mid-chunk abort works.
            signal: staged.signal ?? signal,
          },
        );
        this.reconcileFileAdd(entry, result);
        totalProcessed++;
      } catch (err: unknown) {
        // An abort is a cancellation, not a save failure.
        if (signal?.aborted || (err as Error | null)?.name === "AbortError") {
          throw new SaveAbortedException();
        }
        failedEntries.push(entry);
        failedErrors.push(err);
        if (!continueOnError) {
          throw new DbUpdateException(
            `SaveChangesAsync failed (${failedEntries.length} entries).`,
            failedEntries,
            failedErrors,
          );
        }
      }
    }

    if (failedEntries.length > 0) {
      throw new DbUpdateException(
        `SaveChangesAsync completed with failures (${failedEntries.length} entries).`,
        failedEntries,
        failedErrors,
      );
    }
    return totalProcessed;
  }

  private reconcile(
    p: IPendingOp,
    r: IBatchOperationResult & { kind: "success" },
  ): void {
    const entry = p.entry;
    if (p.operation.kind === "insert") {
      const id = r.serverData?.id;
      if (id === undefined) {
        throw new DbUpdateException(
          `Insert succeeded but no server id returned for ${entry.entityType.ctor.name}.`,
          [entry],
          [r],
        );
      }
      (entry.entity as { Id?: number }).Id = id;
      this.tracker.promoteKey(entry, id);
      clearReadOnlyMembers(entry.entityType, entry.entity as object);
      entry.refreshSnapshot();
      entry.state = EntityState.Unchanged;
    } else if (p.operation.kind === "update") {
      // A FileLeafRef write renamed the file, so its URL moved within the same
      // folder: refresh FileRef before the snapshot adopts the entity.
      const leaf = p.operation.fields.find(
        (f) => f.property.columnName === "FileLeafRef",
      )?.value;
      const ref = entry.entityType.findByColumnName("FileRef");
      const url = ref
        ? (entry.entity as unknown as Record<string, unknown>)[ref.propertyName]
        : undefined;
      if (typeof leaf === "string" && typeof url === "string") {
        Object.assign(
          entry.entity as unknown as Record<string, unknown>,
          fileFactsPatch(
            entry.entityType,
            leaf,
            `${url.slice(0, url.lastIndexOf("/"))}/${leaf}`,
          ),
        );
      }
      entry.refreshSnapshot();
      entry.state = EntityState.Unchanged;
    } else if (p.operation.kind === "delete") {
      this.tracker.untrack(entry);
    }
  }

  private reconcileFileAdd(entry: EntityEntry, r: IFileUploadResult): void {
    (entry.entity as { Id?: number }).Id = r.id;
    this.tracker.promoteKey(entry, r.id);
    clearReadOnlyMembers(entry.entityType, entry.entity as object);
    // Reflect server file facts onto model-mapped properties so the snapshot
    // refresh covers them.
    Object.assign(
      entry.entity as unknown as Record<string, unknown>,
      fileFactsPatch(entry.entityType, r.fileName, r.serverRelativeUrl),
    );
    entry.refreshSnapshot();
    entry.state = EntityState.Unchanged;
  }
}
