// src/schema/SharePointSchemaProvider.ts — the PnPjs-backed ISchemaProvider.
// All @speel/migrations imports are type-only (that package is an optional peer).
import "@pnp/sp/webs/index.js";
import "@pnp/sp/lists/index.js";
import { AddFieldOptions } from "@pnp/sp/fields/index.js";
import "@pnp/sp/batching.js";
import type { SPFI } from "@pnp/sp";
import type {
  FieldInfo,
  FieldSpec,
  ISchemaProvider,
  ListInfo,
  ListSpec,
  SchemaOperation,
  SchemaOpResult,
  SchemaSnapshot,
} from "@speel/migrations";
import { fieldSpecToXml, retypeFieldXml } from "./fieldSpecToXml.js";
import { fieldSpecToUpdate } from "./fieldSpecToUpdate.js";

const TEMPLATE: Record<ListSpec["template"], number> = {
  genericList: 100,
  documentLibrary: 101,
};

/** SharePoint's item-level security levels: 1 reads/writes everything, 2 only your own items. */
const ITEM_SECURITY = { all: 1, own: 2 } as const;

/** SharePoint caps an OData $batch at 100 sub-requests. PnPjs's own default is 20. */
const BATCH_REQUEST_LIMIT = 100;

interface SpFieldRow {
  InternalName: string;
  TypeAsString: string;
  Required: boolean;
  Indexed: boolean;
}
interface SpListRow {
  Id: string;
  Title: string;
  Fields?: SpFieldRow[];
}

export class SharePointSchemaProvider implements ISchemaProvider {
  constructor(private readonly sp: SPFI) {}

  async readSchemaAsync(): Promise<SchemaSnapshot> {
    const rows = (await this.sp.web.lists
      .select(
        "Id",
        "Title",
        "Fields/InternalName",
        "Fields/TypeAsString",
        "Fields/Required",
        "Fields/Indexed",
      )
      .expand("Fields")
      .filter("Hidden eq false")()) as SpListRow[];

    const lists = new Map<string, ListInfo>();
    for (const row of rows) {
      const fields = new Map<string, FieldInfo>();
      for (const f of row.Fields ?? []) {
        fields.set(f.InternalName, {
          internalName: f.InternalName,
          typeAsString: f.TypeAsString,
          required: f.Required,
          indexed: f.Indexed,
        });
      }
      lists.set(row.Title, { id: row.Id, title: row.Title, fields });
    }
    return { lists };
  }

