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
const nested: TableGroupNode[] = [
  {
    id: "s=Open",
    header: "Status: Open (2)",
    label: "Open",
    count: 2,
    level: 0,
    startIndex: 0,
    collapsed: false,
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
/** What each header cell renders at. */
const headerWidths = (container: HTMLElement): number[] =>
  Array.from(
    container.querySelectorAll<HTMLElement>(
      '[data-automationid="ColumnsHeaderColumn"]',
    ),
  ).map((el) => parseFloat(el.style.width));
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

  it("names the group header row, which is where keyboard focus lands, and keeps its title in a grid cell", () => {
    render(
      <V8Table
        columns={columns}
        items={items}
        groups={groups(false)}
        containerWidth={600}
      />,
    );
    const row = screen.getByRole("row", { name: "Closed" });
    expect(row).toHaveAttribute("aria-expanded", "true");
    const title = screen.getByText("Status: Closed (1)");
    expect(title.closest('[role="gridcell"]')).not.toBeNull();
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

  it("offsets data rows under their groups, keeping every column its full width", () => {
    const flat = render(
      <V8Table columns={columns} items={items} containerWidth={600} />,
    );
    const flatWidth = tableBox(flat.container);
    const flatColumns = headerWidths(flat.container);
    flat.unmount();
    const { container } = render(
      <V8Table
        columns={columns}
        items={items.slice(0, 2)}
        groups={nested}
        containerWidth={600}
      />,
    );
    // One 36px step per nesting level, in front of the columns.
    expect(tableBox(container)).toBe(flatWidth + 2 * 36);
    expect(headerWidths(container)).toEqual(flatColumns);
  });

  it("puts an expand/collapse-all toggle in the header cell in front of the columns", () => {
    const onToggleAllGroups = vi.fn();
    const { rerender } = render(
      <V8Table
        columns={columns}
        items={items.slice(0, 2)}
        groups={nested}
        allGroupsCollapsed={false}
        onToggleAllGroups={onToggleAllGroups}
        containerWidth={600}
      />,
    );
    const toggle = screen.getByRole("columnheader", {
      name: "Collapse all groups",
    });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(toggle);
    expect(onToggleAllGroups).toHaveBeenCalledTimes(1);
    rerender(
      <V8Table
        columns={columns}
        items={items.slice(0, 2)}
        groups={nested}
        allGroupsCollapsed
        onToggleAllGroups={onToggleAllGroups}
        containerWidth={600}
      />,
    );
    expect(
      screen.getByRole("columnheader", { name: "Expand all groups" }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("mutes default group headers by level, in at most three steps", () => {
    const deep: TableGroupNode[] = [
      {
        ...nested[0]!,
        children: [
          {
            ...nested[0]!.children![0]!,
            children: [
              {
                id: "s=Open/o=Ann/d=Late",
                header: "Due: Late (2)",
                label: "Late",
                count: 2,
                level: 2,
                startIndex: 0,
                collapsed: false,
                children: [
                  {
                    id: "s=Open/o=Ann/d=Late/x=Deep",
                    header: "Deep (2)",
                    label: "Deep",
                    count: 2,
                    level: 3,
                    startIndex: 0,
                    collapsed: false,
                  },
                ],
              },
            ],
          },
        ],
      },
    ];
    render(
      <V8Table
        columns={columns}
        items={items.slice(0, 2)}
        groups={deep}
        containerWidth={600}
      />,
    );
    const title = (text: string) => screen.getByText(text);
    // Three steps of grey, all semibold: neutralPrimary, halfway, neutralSecondary.
    expect(title("Status: Open (2)")).toHaveStyle({
      color: "#323130",
      fontWeight: 600,
    });
    expect(title("Owner: Ann (2)")).toHaveStyle({
      color: "#494846",
      fontWeight: 600,
    });
    expect(title("Due: Late (2)")).toHaveStyle({
      color: "#605e5c",
      fontWeight: 600,
    });
    expect(title("Deep (2)")).toHaveStyle({
      color: "#605e5c",
      fontWeight: 600,
    });
  });

  it("leaves an app's own group header unstyled", () => {
    render(
      <V8Table
        columns={columns}
        items={items}
        groups={[{ ...groups(false)[1]!, customHeader: true, level: 1 }]}
        containerWidth={600}
      />,
    );
    const title = screen.getByText("Status: Closed (1)");
    expect(title.style.color).toBe("");
  });
});
