import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { V8Table } from "../src/fluent-v8/primitives.js";
import type { TableColumn } from "../src/adapter/SpeelUIAdapter.js";

const items = [{ c: "Bartholomew Longname" }];
const column = (extra: Partial<TableColumn>): TableColumn => ({
  key: "c",
  header: "Name",
  width: 80,
  render: (row: unknown) => <b>{(row as { c: string }).c}</b>,
  ...extra,
});
const cellContent = (container: HTMLElement): HTMLElement =>
  container.querySelector<HTMLElement>('[data-automationid="DetailsRowCell"]')!
    .firstElementChild as HTMLElement;
/** jsdom has no layout: report the sizes a browser would for a cut-off or fitting cell. */
function sized(
  el: HTMLElement,
  scrollWidth: number,
  clientWidth: number,
): void {
  Object.defineProperty(el, "scrollWidth", {
    value: scrollWidth,
    configurable: true,
  });
  Object.defineProperty(el, "clientWidth", {
    value: clientWidth,
    configurable: true,
  });
}

describe("V8Table body cells", () => {
  it("titles a cut-off cell with its text on hover", () => {
    const { container } = render(
      <V8Table
        columns={[column({ cellTitle: (r) => (r as { c: string }).c })]}
        items={items}
        containerWidth={300}
      />,
    );
    const el = cellContent(container);
    sized(el, 200, 80);
    fireEvent.mouseEnter(el);
    expect(el.title).toBe("Bartholomew Longname");
  });

  it("gives a cell that fits no title", () => {
    const { container } = render(
      <V8Table
        columns={[column({ cellTitle: (r) => (r as { c: string }).c })]}
        items={items}
        containerWidth={300}
      />,
    );
    const el = cellContent(container);
    sized(el, 80, 80);
    fireEvent.mouseEnter(el);
    expect(el.hasAttribute("title")).toBe(false);
  });

  it("keeps an un-titled, unwrapped column's content as rendered", () => {
    const { container } = render(
      <V8Table columns={[column({})]} items={items} containerWidth={300} />,
    );
    expect(cellContent(container).tagName).toBe("B");
  });

  it("wraps a wrap column at spaces and ends an over-long word in an ellipsis", () => {
    const { container } = render(
      <V8Table
        columns={[column({ wrap: true })]}
        items={items}
        containerWidth={300}
      />,
    );
    const el = cellContent(container);
    expect(el.tagName).toBe("DIV");
    expect(el.style.whiteSpace).toBe("normal");
    expect(el.style.overflowWrap).toBe("normal");
    expect(el.style.wordBreak).toBe("normal");
    expect(el.style.textOverflow).toBe("ellipsis");
  });

  it("keeps a titled single-line column on one line", () => {
    const { container } = render(
      <V8Table
        columns={[column({ cellTitle: () => "x" })]}
        items={items}
        containerWidth={300}
      />,
    );
    expect(cellContent(container).style.whiteSpace).toBe("nowrap");
  });
});
