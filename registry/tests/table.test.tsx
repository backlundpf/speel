import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { TableColumn } from "@speel/react";

import { shadcnAdapter } from "@/speel-shadcn/adapter";
import { shadMetrics } from "@/speel-shadcn/table";

const T = shadcnAdapter.Table;
const items = [{ name: "Bartholomew Longname" }];
const text = (r: unknown): string => (r as { name: string }).name;

describe("shadcn Table column options", () => {
  it("renders headerContent in place of the header, never as a sort button", () => {
    render(
      <T
        columns={[
          {
            key: "s",
            header: "Select",
            sortable: true,
            headerContent: (
              <input type="checkbox" aria-label="Select all" readOnly />
            ),
            render: () => "x",
          },
        ]}
        items={items}
        onSortChange={() => undefined}
      />,
    );
    expect(
      screen.getByRole("checkbox", { name: "Select all" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sortable/ })).toBeNull();
  });

  it("lets a wrap column's cells wrap instead of truncating", () => {
    const { container } = render(
      <T
        columns={[
          { key: "n", header: "N", width: 80, wrap: true, render: text },
        ]}
        items={items}
      />,
    );
    const td = container.querySelector("td")!;
    expect(td.className).toContain("whitespace-normal");
    expect(td.className).not.toContain("truncate");
  });

  it("titles a cut-off cell with its text on hover", () => {
    const { container } = render(
      <T
        columns={[
          { key: "n", header: "N", width: 80, render: text, cellTitle: text },
        ]}
        items={items}
      />,
    );
    const td = container.querySelector("td")!;
    Object.defineProperty(td, "scrollWidth", { value: 200 });
    Object.defineProperty(td, "clientWidth", { value: 80 });
    fireEvent.mouseEnter(td);
    expect(td.title).toBe("Bartholomew Longname");
  });
});

