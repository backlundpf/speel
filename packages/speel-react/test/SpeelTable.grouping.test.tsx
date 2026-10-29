import { describe, it, expect, vi, afterEach } from "vitest";
import { createRef } from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { DbContext, ModelBuilder } from "@speel/core";
import { SpeelProvider } from "../src/SpeelProvider.js";
import {
  SpeelTable,
  type SpeelTableHandle,
  type SpeelTableProps,
} from "../src/table/SpeelTable.js";
import type { TableState } from "../src/table/useTableState.js";
import { fakeAdapter } from "./fakeAdapter.js";
import { makeFakeProvider } from "./fakeProvider.js";

class Task {
  Id?: number;
  Title?: string;
  Status?: string;
  Owner?: string;
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
      b.property((e) => e.Owner)
        .isText()
        .hasDisplayName("Owner");
    });
  }
}
const ctx = new TCtx({ provider: makeFakeProvider({ Tasks: [] }) } as never);
function wrap(node: JSX.Element) {
  const r = render(
    <SpeelProvider db={ctx as never} ui={fakeAdapter}>
      {node}
    </SpeelProvider>,
  );
  return {
    ...r,
    rerender: (n: JSX.Element) =>
      r.rerender(
        <SpeelProvider db={ctx as never} ui={fakeAdapter}>
          {n}
        </SpeelProvider>,
      ),
  };
}
// Titles T01..T12 so string order is numeric order; odd ids Open, even Closed.
const many = Array.from({ length: 12 }, (_, i) =>
  Object.assign(new Task(), {
    Id: i + 1,
    Title: `T${String(i + 1).padStart(2, "0")}`,
    Status: i % 2 === 0 ? "Open" : "Closed",
    Owner: i < 6 ? "Ann" : "Bob",
  }),
);
const columns: SpeelTableProps<Task>["columns"] = (p) => [
  p.Title,
  p.Status,
  p.Owner,
];
const toggle = (name: string): HTMLElement =>
  screen.getByRole("button", { name });
const dataRows = (): HTMLElement[] =>
  screen
    .getAllByRole("row")
    .filter(
      (r) => r.querySelector("td") && !r.hasAttribute("data-group-level"),
    );
