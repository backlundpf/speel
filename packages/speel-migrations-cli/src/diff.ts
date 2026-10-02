import type { MigrationOperation, FieldSpec } from "@speel/migrations";
import { alterFieldDataLoss, spFieldTypeOf } from "@speel/migrations";
import type { SnapshotDoc, SnapshotEntity } from "./snapshot.js";

/** A generated step that may lose data when it runs (a narrowing type change). */
export interface DiffWarning {
  direction: "up" | "down";
  /** The very op object in `up` / `down` the warning is about. */
  op: MigrationOperation;
  message: string;
}

export interface SnapshotDiff {
  up: MigrationOperation[];
  down: MigrationOperation[];
  /** Steps that may lose data. `diffSnapshots` always sets it. */
  warnings?: DiffWarning[];
}

export function diffSnapshots(
  prev: SnapshotDoc,
  next: SnapshotDoc,
): SnapshotDiff {
  const up: MigrationOperation[] = [];
  const down: MigrationOperation[] = [];
  const warnings: DiffWarning[] = [];
  const prevByTitle = byTitle(prev);
  const nextByTitle = byTitle(next);

  const addedLists = [...nextByTitle.values()].filter(
    (e) => !prevByTitle.has(e.list.title),
  );
  const removedLists = [...prevByTitle.values()].filter(
    (e) => !nextByTitle.has(e.list.title),
  );

  // Added lists — create ALL lists first, then ALL fields, so lookup targets exist when fields are added.
  for (const e of addedLists)
    up.push({ op: "createList", title: e.list.title, spec: e.list });
  for (const e of addedLists)
    for (const f of e.fields)
      up.push({ op: "addField", list: e.list.title, field: f });
  for (const e of addedLists)
    down.push({ op: "dropList", title: e.list.title });

  // Removed lists — up drops them; down recreates (all lists first, then fields).
  for (const e of removedLists)
    up.push({ op: "dropList", title: e.list.title });
  for (const e of removedLists)
    down.push({ op: "createList", title: e.list.title, spec: e.list });
  for (const e of removedLists)
    for (const f of e.fields)
      down.push({ op: "addField", list: e.list.title, field: f });
  // Lists present in both → field-level diff.
  for (const [title, nextE] of nextByTitle) {
    const prevE = prevByTitle.get(title);
    if (!prevE) continue;
    diffFields(title, prevE, nextE, up, down, warnings);
  }
  return { up, down, warnings };
}

function diffFields(
  list: string,
  prevE: SnapshotEntity,
  nextE: SnapshotEntity,
  up: MigrationOperation[],
  down: MigrationOperation[],
  warnings: DiffWarning[],
): void {
  const prevByName = new Map<string, FieldSpec>();
  for (const f of prevE.fields) prevByName.set(f.internalName, f);
  const nextByName = new Map<string, FieldSpec>();
  for (const f of nextE.fields) nextByName.set(f.internalName, f);

  // Added fields.
  for (const [name, f] of nextByName) {
    if (prevByName.has(name)) continue;
    up.push({ op: "addField", list, field: f });
    down.push({ op: "dropField", list, name });
  }
  // Removed fields.
  for (const [name, f] of prevByName) {
    if (nextByName.has(name)) continue;
    up.push({ op: "dropField", list, name });
    down.push({ op: "addField", list, field: f });
  }
  // Changed fields (present in both).
  for (const [name, nextF] of nextByName) {
    const prevF = prevByName.get(name);
    if (!prevF) continue;
    // Index change is handled separately from other attributes.
    if (Boolean(prevF.indexed) !== Boolean(nextF.indexed)) {
      if (nextF.indexed) {
        up.push({ op: "addIndex", list, field: name });
        down.push({ op: "dropIndex", list, field: name });
      } else {
        up.push({ op: "dropIndex", list, field: name });
        down.push({ op: "addIndex", list, field: name });
      }
    }
    if (!sameExceptIndex(prevF, nextF)) {
      const upOp: MigrationOperation = { op: "alterField", list, field: nextF };
      const downOp: MigrationOperation = {
        op: "alterField",
        list,
        field: prevF,
      };
      up.push(upOp);
      down.push(downOp);
      const upLoss = alterFieldDataLoss(spFieldTypeOf(prevF), nextF);
      if (upLoss !== undefined)
        warnings.push({ direction: "up", op: upOp, message: upLoss });
      const downLoss = alterFieldDataLoss(spFieldTypeOf(nextF), prevF);
      if (downLoss !== undefined)
        warnings.push({ direction: "down", op: downOp, message: downLoss });
    }
  }
}

function byTitle(s: SnapshotDoc): Map<string, SnapshotEntity> {
  const m = new Map<string, SnapshotEntity>();
  for (const e of s.entities) m.set(e.list.title, e);
  return m;
}

/**
 * Deep-equal two FieldSpecs ignoring the `indexed` flag.
 *
 * NOTE: this is a structural JSON compare — it treats an absent key as different
 * from a key carrying its default (e.g. a baseline that predates `Choice.multi`
 * vs a current spec with `multi: false`). So adding a defaulted member to
 * FieldSpec produces a one-time wave of no-op alterFields for existing fields,
 * until the next snapshot absorbs the new shape. Acceptable with a single
 * consumer and a deterministic serializer (both diff sides serialize the same
 * way). If a second consumer appears, or FieldSpec is reshaped often, normalize
 * defaults (absent boolean ≡ false) and sort keys before comparing instead.
 */
function sameExceptIndex(a: FieldSpec, b: FieldSpec): boolean {
  const strip = (f: FieldSpec) => {
    const { indexed: _i, ...rest } = f as FieldSpec & { indexed?: boolean };
    return rest;
  };
  return JSON.stringify(strip(a)) === JSON.stringify(strip(b));
}
