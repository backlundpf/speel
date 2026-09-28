import { describe, it, expect } from "vitest";
import * as api from "../src/index.js";
import type {
  SpeelEntityTableHandle,
  SpeelTableHandle,
  ColumnDescriptor,
} from "../src/index.js";
import type {
  TableFilterConfig,
  DatePreset,
  FilterCriteria,
  FilterState,
  RowIntent,
  ColumnState,
  TableState,
  TableViewStore,
  StoredView,
  AppDefaultView,
} from "../src/index.js";

describe("table public exports", () => {
  it("SpeelTable + SpeelEntityTable + types are exported", () => {
    // Both are forwardRef results: SpeelTable gained a handle when export landed.
    expect(typeof api.SpeelTable).toBe("object");
    expect(typeof api.SpeelEntityTable).toBe("object");
    const _eh: SpeelEntityTableHandle | undefined = undefined;
    const _th: SpeelTableHandle | undefined = undefined;
    const _c: ColumnDescriptor<{ X: number }> | undefined = undefined;
    const _f: TableFilterConfig | undefined = undefined;
    const _p: DatePreset | undefined = undefined;
    const _fc: FilterCriteria | undefined = undefined;
    const _fs: FilterState | undefined = undefined;
    const _ri: RowIntent | undefined = undefined;
    const _cs: ColumnState | undefined = undefined;
    const _ts: TableState | undefined = undefined;
    const _vs: TableViewStore | undefined = undefined;
    const _sv: StoredView | undefined = undefined;
    const _dv: AppDefaultView | undefined = undefined;
    expect(typeof api.useTableViews).toBe("function");
    expect(typeof api.createLocalViewStore).toBe("function");
    expect([
      _eh,
      _th,
      _c,
      _f,
      _p,
      _fc,
      _fs,
      _ri,
      _cs,
      _ts,
      _vs,
      _sv,
      _dv,
    ]).toHaveLength(13);
  });
});
