import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { V8Table } from "../src/fluent-v8/primitives.js";
import type {
  TableColumn,
  TableGroupNode,
} from "../src/adapter/SpeelUIAdapter.js";

type Row = { t: string };
const columns: TableColumn[] = [
  {
    key: "t",
    header: "Title",
    width: 120,
    render: (row: unknown) => (row as Row).t,
  },
];
const items: Row[] = [
  { t: "open one" },
  { t: "open two" },
  { t: "closed one" },
];
const groups = (closedCollapsed: boolean): TableGroupNode[] => [
  {
    id: "s=Open",
    header: "Status: Open (2)",
    label: "Open",
    count: 2,
    level: 0,
    startIndex: 0,
    collapsed: false,
  },
  {
    id: "s=Closed",
    header: "Status: Closed (1)",
    label: "Closed",
    count: 1,
    level: 0,
    startIndex: 2,
    collapsed: closedCollapsed,
  },
];
/** The table's own box: as wide as the columns, spacers included. */
const tableBox = (container: HTMLElement): number =>
  parseFloat(
    (container.firstElementChild!.firstElementChild as HTMLElement).style.width,
  );

describe("V8Table groups", () => {
  it("renders our header as the group title, without Fluent's own count", () => {
    render(
      <V8Table
        columns={columns}
        items={items}
        groups={groups(false)}
        containerWidth={600}
      />,
    );
    expect(screen.getByText("Status: Open (2)")).toBeInTheDocument();
    expect(screen.getByText("Status: Closed (1)")).toBeInTheDocument();
    expect(screen.queryByText("(2)")).toBeNull();
    expect(screen.getByText("open one")).toBeInTheDocument();
    expect(screen.getByText("closed one")).toBeInTheDocument();
  });

  it("hides the rows of a collapsed group", () => {
    render(
      <V8Table
        columns={columns}
        items={items}
        groups={groups(true)}
        containerWidth={600}
      />,
    );
    expect(screen.getByText("open two")).toBeInTheDocument();
    expect(screen.queryByText("closed one")).toBeNull();
  });

  it("names each group's toggle, reports it by id, and says whether it is expanded", () => {
    const onToggleGroup = vi.fn();
    render(
      <V8Table
        columns={columns}
        items={items}
        groups={groups(true)}
        onToggleGroup={onToggleGroup}
        containerWidth={600}
      />,
    );
    const closed = screen.getByRole("button", { name: "Closed" });
    expect(closed).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "Open" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    fireEvent.click(closed);
    expect(onToggleGroup).toHaveBeenCalledWith("s=Closed");
  });

  it("follows the collapsed prop, not its own toggle state", () => {
    const { rerender } = render(
      <V8Table
        columns={columns}
        items={items}
        groups={groups(false)}
        containerWidth={600}
      />,
    );
    rerender(
      <V8Table
        columns={columns}
        items={items}
        groups={groups(true)}
        containerWidth={600}
      />,
    );
    expect(screen.queryByText("closed one")).toBeNull();
  });

  it("widens the table by one spacer per nesting level", () => {
    const flat = render(
      <V8Table columns={columns} items={items} containerWidth={600} />,
    );
    const flatWidth = tableBox(flat.container);
    flat.unmount();
    const nested: TableGroupNode[] = [
      {
        ...groups(false)[0]!,
        children: [
          {
            id: "s=Open/o=Ann",
            header: "Owner: Ann (2)",
            label: "Ann",
            count: 2,
            level: 1,
            startIndex: 0,
            collapsed: false,
          },
        ],
      },
    ];
    const { container } = render(
      <V8Table
        columns={columns}
        items={items.slice(0, 2)}
        groups={nested}
        containerWidth={600}
      />,
    );
    expect(tableBox(container)).toBe(flatWidth + 2 * 36);
  });
});
