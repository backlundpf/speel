import { describe, it, expect } from "vitest";
import type { ReactNode } from "react";
import { createElement } from "react";
import { nodeText, cellText } from "../src/table/cellText.js";
import { buildCsv, csvFileName } from "../src/table/csv.js";
import type { ResolvedColumn } from "../src/table/columns.js";

interface Row {
  Id: number;
  Title: string;
  Status: string;
}
const row: Row = { Id: 1, Title: "Alpha", Status: "Open" };

function col(over: Partial<ResolvedColumn<Row>>): ResolvedColumn<Row> {
  return {
    key: "Title",
    header: "Title",
    render: () => "Alpha",
    sortable: false,
    ...over,
  };
}

describe("nodeText", () => {
  it("reads strings, numbers, arrays, and host-element children", () => {
    expect(nodeText("a")).toBe("a");
    expect(nodeText(7)).toBe("7");
    expect(nodeText(["a", "b"])).toBe("ab");
    expect(nodeText(createElement("b", null, "bold"))).toBe("bold");
    expect(
      nodeText(
        createElement("span", null, createElement("i", null, "deep"), "!"),
      ),
    ).toBe("deep!");
  });

  it("yields nothing for null, booleans, and custom components", () => {
    expect(nodeText(null)).toBe("");
    expect(nodeText(true)).toBe("");
    const Pill = (): ReactNode => "never rendered";
    expect(nodeText(createElement(Pill))).toBe("");
  });
});

describe("cellText", () => {
  it("prefers exportValue over everything", () => {
    const c = col({ exportValue: () => "explicit", render: () => "rendered" });
    expect(cellText(c, row)).toBe("explicit");
  });

  it("uses the rendered text before the raw field value — a masked column must not leak", () => {
    const c = col({
      render: () => "Masked",
      field: { config: { kind: "Text" } as never, raw: () => "Secret" },
    });
    expect(cellText(c, row)).toBe("Masked");
  });

  it("falls back to the formatted field value when the render yields no text", () => {
    const c = col({
      render: () => createElement("span"),
      field: { config: { kind: "Boolean" } as never, raw: () => true },
    });
    expect(cellText(c, row)).toBe("Yes");
  });

  it("falls back to filterValue then sortValue for custom columns", () => {
    expect(
      cellText(
        col({
          render: () => null,
          filter: { config: { kind: "text" }, getValue: () => "filtered" },
        }),
        row,
      ),
    ).toBe("filtered");
    expect(
      cellText(col({ render: () => null, sortAccessor: () => 42 }), row),
    ).toBe("42");
  });

  it("exports the empty-value placeholder as an empty cell", () => {
    expect(cellText(col({ render: () => "—" }), row)).toBe("");
  });

  it("formats dates and booleans from exportValue", () => {
    expect(
      cellText(col({ exportValue: () => new Date(2026, 7, 4) }), row),
    ).toBe("2026-08-04");
    expect(cellText(col({ exportValue: () => false }), row)).toBe("No");
    expect(cellText(col({ exportValue: () => null }), row)).toBe("");
  });
});

describe("buildCsv", () => {
  const headers = (csv: string): string =>
    csv.replace("﻿", "").split("\r\n")[0]!;
  const line = (csv: string, i: number): string =>
    csv.replace("﻿", "").split("\r\n")[i]!;

  it("writes a BOM, CRLF lines, and the column headers", () => {
    const csv = buildCsv([col({})], [row]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(headers(csv)).toBe("Title");
    expect(line(csv, 1)).toBe("Alpha");
  });

  it("quotes commas, quotes, and newlines", () => {
    const csv = buildCsv(
      [
        col({ render: () => "a,b" }),
        col({ key: "q", header: "Q", render: () => 'say "hi"' }),
      ],
      [row],
    );
    expect(line(csv, 1)).toBe('"a,b","say ""hi"""');
  });

  it("neutralizes formula-injection prefixes but leaves negative numbers alone", () => {
    const csv = buildCsv(
      [
        col({ key: "f", header: "F", render: () => '=HYPERLINK("http://x")' }),
        col({ key: "n", header: "N", render: () => "-5" }),
      ],
      [row],
    );
    expect(line(csv, 1)).toBe(`"'=HYPERLINK(""http://x"")",-5`);
  });
});

describe("csvFileName", () => {
  it("joins the prefix with an ISO date", () => {
    expect(csvFileName("responses", new Date(2026, 7, 4))).toBe(
      "responses-2026-08-04.csv",
    );
  });
});
