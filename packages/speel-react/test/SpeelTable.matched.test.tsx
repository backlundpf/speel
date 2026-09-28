import { describe, it, expect } from "vitest";
import { useState } from "react";
import { render } from "@testing-library/react";
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
const ctx = new TCtx({ provider: makeFakeProvider({ Tasks: [] }) } as never);
const tree = (node: JSX.Element): JSX.Element => (
  <SpeelProvider db={ctx as never} ui={fakeAdapter}>
    {node}
  </SpeelProvider>
);

const many = Array.from({ length: 12 }, (_, i) =>
  Object.assign(new Task(), {
    Id: i + 1,
    Title: `T${i + 1}`,
    Status: i % 2 === 0 ? "Open" : "Closed",
  }),
);
const columns = [{ key: "Title" }, { key: "Status" }];

// Held as constants: a controlled `tableState` literal rebuilt on every render would be a
// new object each time, and the assertions below are about the MATCHED set's identity, not
// the state object's.
const UNFILTERED: TableState = { columns: [], filters: {} };
const OPEN_ONLY: TableState = {
  columns: [],
  filters: { Status: { kind: "select", selected: ["Open"] } },
};
const CLOSED_ONLY: TableState = {
  columns: [],
  filters: { Status: { kind: "select", selected: ["Closed"] } },
};
// Same membership as OPEN_ONLY, two orders: the reorder case sorts by a column whose
// values are all distinct, so descending is exactly ascending reversed.
const OPEN_ASC: TableState = {
  ...OPEN_ONLY,
  sort: { key: "Title", direction: "asc" },
};
const OPEN_DESC: TableState = {
  ...OPEN_ONLY,
  sort: { key: "Title", direction: "desc" },
};

// A parent that does what a charts-over-a-table page does: lifts the matched rows into
// state, and passes `columns` as an inline factory — a fresh closure every render, the
// common way to pass columns. Without content comparison in the table this is a render
// loop: setRows → parent re-renders → new factory → `matched` rebuilt → effect → setRows.
const RENDER_GUARD = 200;
function LiftingParent({
  renders,
}: {
  renders: { current: number };
}): JSX.Element {
  renders.current++;
  if (renders.current > RENDER_GUARD)
    throw new Error(`render loop: parent rendered ${renders.current} times`);
  const [rows, setRows] = useState<readonly Task[]>([]);
  return (
    <>
      <output data-testid="matched-count">{rows.length}</output>
      <output data-testid="matched-ids">
        {rows.map((t) => t.Id).join(",")}
      </output>
      <SpeelTable
        of={Task}
        items={many}
        columns={() => [{ key: "Title" }, { key: "Status" }]}
        defaultTableState={OPEN_ONLY}
        onMatchedRowsChange={setRows}
      />
    </>
  );
}

describe("SpeelTable onMatchedRowsChange", () => {
  it("reports the whole filtered set — every page — on mount", () => {
    const seen: (readonly Task[])[] = [];
    render(
      tree(
        <SpeelTable
          of={Task}
          items={many}
          pageSize={5}
          columns={columns}
          defaultTableState={OPEN_ONLY}
          onMatchedRowsChange={(rows) => seen.push(rows)}
        />,
      ),
    );
    expect(seen).toHaveLength(1);
    expect(seen[0]).toHaveLength(6); // not the 5-row page
    expect(seen[0]!.every((t) => t.Status === "Open")).toBe(true);
  });

  it("fires again when the filter changes, and not when an unrelated prop does", () => {
    const seen: (readonly Task[])[] = [];
    const table = (state: TableState, emptyMessage: string): JSX.Element => (
      <SpeelTable
        of={Task}
        items={many}
        columns={columns}
        tableState={state}
        onTableStateChange={() => undefined}
        emptyMessage={emptyMessage}
        // A fresh arrow every render, deliberately: the callback is read through a ref,
        // so its identity must not re-fire the effect.
        onMatchedRowsChange={(rows) => seen.push(rows)}
      />
    );
    const r = render(tree(table(UNFILTERED, "a")));
    expect(seen).toHaveLength(1);
    expect(seen[0]).toHaveLength(12);

    r.rerender(tree(table(UNFILTERED, "b")));
    expect(seen).toHaveLength(1);

    r.rerender(tree(table(CLOSED_ONLY, "b")));
    expect(seen).toHaveLength(2);
    expect(seen[1]).toHaveLength(6);
    expect(seen[1]!.every((t) => t.Status === "Closed")).toBe(true);
  });

  it("is optional — a table without it renders as before", () => {
    const r = render(
      tree(<SpeelTable of={Task} items={many} columns={columns} />),
    );
    expect(
      r.container.querySelectorAll("tbody tr, [role='row']").length,
    ).toBeGreaterThan(0);
  });

  it("settles when a parent lifts the rows into state and passes an inline columns factory", () => {
    const renders = { current: 0 };
    const r = render(tree(<LiftingParent renders={renders} />));
    expect(renders.current).toBeLessThanOrEqual(5);
    expect(r.getByTestId("matched-count").textContent).toBe("6");
    // The six Open tasks, in item order.
    expect(r.getByTestId("matched-ids").textContent).toBe("1,3,5,7,9,11");
  });

  it("does not fire when the set is rebuilt with the same rows in the same order", () => {
    const seen: (readonly Task[])[] = [];
    // A new factory per call, so each render rebuilds `resolved` and therefore `matched`.
    const table = (state: TableState): JSX.Element => (
      <SpeelTable
        of={Task}
        items={many}
        columns={() => [{ key: "Title" }, { key: "Status" }]}
        tableState={state}
        onTableStateChange={() => undefined}
        onMatchedRowsChange={(rows) => seen.push(rows)}
      />
    );
    const r = render(tree(table(OPEN_ONLY)));
    expect(seen).toHaveLength(1);
    expect(seen[0]).toHaveLength(6);

    r.rerender(tree(table(OPEN_ONLY)));
    r.rerender(tree(table(OPEN_ONLY)));
    expect(seen).toHaveLength(1);
  });

  it("fires on a reorder — same rows, different order", () => {
    const seen: (readonly Task[])[] = [];
    const table = (state: TableState): JSX.Element => (
      <SpeelTable
        of={Task}
        items={many}
        columns={columns}
        tableState={state}
        onTableStateChange={() => undefined}
        onMatchedRowsChange={(rows) => seen.push(rows)}
      />
    );
    const r = render(tree(table(OPEN_ASC)));
    expect(seen).toHaveLength(1);
    expect(seen[0]).toHaveLength(6);

    r.rerender(tree(table(OPEN_DESC)));
    expect(seen).toHaveLength(2);
    expect(seen[1]).toHaveLength(6);
    // The same six instances, exactly reversed.
    expect(seen[1]!.every((t, i) => t === seen[0]![5 - i])).toBe(true);
    expect(seen[1]![0]).not.toBe(seen[0]![0]);
  });
});