const titles = (): string[] =>
  dataRows().map((r) => r.querySelector("td")!.textContent!);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SpeelTable grouping", () => {
  it("renders group headers with counts", () => {
    wrap(
      <SpeelTable
        of={Task}
        items={many}
        columns={columns}
        groupBy={(p) => [p.Status]}
      />,
    );
    expect(toggle("Status: Open")).toHaveAttribute("aria-expanded", "true");
    expect(toggle("Status: Closed")).toBeInTheDocument();
    expect(screen.getByText("Status: Open (6)")).toBeInTheDocument();
    expect(screen.getByText("Status: Closed (6)")).toBeInTheDocument();
    expect(dataRows()).toHaveLength(12);
  });

  it("nests", () => {
    const { container } = wrap(
      <SpeelTable
        of={Task}
        items={many}
        columns={columns}
        groupBy={(p) => [p.Status, p.Owner]}
      />,
    );
    expect(container.querySelectorAll('tr[data-group-level="1"]')).toHaveLength(
      4,
    );
    expect(screen.getAllByText("Owner: Ann (3)")).toHaveLength(2);
  });

  it("names each toggle by its whole path, so nested groups never share a name", () => {
    wrap(
      <SpeelTable
        of={Task}
        items={many}
        columns={columns}
        groupBy={(p) => [p.Status, p.Owner, { key: "x", by: () => "Any" }]}
      />,
    );
    expect(toggle("Status: Open")).toBeInTheDocument();
    expect(toggle("Status: Open, Owner: Ann")).toBeInTheDocument();
    expect(toggle("Status: Closed, Owner: Ann")).toBeInTheDocument();
    expect(toggle("Status: Closed, Owner: Ann, Any")).toBeInTheDocument();
  });

  it("starts collapsed per level", () => {
    wrap(
      <SpeelTable
        of={Task}
        items={many}
        columns={columns}
        groupBy={[{ key: "Status", collapsed: true }]}
      />,
    );
    expect(toggle("Status: Open")).toHaveAttribute("aria-expanded", "false");
    expect(toggle("Status: Closed")).toHaveAttribute("aria-expanded", "false");
    expect(dataRows()).toHaveLength(0);
  });

  it("toggles one group", () => {
    wrap(
      <SpeelTable
        of={Task}
        items={many}
        columns={columns}
        groupBy={["Status"]}
      />,
    );
    fireEvent.click(toggle("Status: Open"));
    expect(toggle("Status: Open")).toHaveAttribute("aria-expanded", "false");
    expect(titles()).toEqual(["T02", "T04", "T06", "T08", "T10", "T12"]);
  });

  it("expands and collapses all", () => {
    wrap(
      <SpeelTable
        of={Task}
        items={many}
        columns={columns}
        groupBy={(p) => [p.Status, p.Owner]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
    for (const b of screen.getAllByRole("button", { expanded: false }))
      expect(b).toHaveAttribute("aria-expanded", "false");
    expect(dataRows()).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
    expect(dataRows()).toHaveLength(12);
    expect(
      screen.getByRole("button", { name: "Collapse all" }),
    ).toBeInTheDocument();
  });

  it("gives the expand/collapse-all button an icon that matches what it does", () => {
    wrap(
      <SpeelTable
        of={Task}
        items={many}
        columns={columns}
        groupBy={["Status"]}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Collapse all" }),
    ).toHaveAttribute("data-icon", "CollapseContent");
    fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
    expect(screen.getByRole("button", { name: "Expand all" })).toHaveAttribute(
      "data-icon",
      "ExploreContent",
    );
  });

  it("hands the skin a collapse-all toggle that agrees with the toolbar", () => {
    wrap(
      <SpeelTable
        of={Task}
        items={many}
        columns={columns}
        groupBy={(p) => [{ key: "Status", collapsed: true }, p.Owner]}
      />,
    );
    // Every group on screen is collapsed: both offer to expand.
    fireEvent.click(screen.getByRole("button", { name: "Expand all groups" }));
    expect(dataRows()).toHaveLength(12);
    expect(
      screen.getByRole("button", { name: "Collapse all" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Collapse all groups" }),
    );
    expect(dataRows()).toHaveLength(0);
    expect(
      screen.getByRole("button", { name: "Expand all" }),
    ).toBeInTheDocument();
  });

  it("tells the skin which group headers are the app's own", () => {
    const { container } = wrap(
      <SpeelTable
        of={Task}
        items={many}
        columns={columns}
        groupBy={(p) => [
          p.Status,
          { key: p.Owner.key, header: (g) => <i>{g.label}</i> },
        ]}
      />,
    );
    const level = (n: number) =>
      Array.from(container.querySelectorAll(`tr[data-group-level="${n}"]`));
    for (const tr of level(0))
      expect(tr).not.toHaveAttribute("data-custom-header");
    for (const tr of level(1)) expect(tr).toHaveAttribute("data-custom-header");
  });

  it("offers Expand all when only hidden subgroups are expanded", () => {
    wrap(
      <SpeelTable
        of={Task}
        items={many}
        columns={columns}
        groupBy={(p) => [{ key: "Status", collapsed: true }, p.Owner]}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Expand all" }),
    ).toBeInTheDocument();
  });

  it("keeps a group collapsed while it is filtered away and back", () => {
    const base: TableState = { columns: [] };
    const props = { of: Task, items: many, columns, groupBy: ["Status"] };
    const { rerender } = wrap(<SpeelTable {...props} tableState={base} />);
    fireEvent.click(toggle("Status: Open"));
    rerender(
      <SpeelTable
        {...props}
        tableState={{
          ...base,
          filters: { Status: { kind: "select", selected: ["Closed"] } },
        }}
      />,
    );
    expect(screen.queryByRole("button", { name: "Status: Open" })).toBeNull();
    rerender(<SpeelTable {...props} tableState={base} />);
    expect(toggle("Status: Open")).toHaveAttribute("aria-expanded", "false");
  });

  it("turns paging off while grouped, warning once and leaving page state alone", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const onChange = vi.fn();
    const state: TableState = { columns: [], pageSize: 5, page: 2 };
    const props = {
      of: Task,
      items: many,
      columns,
      tableState: state,
      onTableStateChange: onChange,
    };
    const { rerender } = wrap(<SpeelTable {...props} groupBy={["Status"]} />);
    expect(screen.queryByRole("button", { name: "Next page" })).toBeNull();
    expect(dataRows()).toHaveLength(12);
    expect(screen.getByText("12 items")).toBeInTheDocument();
    rerender(<SpeelTable {...props} groupBy={["Status"]} />);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      "SpeelTable: groupBy takes precedence over pageSize; paging is off while grouped.",
    );
    expect(onChange).not.toHaveBeenCalled();
    rerender(<SpeelTable {...props} />);
    expect((screen.getByLabelText("Page") as HTMLSelectElement).value).toBe(
      "3",
    );
  });

  it("sorts rows within groups and never reorders the groups", () => {
    wrap(
      <SpeelTable
        of={Task}
        items={many}
        columns={columns}
        groupBy={["Status"]}
      />,
    );
    const groupOrder = (): string[] =>
      Array.from(
        document.querySelectorAll<HTMLElement>("tr[data-group-level] button"),
      ).map((b) => b.getAttribute("aria-label")!);
    expect(groupOrder()).toEqual(["Status: Open", "Status: Closed"]);
    fireEvent.click(screen.getByRole("button", { name: "Title" }));
    fireEvent.click(screen.getByRole("button", { name: "Title" }));
    expect(groupOrder()).toEqual(["Status: Open", "Status: Closed"]);
    expect(titles().slice(0, 6)).toEqual([
      "T11",
      "T09",
      "T07",
      "T05",
      "T03",
      "T01",
    ]);
  });

  it("reports matched rows in grouped order", () => {
    const onMatched = vi.fn();
    wrap(
      <SpeelTable
        of={Task}
        items={many}
        columns={columns}
        groupBy={["Status"]}
        onMatchedRowsChange={onMatched}
      />,
    );
    const last = onMatched.mock.calls.at(-1)![0] as Task[];
    expect(last.map((t) => t.Id)).toEqual([
      1, 3, 5, 7, 9, 11, 2, 4, 6, 8, 10, 12,
    ]);
  });

  it("groups by a column the user has hidden", () => {
    wrap(
      <SpeelTable
        of={Task}
        items={many}
        columns={columns}
        defaultTableState={{
          columns: [{ key: "Title" }, { key: "Status", hidden: true }],
        }}
        groupBy={["Status"]}
      />,
    );
    expect(screen.getByText("Status: Open (6)")).toBeInTheDocument();
  });

  it("throws on a key that names nothing", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      wrap(
        <SpeelTable
          of={Task}
          items={many}
          columns={columns}
          groupBy={["Nope"]}
        />,
      ),
    ).toThrow(/groupBy key 'Nope'/);
  });

  it("expands and collapses all through the handle", () => {
    const ref = createRef<SpeelTableHandle>();
    wrap(
      <SpeelTable
        ref={ref}
        of={Task}
        items={many}
        columns={columns}
        groupBy={["Status"]}
      />,
    );
    act(() => ref.current!.collapseAllGroups());
    expect(dataRows()).toHaveLength(0);
    act(() => ref.current!.expandAllGroups());
    expect(dataRows()).toHaveLength(12);
  });

  it("shows no expand/collapse button on an empty table", () => {
    wrap(
      <SpeelTable
        of={Task}
        items={[]}
        columns={columns}
        groupBy={["Status"]}
      />,
    );
    expect(screen.queryByRole("button", { name: /all$/ })).toBeNull();
  });
});
