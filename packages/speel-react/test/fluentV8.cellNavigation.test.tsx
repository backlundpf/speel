import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DbContext, ModelBuilder } from "@speel/core";
import { V8Table } from "../src/fluent-v8/primitives.js";
import { SpeelProvider } from "../src/SpeelProvider.js";
import { SpeelTable } from "../src/table/SpeelTable.js";
import type {
  SpeelUIAdapter,
  TableProps,
} from "../src/adapter/SpeelUIAdapter.js";
import { fakeAdapter } from "./fakeAdapter.js";
import { makeFakeProvider } from "./fakeProvider.js";

/**
 * `cellNavigation: "tab"` (#82): Tab and Shift+Tab move between the editors in cells, in
 * reading order, across rows. Fluent's FocusZones can't do this — Tab at a row's end
 * lands on the next row's container, not its first editor (seen live) — so the table
 * moves focus itself, which jsdom runs for real.
 */

const rows = [{ id: 1 }, { id: 2 }];
const columns: TableProps["columns"] = [
  {
    key: "a",
    header: "A",
    render: (r) => <input aria-label={`A${(r as { id: number }).id}`} />,
  },
  {
    key: "b",
    header: "B",
    render: (r) => (
      <button type="button">{`B${(r as { id: number }).id}`}</button>
    ),
  },
];

function renderTable(extra: Partial<TableProps> = {}) {
  render(
    <>
      <V8Table
        columns={columns}
        items={rows}
        getRowKey={(r) => String((r as { id: number }).id)}
        containerWidth={400}
        {...extra}
      />
      <button type="button">After</button>
    </>,
  );
}

/** Press Tab on the focused element; return whether the table took the key. */
const tab = (shift = false): boolean =>
  !fireEvent.keyDown(document.activeElement!, { key: "Tab", shiftKey: shift });

describe("V8Table cellNavigation='tab'", () => {
  it("Tab moves to the next editor, across the row and on to the next row", () => {
    renderTable({ cellNavigation: "tab" });
    screen.getByRole("textbox", { name: "A1" }).focus();
    expect(tab()).toBe(true);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "B1" }),
    );
    expect(tab()).toBe(true);
    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: "A2" }),
    );
  });

  it("Shift+Tab moves back, onto the previous row's last editor", () => {
    renderTable({ cellNavigation: "tab" });
    screen.getByRole("textbox", { name: "A2" }).focus();
    expect(tab(true)).toBe(true);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "B1" }),
    );
  });

  it("Tab from the last editor is left to the browser, so it leaves the table", () => {
    renderTable({ cellNavigation: "tab" });
    screen.getByRole("button", { name: "B2" }).focus();
    expect(tab()).toBe(false);
  });

  it("Shift+Tab from the first editor is left to the browser", () => {
    renderTable({ cellNavigation: "tab" });
    screen.getByRole("textbox", { name: "A1" }).focus();
    expect(tab(true)).toBe(false);
  });

  it("skips disabled editors", () => {
    render(
      <V8Table
        columns={[
          {
            key: "a",
            header: "A",
            render: (r) => (
              <input
                aria-label={`A${(r as { id: number }).id}`}
                disabled={(r as { id: number }).id === 2}
              />
            ),
          },
        ]}
        items={[{ id: 1 }, { id: 2 }, { id: 3 }]}
        getRowKey={(r) => String((r as { id: number }).id)}
        containerWidth={400}
        cellNavigation="tab"
      />,
    );
    screen.getByRole("textbox", { name: "A1" }).focus();
    tab();
    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: "A3" }),
    );
  });

  it("without cellNavigation the table leaves Tab alone", () => {
    renderTable();
    screen.getByRole("textbox", { name: "A1" }).focus();
    expect(tab()).toBe(false);
    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: "A1" }),
    );
  });

  it("tab: every row is drawn (virtualization off by default)", () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ id: i + 1 }));
    render(
      <V8Table
        columns={columns}
        items={many}
        getRowKey={(r) => String((r as { id: number }).id)}
        containerWidth={400}
        cellNavigation="tab"
      />,
    );
    expect(screen.getByRole("textbox", { name: "A60" })).toBeInTheDocument();
  });
});

describe("SpeelTable forwards cellNavigation", () => {
  it("passes it to the skin's Table", () => {
    class Thing {
      Id?: number;
    }
    class Ctx extends DbContext {
      protected override onModelCreating(mb: ModelBuilder): void {
        mb.entity(Thing, (b) => {
          b.toList("Things");
          b.property((e) => e.Id).isNumber();
        });
      }
    }
    let got: unknown;
    const ui: SpeelUIAdapter = {
      ...fakeAdapter,
      Table: (p: TableProps) => {
        got = p.cellNavigation;
        const Fake = fakeAdapter.Table;
        return <Fake {...p} />;
      },
    };
    render(
      <SpeelProvider
        db={
          new Ctx({
            provider: makeFakeProvider({ Things: [] }),
          } as never) as never
        }
        ui={ui}
      >
        <SpeelTable of={Thing} items={[]} cellNavigation="tab" />
      </SpeelProvider>,
    );
    expect(got).toBe("tab");
  });
});
