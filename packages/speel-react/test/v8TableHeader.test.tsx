import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { V8Table } from "../src/fluent-v8/primitives.js";
import type { TableColumn } from "../src/adapter/SpeelUIAdapter.js";

const column = (extra: Partial<TableColumn>): TableColumn => ({
  key: "c",
  header: "Response Due Date",
  render: (row: unknown) => String((row as { c: string }).c),
  ...extra,
});

const items = [{ c: "a" }];

/** The element carrying the header's text, whichever branch of the cell rendered it. */
const label = (container: HTMLElement): HTMLElement => {
  const el = container.querySelector<HTMLElement>(
    '[title="Response Due Date"]',
  );
  if (!el) throw new Error("header label has no title");
  return el;
};

describe("V8Table header labels", () => {
  it("carries the full label as a title on a sortable header", () => {
    const { container } = render(
      <V8Table
        columns={[column({ sortable: true })]}
        items={items}
        onSortChange={() => undefined}
        containerWidth={300}
      />,
    );
    expect(label(container).textContent).toBe("Response Due Date");
  });

  it("carries the full label as a title on a plain header", () => {
    const { container } = render(
      <V8Table columns={[column({})]} items={items} containerWidth={300} />,
    );
    expect(label(container).textContent).toBe("Response Due Date");
  });

  it("breaks the label only at spaces and ends an over-long word in an ellipsis", () => {
    const { container } = render(
      <V8Table
        columns={[column({ sortable: true })]}
        items={items}
        onSortChange={() => undefined}
        containerWidth={300}
      />,
    );
    const box = container.querySelector<HTMLElement>("[data-header-label]");
    if (!box) throw new Error("no label box");
    expect(box.contains(label(container))).toBe(true);
    expect(box.style.whiteSpace).toBe("normal");
    expect(box.style.overflowWrap).toBe("normal");
    expect(box.style.wordBreak).toBe("normal");
    expect(box.style.overflow).toBe("hidden");
    expect(box.style.textOverflow).toBe("ellipsis");
  });

  it("sets the filter button beside the label rather than floating it", () => {
    const { container } = render(
      <V8Table
        columns={[column({ headerFilter: { active: false, content: null } })]}
        items={items}
        containerWidth={300}
      />,
    );
    const box = container.querySelector<HTMLElement>("[data-header-label]")!;
    expect((box.parentElement as HTMLElement).style.display).toBe("flex");
    expect(container.querySelector('[style*="float"]')).toBeNull();
  });

  it("renders headerContent in place of the label, never as a sort button", () => {
    const { container } = render(
      <V8Table
        columns={[
          column({
            sortable: true,
            headerContent: (
              <input type="checkbox" readOnly aria-label="Select all" />
            ),
          }),
        ]}
        items={items}
        onSortChange={() => undefined}
        containerWidth={300}
      />,
    );
    expect(
      screen.getByRole("checkbox", { name: "Select all" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sortable/ })).toBeNull();
    expect(container.querySelector('[title="Response Due Date"]')).toBeNull();
  });

  it("names a headerContent column by its header, not by the control inside it", () => {
    render(
      <V8Table
        columns={[
          column({
            headerContent: (
              <input type="checkbox" readOnly aria-label="Select all" />
            ),
          }),
        ]}
        items={items}
        containerWidth={300}
      />,
    );
    const header = screen.getByRole("columnheader");
    expect(header).toHaveAttribute("aria-label", "Response Due Date");
    expect(header).not.toHaveAttribute("aria-labelledby");
    expect(
      screen.getByRole("columnheader", { name: "Response Due Date" }),
    ).toBe(header);
  });

  it("leaves a plain header named by its label", () => {
    render(
      <V8Table columns={[column({})]} items={items} containerWidth={300} />,
    );
    const header = screen.getByRole("columnheader");
    expect(header).not.toHaveAttribute("aria-label");
    expect(
      screen.getByRole("columnheader", { name: "Response Due Date" }),
    ).toBe(header);
  });

  it("lets the header row grow past Fluent's fixed height", () => {
    const { container } = render(
      <V8Table columns={[column({})]} items={items} containerWidth={300} />,
    );
    const root = container.querySelector<HTMLElement>(".ms-DetailsHeader");
    const cell = container.querySelector<HTMLElement>(
      '[data-automationid="ColumnsHeaderColumn"]',
    );
    if (!root || !cell) throw new Error("DetailsHeader did not render");
    expect(getComputedStyle(root).height).toBe("auto");
    expect(getComputedStyle(cell).height).toBe("auto");
    // Fluent's tooltip wrapper is absolutely positioned, which takes the label out of the
    // cell's flow; a cell then never grows past its minimum, whatever `height` says.
    const wrapper = cell.firstElementChild as HTMLElement;
    expect(getComputedStyle(wrapper).position).not.toBe("absolute");
  });
});
