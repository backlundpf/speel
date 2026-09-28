import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
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

  it("wraps the label instead of clipping it to one line", () => {
    const { container } = render(
      <V8Table
        columns={[column({ sortable: true })]}
        items={items}
        onSortChange={() => undefined}
        containerWidth={300}
      />,
    );
    const el = label(container);
    expect(el.style.whiteSpace).not.toBe("nowrap");
    expect(el.style.textOverflow).not.toBe("ellipsis");
    // A single word wider than the column breaks rather than clips — but only such a word:
    // `anywhere` would let the label shrink to a character a line beside the filter button.
    expect(el.style.overflowWrap).toBe("break-word");
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
