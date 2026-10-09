/**
 * Type-level assertions for the table's props surface.
 *
 * A `.test-d.ts` on purpose: `tsconfig.test.json` compiles `src/**` and
 * `test/**\/*.test-d.ts` only, so a removed prop is proven gone by tsc rather
 * than by a runtime test that never sees the types.
 */
import type { IEntity } from "@speel/core";
import type { SpeelTableProps } from "../src/table/SpeelTable.js";

type Props = SpeelTableProps<IEntity>;

// Views made both redundant: the narrow seed they gave is exactly what
// `defaultTableState` (no views) or a `defaultViews` entry (with views) carries — filters
// AND sort AND columns AND page size, in one value the table already understands.

// @ts-expect-error — removed: seed filters through defaultTableState or a default view.
type _NoDefaultFilters = Props["defaultFilters"];

// @ts-expect-error — removed: seed sort through defaultTableState or a default view.
type _NoDefaultSort = Props["defaultSort"];

// What replaced them is one value, and it is still there.
declare function expectType<T>(value: T): void;
declare const props: Props;
expectType<
  { columns: { key: string; hidden?: boolean; width?: number }[] } | undefined
>(props.defaultTableState);

// ── #65: the columns callback's parameter is a map of column refs ──
class Task implements IEntity {
  Id?: number;
  Title?: string;
  Status?: string;
  describe(): string {
    return this.Title ?? "";
  }
}
type Cols = NonNullable<SpeelTableProps<Task>["columns"]>;

// A bare ref and a ref with options both type-check.
expectType<Cols>((p) => [p.Title, p.Status.with({ width: 120 })]);
// render's row is the entity, with no annotation.
expectType<Cols>((p) => [p.Title.with({ render: (r) => r.Status ?? "" })]);
// @ts-expect-error — a misspelt field is a compile error
expectType<Cols>((p) => [p.Titel]);
// @ts-expect-error — render's row is the entity, so a misspelt field fails there too
expectType<Cols>((p) => [p.Title.with({ render: (r) => r.Titel })]);
// @ts-expect-error — methods are not columns
expectType<Cols>((p) => [p.describe]);
// @ts-expect-error — the parameter is a map of column refs, not the entity
expectType<Cols>((p: Task) => [p.Title]);
