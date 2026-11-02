import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { DbContext, ModelBuilder } from "@speel/core";
import type { IDetailsListProps, IDetailsRowProps } from "@fluentui/react";
import type { TableProps } from "../src/adapter/SpeelUIAdapter.js";

/**
 * `cellNavigation: "tab"` (#82): Tab walks the editors in cells. jsdom does not run
 * FocusZone's tabindex management, so these pin the props handed to DetailsList; the
 * keyboard behaviour itself is checked live.
 */

const seen: { props?: IDetailsListProps | undefined } = {};
vi.mock("@fluentui/react", async (orig) => {
  const actual = await orig<typeof import("@fluentui/react")>();
  const Real = actual.DetailsList;
  return {
    ...actual,
    DetailsList: (p: IDetailsListProps) => {
      seen.props = p;
      return <Real {...p} />;
    },
  };
});

const { V8Table } = await import("../src/fluent-v8/primitives.js");
const { FocusZoneDirection, FocusZoneTabbableElements } = await import(
  "@fluentui/react"
);

const rows = [{ id: 1 }, { id: 2 }];
const columns = [
  { key: "a", header: "A", render: () => <input aria-label="a" /> },
];

/** The row FocusZone props a row would be rendered with. */
function rowZone(): IDetailsRowProps["focusZoneProps"] {
  const onRenderRow = seen.props!.onRenderRow;
  if (!onRenderRow) return undefined;
  let rendered: IDetailsRowProps | undefined;
  onRenderRow(
    { item: rows[0], itemIndex: 0, focusZoneProps: { direction: 1 } } as never,
    (rp) => {
      rendered = rp;
      return null;
    },
  );
  return rendered?.focusZoneProps;
}

beforeEach(() => {
  seen.props = undefined;
});

describe("V8Table cellNavigation", () => {
  it("tab: list and row zones handle Tab across all tabbables", () => {
    render(
      <V8Table columns={columns} items={rows} cellNavigation="tab" containerWidth={400} />,
    );
    expect(seen.props!.focusZoneProps?.handleTabKey).toBe(
      FocusZoneTabbableElements.all,
    );
    // Passing focusZoneProps replaces DetailsList's vertical default; keep it.
    expect(seen.props!.focusZoneProps?.direction).toBe(
      FocusZoneDirection.vertical,
    );
    const zone = rowZone();
    expect(zone?.handleTabKey).toBe(FocusZoneTabbableElements.all);
    // The row keeps the direction DetailsList gave it.
    expect(zone?.direction).toBe(1);
  });

  it("tab: virtualization is off by default", () => {
    render(
      <V8Table columns={columns} items={rows} cellNavigation="tab" containerWidth={400} />,
    );
    expect(seen.props!.onShouldVirtualize?.({})).toBe(false);
  });

  it("tab with virtualize: true keeps virtualization", () => {
    render(
      <V8Table
        columns={columns}
        items={rows}
        cellNavigation="tab"
        virtualize
        containerWidth={400}
      />,
    );
    expect(seen.props!.onShouldVirtualize).toBeUndefined();
  });

  it("without cellNavigation nothing changes", () => {
    render(<V8Table columns={columns} items={rows} containerWidth={400} />);
    expect(seen.props!.focusZoneProps).toBeUndefined();
    expect(seen.props!.onShouldVirtualize).toBeUndefined();
    expect(rowZone()).toBeUndefined();
  });
});

describe("SpeelTable forwards cellNavigation", () => {
  it("passes it to the skin's Table", async () => {
    const { SpeelProvider } = await import("../src/SpeelProvider.js");
    const { SpeelTable } = await import("../src/table/SpeelTable.js");
    const { fakeAdapter } = await import("./fakeAdapter.js");
    const { makeFakeProvider } = await import("./fakeProvider.js");
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
    const ui = {
      ...fakeAdapter,
      Table: (p: TableProps) => {
        got = p.cellNavigation;
        const Fake = fakeAdapter.Table;
        return <Fake {...p} />;
      },
    };
    render(
      <SpeelProvider
        db={new Ctx({ provider: makeFakeProvider({ Things: [] }) } as never) as never}
        ui={ui}
      >
        <SpeelTable of={Thing} items={[]} cellNavigation="tab" />
      </SpeelProvider>,
    );
    expect(got).toBe("tab");
  });
});
