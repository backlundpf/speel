import { describe, it, expect } from "vitest";
import { resolvePreset } from "../src/table/filter/presets.js";

const NOW = new Date(2026, 5, 4); // 2026-06-04 (June)
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

describe("resolvePreset (federal fiscal start = 10)", () => {
  it("thisFiscalYear → Oct 1 (prev yr) .. Sep 30", () => {
    const r = resolvePreset("thisFiscalYear", 10, NOW);
    expect(iso(r.from)).toBe("2025-10-01");
    expect(iso(r.to)).toBe("2026-09-30");
  });
  it("thisFiscalQuarter → Apr 1 .. Jun 30 (federal Q3)", () => {
    const r = resolvePreset("thisFiscalQuarter", 10, NOW);
    expect(iso(r.from)).toBe("2026-04-01");
    expect(iso(r.to)).toBe("2026-06-30");
  });
  it("thisYear → calendar year", () => {
    const r = resolvePreset("thisYear", 10, NOW);
    expect(iso(r.from)).toBe("2026-01-01");
    expect(iso(r.to)).toBe("2026-12-31");
  });
  it("last30Days → 29 days back .. today", () => {
    const r = resolvePreset("last30Days", 10, NOW);
    expect(iso(r.from)).toBe("2026-05-06");
    expect(iso(r.to)).toBe("2026-06-04");
  });
  it("yearToDate → Jan 1 .. today", () => {
    const r = resolvePreset("yearToDate", 10, NOW);
    expect(iso(r.from)).toBe("2026-01-01");
    expect(iso(r.to)).toBe("2026-06-04");
  });
  it("honors a non-default fiscal start (July = 7)", () => {
    const r = resolvePreset("thisFiscalYear", 7, NOW);
    expect(iso(r.from)).toBe("2025-07-01");
    expect(iso(r.to)).toBe("2026-06-30");
  });
});
