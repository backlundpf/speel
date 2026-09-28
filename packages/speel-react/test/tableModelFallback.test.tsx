import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DbContext, ModelBuilder } from "@speel/core";
import { SpeelProvider } from "../src/SpeelProvider.js";
import { SpeelTable } from "../src/table/SpeelTable.js";
import type { TableState } from "../src/table/useTableState.js";
import { fakeAdapter } from "./fakeAdapter.js";
import { makeFakeProvider } from "./fakeProvider.js";

class Task {
  Id?: number;
  Title?: string;
  Status?: string;
  FiscalYear?: string;
  Due?: Date;
}
class TCtx extends DbContext {
  protected override onModelCreating(mb: ModelBuilder): void {
    mb.entity(Task, (b) => {
      b.toList("Tasks");
      b.property((e) => e.Id).isNumber();
      b.property((e) => e.Title)
        .isText()
        .hasDisplayName("Title");
      b.property((e) => e.Status)
        .isChoice()
        .hasOptions(["Open", "Closed"])
        .hasDisplayName("Status");
      b.property((e) => e.FiscalYear)
        .isChoice()
        .hasOptions(["2025", "2026"])
        .hasDisplayName("Fiscal Year");
      b.property((e) => e.Due)
        .isDateTime()
        .hasDisplayName("Due");
    });
  }
}

function wrap(node: JSX.Element) {
  const ctx = new TCtx({ provider: makeFakeProvider({ Tasks: [] }) } as never);
  return render(
    <SpeelProvider db={ctx as never} ui={fakeAdapter}>
      {node}
    </SpeelProvider>,
  );
}

const rows = [
  Object.assign(new Task(), {
    Id: 1,
    Title: "A",
    Status: "Open",
    FiscalYear: "2026",
    Due: new Date(2026, 2, 1),
  }),
  Object.assign(new Task(), {
    Id: 2,
    Title: "B",
    Status: "Closed",
    FiscalYear: "2025",
    Due: new Date(2026, 0, 1),
  }),
  Object.assign(new Task(), {
    Id: 3,
    Title: "C",
    Status: "Open",
    FiscalYear: "2026",
    Due: new Date(2026, 1, 1),
  }),
];

/** The rendered body rows' first cell, in render order. */
const titles = (): string[] =>
  Array.from(document.querySelectorAll("tbody tr")).map(
    (tr) => tr.querySelector("td")!.textContent ?? "",
  );

const fyFilter: TableState = {
  columns: [],
  filters: { FiscalYear: { kind: "select", selected: ["2026"] } },
};

describe("filter/sort keys resolve against the entity model", () => {
  it("filters on a field the table does not display, exactly as the column would", () => {
    const { unmount } = wrap(
      <SpeelTable
        of={Task}
        items={rows}
        columns={["Title", "FiscalYear"]}
        defaultTableState={fyFilter}
      />,
    );
    const withColumn = titles();
    expect(withColumn).toEqual(["A", "C"]);
    unmount();

    wrap(
      <SpeelTable
        of={Task}
        items={rows}
        columns={["Title"]}
        defaultTableState={fyFilter}
      />,
    );
    expect(titles()).toEqual(withColumn);
  });

  it("filters a date field with no column of its own", () => {
    wrap(
      <SpeelTable
        of={Task}
        items={rows}
        columns={["Title"]}
        defaultTableState={{
          columns: [],
          filters: { Due: { kind: "dateRange", to: new Date(2026, 1, 15) } },
        }}
      />,
    );
    expect(titles()).toEqual(["B", "C"]);
  });

  it("sorts by a field with no column of its own", () => {
    wrap(
      <SpeelTable
        of={Task}
        items={rows}
        columns={["Title"]}
        defaultTableState={{
          columns: [],
          sort: { key: "Due", direction: "asc" },
        }}
      />,
    );
    expect(titles()).toEqual(["B", "C", "A"]);
  });

  it("labels a model-resolved chip with the field's display name", () => {
    wrap(
      <SpeelTable
        of={Task}
        items={rows}
        columns={["Title"]}
        defaultTableState={fyFilter}
      />,
    );
    expect(screen.getByTestId("chip-FiscalYear")).toHaveTextContent(
      "Fiscal Year: 2026",
    );
  });

  it("keeps filtering on a column the user hid in the chooser", () => {
    wrap(
      <SpeelTable
        of={Task}
        items={rows}
        columns={["Title", "FiscalYear"]}
        defaultTableState={{
          ...fyFilter,
          columns: [{ key: "FiscalYear", hidden: true }],
        }}
      />,
    );
    expect(titles()).toEqual(["A", "C"]);
    expect(screen.queryByText("Fiscal Year")).toBeNull();
  });
});
