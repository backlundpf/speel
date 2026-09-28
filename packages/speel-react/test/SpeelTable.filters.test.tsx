import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DbContext, ModelBuilder } from "@speel/core";
import { SpeelProvider } from "../src/SpeelProvider.js";
import { SpeelTable } from "../src/table/SpeelTable.js";
import { fakeAdapter } from "./fakeAdapter.js";
import { makeFakeProvider } from "./fakeProvider.js";

class Task {
  Id?: number;
  Title?: string;
  Status?: string;
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
  Object.assign(new Task(), { Id: 1, Title: "A", Status: "Open" }),
  Object.assign(new Task(), { Id: 2, Title: "B", Status: "Closed" }),
];

describe("SpeelTable seeded filters", () => {
  it("opens pre-filtered, with a visible clearable chip", () => {
    wrap(
      <SpeelTable
        of={Task}
        items={rows}
        defaultTableState={{
          columns: [],
          filters: { Status: { kind: "select", selected: ["Open"] } },
        }}
      />,
    );
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.queryByText("B")).toBeNull();
    // The chip lives in the FilterBar and clears through its own button.
    fireEvent.click(screen.getByRole("button", { name: "Clear Status" }));
    expect(screen.getByText("B")).toBeInTheDocument();
  });

  it("seeds once — a later prop change does not re-apply", () => {
    const { rerender } = wrap(
      <SpeelTable
        of={Task}
        items={rows}
        defaultTableState={{
          columns: [],
          filters: { Status: { kind: "select", selected: ["Open"] } },
        }}
      />,
    );
    const ctx = new TCtx({
      provider: makeFakeProvider({ Tasks: [] }),
    } as never);
    rerender(
      <SpeelProvider db={ctx as never} ui={fakeAdapter}>
        <SpeelTable
          of={Task}
          items={rows}
          defaultTableState={{
            columns: [],
            filters: { Status: { kind: "select", selected: ["Closed"] } },
          }}
        />
      </SpeelProvider>,
    );
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.queryByText("B")).toBeNull();
  });

  it("throws on a key that is not a filterable column", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() =>
      wrap(
        <SpeelTable
          of={Task}
          items={rows}
          defaultTableState={{
            columns: [],
            filters: { Nope: { kind: "text", query: "x" } },
          }}
        />,
      ),
    ).toThrow(/Nope/);
    err.mockRestore();
  });

  it("throws when the criteria kind does not match the column filter", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() =>
      wrap(
        <SpeelTable
          of={Task}
          items={rows}
          defaultTableState={{
            columns: [],
            filters: { Status: { kind: "numberRange", min: 1 } },
          }}
        />,
      ),
    ).toThrow(/Status/);
    err.mockRestore();
  });

  it("throws when combined with filterable={false}", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() =>
      wrap(
        <SpeelTable
          of={Task}
          items={rows}
          filterable={false}
          defaultTableState={{
            columns: [],
            filters: { Status: { kind: "select", selected: ["Open"] } },
          }}
        />,
      ),
    ).toThrow(/filterable/);
    err.mockRestore();
  });
});

describe("SpeelTable footer count", () => {
  it("shows matched of total when filters are active", () => {
    wrap(
      <SpeelTable
        of={Task}
        items={rows}
        defaultTableState={{
          columns: [],
          filters: { Status: { kind: "select", selected: ["Open"] } },
        }}
      />,
    );
    expect(screen.getByTestId("item-count").textContent).toBe("1 of 2 items");
  });

  it("shows the plain total when no filter is active", () => {
    wrap(<SpeelTable of={Task} items={rows} />);
    expect(screen.getByTestId("item-count").textContent).toBe("2 items");
  });
});
