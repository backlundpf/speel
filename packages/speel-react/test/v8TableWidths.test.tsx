import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { V8Table } from "../src/fluent-v8/primitives.js";
import type { TableColumn } from "../src/adapter/SpeelUIAdapter.js";

/**
 * jsdom has no layout, so the container width the skin would measure is injected instead —
 * everything downstream of that number is the real Fluent layout pass.
 */
const cols = (widths: (number | undefined)[]): TableColumn[] =>
  widths.map((w, i) => ({
    key: `c${i}`,
    header: `C${i}`,
    render: (row: unknown) => String((row as Record<string, string>)[`c${i}`]),
    ...(w !== undefined ? { width: w } : {}),
  }));

const items = [{ c0: "a", c1: "b" }];

/** What each header cell actually renders at: the laid-out width plus Fluent's cell padding. */
const headerWidths = (container: HTMLElement): number[] =>
  Array.from(
    container.querySelectorAll<HTMLElement>(
      '[data-automationid="ColumnsHeaderColumn"]',
    ),
  ).map((el) => parseFloat(el.style.width));

describe("V8Table column widths", () => {
  /** A last column that overflows the container, so nothing stretches into slack. */
  const filler: TableColumn = {
    key: "filler",
    header: "F",
    render: () => "",
    width: 300,
  };

  it("holds a column with no width at its default hint", () => {
    const { container } = render(
      <V8Table
        columns={[{ ...cols([undefined])[0]!, defaultWidth: 70 }, filler]}
        items={items}
        containerWidth={100}
      />,
    );
    expect(headerWidths(container)).toEqual([90, 320]);
  });

  it("raises a defaulted column to its header floor, and leaves an authored one alone", () => {
    const long: TableColumn = {
      key: "c0",
      header: "Separation Date Confirmed",
      render: () => "",
      defaultWidth: 70,
      sortable: true,
      headerFilter: { active: false, content: null },
    };
    const { container } = render(
      <V8Table
        columns={[long, { ...long, key: "authored", width: 60 }, filler]}
        items={items}
        onSortChange={() => undefined}
        containerWidth={100}
      />,
    );
    // jsdom has no canvas: "Separation" estimates at 10 × 0.6 × 14px = 84, plus 8 + 16 + 28.
    const floor = Math.ceil(84 + 8 + 16 + 28);
    const widths = headerWidths(container);
    expect(widths[0]).toBe(floor + 20);
    expect(widths[1]).toBe(60 + 20);
  });

  it("renders every column at its held width when they overflow the container", () => {
    const { container } = render(
      <V8Table columns={cols([200, 300])} items={items} containerWidth={300} />,
    );
    // 20px of cell padding rides on top of each laid-out width.
    expect(headerWidths(container)).toEqual([220, 320]);
  });

  it("does not stretch the last column into spare width", () => {
    const { container } = render(
      <V8Table
        columns={cols([200, 300])}
        items={items}
        containerWidth={1000}
      />,
    );
    expect(headerWidths(container)).toEqual([220, 320]);
  });

  it("fills a minWidth of 100% through the columns that grow", () => {
    const columns = cols([200, 300]).map((c, i) => ({
      ...c,
      grow: i === 0 ? 1 : 0,
    }));
    const { container } = render(
      <V8Table
        columns={columns}
        items={items}
        containerWidth={1000}
        minWidth="100%"
      />,
    );
    // 1000 − 40 padding − 500 bases = 460 spare, all to the first column.
    expect(headerWidths(container)).toEqual([680, 320]);
  });

  it("squeezes shrinking columns to meet a maxWidth", () => {
    const columns = cols([200, 300]).map((c) => ({ ...c, shrink: 1 }));
    const { container } = render(
      <V8Table
        columns={columns}
        items={items}
        containerWidth={1000}
        maxWidth={440}
      />,
    );
    // 440 − 40 padding = 400 content: a 100px shortfall split 2:3 by shrink × basis.
    expect(headerWidths(container)).toEqual([180, 260]);
  });

  it("gives a column with no width of its own the default floor", () => {
    const { container } = render(
      <V8Table
        columns={cols([undefined, 300])}
        items={items}
        containerWidth={100}
      />,
    );
    expect(headerWidths(container)).toEqual([120, 320]);
  });

  it("scrolls the header and rows together rather than squashing them", () => {
    const { container } = render(
      <V8Table columns={cols([200, 300])} items={items} containerWidth={300} />,
    );
    // Fluent's own root is the horizontal scroller (ConstrainMode.horizontalConstrained),
    // so header and rows scroll as one and nothing outside the table moves sideways.
    expect(
      container.querySelector(".ms-DetailsList.is-horizontalConstrained"),
    ).toBeTruthy();
  });

  it("keeps reporting drag resizes", () => {
    const onColumnResize = vi.fn();
    const { container } = render(
      <V8Table
        columns={cols([200, 300])}
        items={items}
        containerWidth={300}
        onColumnResize={onColumnResize}
      />,
    );
    const sizer = container.querySelector<HTMLElement>(
      '[data-sizer-index="0"]',
    );
    expect(sizer).toBeTruthy();
    // Enter starts the resize, arrow keys move it — the same handler a mouse drag drives.
    fireEvent.keyDown(sizer!, { keyCode: 13, which: 13 });
    fireEvent.keyDown(sizer!, { keyCode: 39, which: 39 });
    expect(onColumnResize).toHaveBeenCalledWith("c0", 210);
  });
});
