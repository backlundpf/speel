import { describe, it, expect } from "vitest";
import type { TableFilterConfig, DatePreset } from "../../../src/index.js";

describe("TableFilterConfig", () => {
  it("each variant is constructible and assignable", () => {
    const presets: DatePreset[] = [
      "thisFiscalYear",
      "thisFiscalQuarter",
      "last30Days",
    ];
    const configs: TableFilterConfig[] = [
      { kind: "text" },
      { kind: "numberRange" },
      { kind: "dateRange", presets },
      { kind: "select", multi: true, options: ["A", "B"] },
      { kind: "boolean" },
      { kind: "none" },
    ];
    expect(configs).toHaveLength(6);
    expect(configs[2]).toMatchObject({ kind: "dateRange" });
  });
});