describe("shadcn Table layout", () => {
  const cols: TableColumn[] = [
    { key: "a", header: "Title", width: 150, grow: 1, render: () => "x" },
    { key: "b", header: "Modified", width: 120, render: () => "y" },
  ];

  it("lays out with fixed table layout and a col per column", () => {
    const { container } = render(<T columns={cols} items={items} />);
    const table = container.querySelector("table")!;
    expect(table.style.tableLayout).toBe("fixed");
    // padding 16 per column (jsdom has no layout: the default 4px spacing); no bounds →
    // exactly the bases
    expect(
      Array.from(container.querySelectorAll("col")).map((c) => c.style.width),
    ).toEqual(["166px", "136px"]);
    expect(table.style.width).toBe("302px");
  });

  it("keeps spare width empty rather than spreading it over the columns", () => {
    const { container } = render(
      <T
        columns={[{ ...cols[0]!, grow: 0 }, cols[1]!]}
        items={items}
        minWidth={500}
      />,
    );
    // Nothing can grow into the 500px: a fixed-layout table as wide as its bound would
    // widen every column past its resolved width.
    expect(container.querySelector("table")!.style.width).toBe("302px");
    expect(
      Array.from(container.querySelectorAll("col")).map((c) => c.style.width),
    ).toEqual(["166px", "136px"]);
  });

  it("starts a column without a width at its default, else at 100px", () => {
    const { container } = render(
      <T
        columns={[
          { key: "d", header: "D", defaultWidth: 200, render: text },
          { key: "n", header: "N", render: text },
        ]}
        items={items}
      />,
    );
    expect(
      Array.from(container.querySelectorAll("col")).map((c) => c.style.width),
    ).toEqual(["216px", "116px"]);
  });

  it("derives cell padding and header room from the theme's spacing unit", () => {
    const at4 = shadMetrics(4);
    expect(at4.padding).toBe(16);
    expect(at4.room).toEqual({ label: 12, sortArrow: 18, filterButton: 36 });
    const at32 = shadMetrics(3.2);
    expect(at32.padding).toBeCloseTo(12.8, 6);
    expect(at32.room.label).toBeCloseTo(9.6, 6);
    expect(at32.room.sortArrow).toBeCloseTo(14.4, 6);
    expect(at32.room.filterButton).toBeCloseTo(28.8, 6);
  });

  it("lets header labels wrap at spaces", () => {
    const { container } = render(<T columns={cols} items={items} />);
    const th = container.querySelector("th")!;
    expect(th.className).toContain("whitespace-normal");
    expect(th.className).not.toContain("whitespace-nowrap");
  });

  it("sorts from an inline label, by pointer or keyboard", () => {
    const onSortChange = vi.fn();
    render(
      <T
        columns={[{ ...cols[0]!, sortable: true }]}
        items={items}
        onSortChange={onSortChange}
      />,
    );
    const label = screen.getByRole("button", { name: "Title, sortable" });
    expect(label).toHaveAttribute("tabindex", "0");
    fireEvent.click(label);
    fireEvent.keyDown(label, { key: "Enter" });
    fireEvent.keyDown(label, { key: " " });
    expect(onSortChange.mock.calls).toEqual([["a"], ["a"], ["a"]]);
  });

  it("truncates every cell that does not wrap", () => {
    const { container } = render(
      <T columns={[{ key: "n", header: "N", render: text }]} items={items} />,
    );
    expect(container.querySelector("td")!.className).toContain("truncate");
  });

  it("reports no column width until the user drags", () => {
    const onColumnResize = vi.fn();
    render(<T columns={cols} items={items} onColumnResize={onColumnResize} />);
    expect(onColumnResize).not.toHaveBeenCalled();
  });

  it("keeps a drag going while the table lays the column out at each new width", () => {
    const reported: number[] = [];
    // Like SpeelTable: every reported width becomes the column's width, held still.
    function Host(): JSX.Element {
      const [w, setW] = useState<number | undefined>(undefined);
      return (
        <T
          columns={[
            w === undefined ? cols[0]! : { ...cols[0]!, width: w, grow: 0 },
            cols[1]!,
          ]}
          items={items}
          onColumnResize={(key, width) => {
            if (key !== "a") return;
            reported.push(width);
            setW(Math.round(width));
          }}
        />
      );
    }
    render(<Host />);
    const grip = screen.getByRole("separator", { name: "Resize a" });
    fireEvent.pointerDown(grip, { clientX: 0 });
    fireEvent.pointerMove(window, { clientX: 10 });
    fireEvent.pointerMove(window, { clientX: 30 });
    fireEvent.pointerUp(window);
    expect(reported).toEqual([160, 180]);
  });

  it("restarts a drag from where the layout last put the column", () => {
    const onColumnResize = vi.fn();
    const { rerender } = render(
      <T columns={cols} items={items} onColumnResize={onColumnResize} />,
    );
    rerender(
      <T
        columns={[{ ...cols[0]!, width: 200 }, cols[1]!]}
        items={items}
        onColumnResize={onColumnResize}
      />,
    );
    expect(onColumnResize).not.toHaveBeenCalled();
    fireEvent.pointerDown(screen.getByRole("separator", { name: "Resize a" }), {
      clientX: 0,
    });
    fireEvent.pointerMove(window, { clientX: 10 });
    fireEvent.pointerUp(window);
    expect(onColumnResize).toHaveBeenLastCalledWith("a", 210);
  });
});