  async applyAsync(
    ops: readonly SchemaOperation[],
    snapshot: SchemaSnapshot,
  ): Promise<readonly SchemaOpResult[]> {
    if (ops.length === 0) return [];
    const [sp2, execute] = this.sp.batched({
      maxRequests: BATCH_REQUEST_LIMIT,
    });

    // Queue every request synchronously. PnPjs enrols a request in the batch at
    // invoke time, so awaiting anything mid-queue would drop the rest of it.
    // A type-changing alterField has to read the column's SchemaXml before it
    // can write it, so it cannot ride the batch: it is deferred, and runs on
    // its own once the batch has gone. Results still come back in op order.
    const deferred: Array<() => Promise<void>> = [];
    let batchedCount = 0;
    const settled = ops.map((op) => {
      let queued: Promise<string | undefined>;
      try {
        if (
          op.op === "alterField" &&
          changesType(op.field, op.list, snapshot)
        ) {
          queued = new Promise<undefined>((resolve, reject) => {
            deferred.push(() =>
              this.retypeField(op.list, op.field, snapshot).then(
                () => resolve(undefined),
                reject,
              ),
            );
          });
        } else {
          batchedCount++;
          queued = this.queue(sp2, op, snapshot);
        }
      } catch (error) {
        // fieldSpecToXml throws synchronously for an unresolvable lookup target;
        // that belongs in this op's result, not thrown out of the whole batch.
        queued = Promise.reject(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
      return queued.then(
        (listId): SchemaOpResult =>
          listId === undefined
            ? { op, status: "applied" }
            : { op, status: "applied", listId },
        (error: unknown): SchemaOpResult => ({
          op,
          status: "failed",
          error: error instanceof Error ? error : new Error(String(error)),
        }),
      );
    });

    if (batchedCount > 0) await execute();
    for (const run of deferred) await run();
    return Promise.all(settled);
  }

  /**
   * Change a column's type by rewriting its SchemaXml — the only route
   * SharePoint offers; a MERGE update cannot move FieldTypeKind and rejects the
   * new type's properties (`RichText` on an `SP.FieldText`). The column keeps
   * its ID, so its data and every view that shows it stay attached.
   */
  private async retypeField(
    listTitle: string,
    spec: FieldSpec,
    snapshot: SchemaSnapshot,
  ): Promise<void> {
    const field = this.sp.web.lists
      .getByTitle(listTitle)
      .fields.getByInternalNameOrTitle(spec.internalName);
    const current = (await field.select("SchemaXml")()) as {
      SchemaXml: string;
    };
    // Passing the type name skips PnPjs's own FieldTypeKind read; the MERGE
    // body is the same either way.
    await field.update(
      { SchemaXml: retypeFieldXml(current.SchemaXml, spec, snapshot) },
      "SP.Field",
    );
  }

  /** Resolves to a created list's GUID, or undefined for ops that create nothing. */
  private queue(
    sp: SPFI,
    op: SchemaOperation,
    snapshot: SchemaSnapshot,
  ): Promise<string | undefined> {
    const list = (title: string) => sp.web.lists.getByTitle(title);
    const field = (listTitle: string, name: string) =>
      list(listTitle).fields.getByInternalNameOrTitle(name);
    const done = (p: Promise<unknown>): Promise<undefined> =>
      p.then(() => undefined);

    switch (op.op) {
      case "createList":
        return sp.web.lists
          .add(
            op.spec.title,
            op.spec.description ?? "",
            TEMPLATE[op.spec.template],
            false,
            {
              OnQuickLaunch: op.spec.onQuickLaunch ?? false,
              ...(op.spec.readSecurity !== undefined
                ? { ReadSecurity: ITEM_SECURITY[op.spec.readSecurity] }
                : {}),
              ...(op.spec.writeSecurity !== undefined
                ? { WriteSecurity: ITEM_SECURITY[op.spec.writeSecurity] }
                : {}),
            },
          )
          .then(extractListId);
      case "dropList":
        // Recycle (recoverable, 90-day site recycle bin) rather than hard-delete,
        // so a dropped list — usually a rollback — can be restored.
        return done(list(op.title).recycle());
      case "renameList":
        return done(list(op.from).update({ Title: op.to }));
      case "addField":
        // AddFieldInternalNameHint is what makes SharePoint honour the CAML's
        // Name as the internal name. Without it AddFieldAsXml derives the
        // internal name from DisplayName — "Action Items" becomes
        // Action_x0020_Items — and every later presence check, which looks up
        // the internal name, reports the column missing. PnPjs's string
        // overload sends no Options at all, so the object form is required.
        //
        // AddFieldToDefaultView puts the new column in the list's default view,
        // unless the field opts out or is hidden (a hidden column has no place
        // in a view).
        return done(
          list(op.list).fields.createFieldAsXml({
            SchemaXml: fieldSpecToXml(op.field, snapshot),
            Options:
              op.field.addToDefaultView === false || op.field.hidden === true
                ? AddFieldOptions.AddFieldInternalNameHint
                : AddFieldOptions.AddFieldInternalNameHint |
                  AddFieldOptions.AddFieldToDefaultView,
          }),
        );
      case "alterField":
        return done(
          field(op.list, op.field.internalName).update(
            fieldSpecToUpdate(op.field),
          ),
        );
      case "dropField":
        return done(field(op.list, op.name).delete());
      case "renameField":
        return done(field(op.list, op.from).update({ Title: op.to }));
      case "addIndex":
      case "dropIndex":
        return done(
          field(op.list, op.field).update({ Indexed: op.op === "addIndex" }),
        );
    }
  }
}

/** The SharePoint type name (`TypeAsString`) a spec creates. */
function spTypeOf(spec: FieldSpec): string {
  switch (spec.kind) {
    case "Text":
      return spec.multiline ? "Note" : "Text";
    case "Choice":
      return spec.multi ? "MultiChoice" : "Choice";
    case "Lookup":
      return spec.multi ? "LookupMulti" : "Lookup";
    case "User":
      return spec.multi ? "UserMulti" : "User";
    default:
      return spec.kind;
  }
}

/**
 * True when the live column's type differs from the spec's. A column the
 * snapshot does not hold is not judged — the MERGE update reports it.
 */
function changesType(
  spec: FieldSpec,
  listTitle: string,
  snapshot: SchemaSnapshot,
): boolean {
  const current = snapshot.lists
    .get(listTitle)
    ?.fields.get(spec.internalName)?.typeAsString;
  return current !== undefined && current !== spTypeOf(spec);
}

/** PnPjs v3 returned `{ data }`; v4 returns the list info directly. Accept both. */
function extractListId(result: unknown): string | undefined {
  if (typeof result !== "object" || result === null) return undefined;
  const direct = (result as { Id?: unknown }).Id;
  if (typeof direct === "string") return direct;
  const nested = (result as { data?: { Id?: unknown } }).data?.Id;
  return typeof nested === "string" ? nested : undefined;
}
