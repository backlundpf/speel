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