describe("shadcn Table resizing", () => {
  const cols: TableColumn[] = [
    { key: "a", header: "Title", width: 150, grow: 1, render: () => "x" },
    { key: "b", header: "Modified", width: 120, render: () => "y" },
  ];
  /** Like SpeelTable: every reported width becomes the column's width, held still. */
  function Sticky({
    first,
    reported,
  }: {
    first: TableColumn;
    reported: number[];
  }): JSX.Element {
    const [w, setW] = useState<number | undefined>(undefined);
    return (
      <T
        columns={[
          w === undefined ? first : { ...first, width: w, grow: 0, shrink: 0 },
          cols[1]!,
        ]}
        items={items}
        onColumnResize={(key, width) => {
          if (key !== "a") return;
          reported.push(width);
          setW(Math.round(width));
        }}
      />
    );
  }
  const grip = (): HTMLElement =>
    screen.getByRole("separator", { name: "Resize a" });

  it("stops a drag at the column's minWidth and keeps the drag going", () => {
    const reported: number[] = [];
    render(
      <Sticky first={{ ...cols[0]!, minWidth: 100 }} reported={reported} />,
    );
    fireEvent.pointerDown(grip(), { clientX: 0 });
    fireEvent.pointerMove(window, { clientX: -80 });
    fireEvent.pointerMove(window, { clientX: -40 });
    fireEvent.pointerUp(window);
    expect(reported).toEqual([100, 110]);
  });

  it("stops a drag at the column's maxWidth and keeps the drag going", () => {
    const reported: number[] = [];
    render(
      <Sticky first={{ ...cols[0]!, maxWidth: 170 }} reported={reported} />,
    );
    fireEvent.pointerDown(grip(), { clientX: 0 });
    fireEvent.pointerMove(window, { clientX: 40 });
    fireEvent.pointerMove(window, { clientX: 5 });
    fireEvent.pointerUp(window);
    expect(reported).toEqual([170, 155]);
  });

  it("stops the arrow keys at the column's minWidth, focus still on the grip", () => {
    const reported: number[] = [];
    render(
      <Sticky first={{ ...cols[0]!, minWidth: 100 }} reported={reported} />,
    );
    grip().focus();
    for (let i = 0; i < 5; i++)
      fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
    expect(reported).toEqual([134, 118, 102, 100]);
    expect(document.activeElement).toBe(grip());
  });

  it("resizes from the keyboard, focus surviving the table's echo", () => {
    const reported: number[] = [];
    render(<Sticky first={cols[0]!} reported={reported} />);
    const handle = grip();
    handle.focus();
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(reported).toEqual([166, 150]);
    expect(document.activeElement).toBe(handle);
  });

  it("restarts the grip when the layout moves the column back to where it started", () => {
    const onColumnResize = vi.fn();
    const at = (width: number): JSX.Element => (
      <T
        columns={[{ ...cols[0]!, width }, cols[1]!]}
        items={items}
        onColumnResize={onColumnResize}
      />
    );
    const drag = (dx: number): void => {
      fireEvent.pointerDown(grip(), { clientX: 0 });
      fireEvent.pointerMove(window, { clientX: dx });
      fireEvent.pointerUp(window);
    };
    const { rerender } = render(at(200));
    drag(10);
    expect(onColumnResize).toHaveBeenLastCalledWith("a", 210);
    rerender(at(210)); // the host applies the drag
    rerender(at(200)); // then the layout puts the column back at the grip's start
    drag(10);
    expect(onColumnResize).toHaveBeenLastCalledWith("a", 210);
  });
});

describe("shadcn Table theme", () => {
  it("reads the theme again once a table that mounted hidden is laid out", () => {
    const observers: Array<() => void> = [];
    const savedRO = window.ResizeObserver;
    window.ResizeObserver = class {
      constructor(cb: () => void) {
        observers.push(cb);
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    } as unknown as typeof ResizeObserver;
    let shown = false;
    const clientWidth = vi
      .spyOn(Element.prototype, "clientWidth", "get")
      .mockImplementation(() => (shown ? 800 : 0));
    const rect = vi
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: Element) {
        // The probe is ten spacing units wide: 32px at the sample's 0.2rem density.
        const width = shown && this.classList.contains("w-10") ? 32 : 0;
        return {
          width,
          height: 0,
          x: 0,
          y: 0,
          top: 0,
          left: 0,
          right: width,
          bottom: 0,
          toJSON: () => ({}),
        } as DOMRect;
      });
    try {
      const { container } = render(
        <T
          columns={[{ key: "a", header: "A", width: 150, render: text }]}
          items={items}
        />,
      );
      const col = (): string => container.querySelector("col")!.style.width;
      expect(col()).toBe("166px"); // hidden: nothing to read, the 4px default
      shown = true;
      act(() => observers.forEach((cb) => cb()));
      expect(col()).toBe("163px"); // 3.2px units: padding round(12.8) = 13
    } finally {
      clientWidth.mockRestore();
      rect.mockRestore();
      window.ResizeObserver = savedRO;
    }
  });
});
