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
const cols = [{ key: "Title" }, { key: "Status" }];
const openOnly = {
  filters: { Status: { kind: "select" as const, selected: ["Open"] } },
};

describe("SpeelTable scope", () => {
  it("applies an app scope the user has not overridden", () => {
    wrap(<SpeelTable of={Task} items={rows} columns={cols} scope={openOnly} />);
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.queryByText("B")).toBeNull();
  });

  it("marks a scope chip as app-supplied", () => {
    wrap(<SpeelTable of={Task} items={rows} columns={cols} scope={openOnly} />);
    expect(screen.getByTestId("chip-Status").getAttribute("data-source")).toBe(
      "scope",
    );
  });

  it("lets the user's own criteria win on the same column", () => {
    wrap(
      <SpeelTable
        of={Task}
        items={rows}
        columns={cols}
        scope={openOnly}
        tableState={{
          columns: [],
          filters: { Status: { kind: "select", selected: ["Closed"] } },
        }}
      />,
    );
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.queryByText("A")).toBeNull();
    expect(screen.getByTestId("chip-Status").getAttribute("data-source")).toBe(
      "user",
    );
  });

  it("reports a dismissal as clearedScope rather than silently dropping it", () => {
    const onTableStateChange = vi.fn();
    wrap(
      <SpeelTable
        of={Task}
        items={rows}
        columns={cols}
        scope={openOnly}
        onTableStateChange={onTableStateChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Clear Status" }));
    expect(onTableStateChange).toHaveBeenCalledWith(
      expect.objectContaining({ clearedScope: ["Status"] }),
    );
  });

  it("stops applying a dismissed scope", () => {
    wrap(
      <SpeelTable
        of={Task}
        items={rows}
        columns={cols}
        scope={openOnly}
        tableState={{ columns: [], clearedScope: ["Status"] }}
      />,
    );
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
  });

  it("leaves a user chip removable in the ordinary way", () => {
    const onTableStateChange = vi.fn();
    wrap(
      <SpeelTable
        of={Task}
        items={rows}
        columns={cols}
        defaultTableState={{
          columns: [],
          filters: { Status: { kind: "select", selected: ["Open"] } },
        }}
        onTableStateChange={onTableStateChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Clear Status" }));
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(onTableStateChange).not.toHaveBeenCalledWith(
      expect.objectContaining({ clearedScope: expect.anything() }),
    );
  });
});
