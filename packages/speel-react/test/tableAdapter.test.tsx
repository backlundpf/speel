import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";
import { fakeAdapter } from "./fakeAdapter.js";
import type { TableColumn } from "../src/adapter/SpeelUIAdapter.js";

describe("fakeAdapter.Table sort contract", () => {
  const columns: TableColumn[] = [
    {
      key: "Title",
      header: "Title",
      render: (r) => (r as { Title: string }).Title,
      sortable: true,
    },
    { key: "Plain", header: "Plain", render: () => "x" },
  ];
  const items = [{ Title: "A" }, { Title: "B" }];

  it("renders a header button for sortable columns and fires onSortChange", () => {
    const onSortChange = vi.fn();
    render(
      <fakeAdapter.Table
        columns={columns}
        items={items}
        sort={{ key: "Title", direction: "asc" }}
        onSortChange={onSortChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Title" }));
    expect(onSortChange).toHaveBeenCalledWith("Title");
    expect(screen.queryByRole("button", { name: "Plain" })).toBeNull();
  });

  it("reflects the active sort via aria-sort", () => {
    render(
      <fakeAdapter.Table
        columns={columns}
        items={items}
        sort={{ key: "Title", direction: "desc" }}
        onSortChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("columnheader", { name: "Title" })).toHaveAttribute(
      "aria-sort",
      "descending",
    );
  });
});

describe("fakeAdapter.Dropdown multiselect", () => {
  it("toggles values as an array", () => {
    const onChange = vi.fn();
    render(
      <fakeAdapter.Dropdown
        label="C"
        multiselect
        value={[]}
        onChange={onChange}
        options={[
          { key: "a", text: "A", data: "A" },
          { key: "b", text: "B", data: "B" },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "A" }));
    expect(onChange).toHaveBeenCalledWith(["A"]);
  });
});

describe("fakeAdapter.Popover", () => {
  it("renders trigger; shows children when open", () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <fakeAdapter.Popover
        open={false}
        onOpenChange={onOpenChange}
        trigger={<button>open</button>}
      >
        <div>flyout-body</div>
      </fakeAdapter.Popover>,
    );
    expect(screen.getByText("open")).toBeInTheDocument();
    expect(screen.queryByText("flyout-body")).toBeNull();
    rerender(
      <fakeAdapter.Popover
        open
        onOpenChange={onOpenChange}
        trigger={<button>open</button>}
      >
        <div>flyout-body</div>
      </fakeAdapter.Popover>,
    );
    expect(screen.getByText("flyout-body")).toBeInTheDocument();
  });
});

describe("fakeAdapter.IconButton toggled", () => {
  it("reflects toggled via aria-pressed", () => {
    render(
      <fakeAdapter.IconButton
        iconName="Filter"
        title="Filter Status"
        toggled
        onClick={() => {}}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Filter Status" }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});

describe("fakeAdapter.Table header filter", () => {
  const content: ReactNode = <div>flyout-control</div>;
  const columns: TableColumn[] = [
    {
      key: "Status",
      header: "Status",
      render: () => "x",
      sortable: true,
      headerFilter: { active: true, content },
    },
  ];
  it("renders a depressed filter button and opens the flyout on click", () => {
    render(
      <fakeAdapter.Table
        columns={columns}
        items={[{ Status: "Open" }]}
        onSortChange={vi.fn()}
      />,
    );
    const fbtn = screen.getByRole("button", { name: "Filter Status" });
    expect(fbtn).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("flyout-control")).toBeNull();
    fireEvent.click(fbtn);
    expect(screen.getByText("flyout-control")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Status" })).toBeInTheDocument(); // sort label still present
  });
});
