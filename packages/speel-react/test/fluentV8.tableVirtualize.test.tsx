import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DbContext, ModelBuilder } from "@speel/core";
import { V8Dialog, V8Panel, V8Table } from "../src/fluent-v8/primitives.js";
import { SpeelProvider } from "../src/SpeelProvider.js";
import { SpeelTable } from "../src/table/SpeelTable.js";
import type {
  SpeelUIAdapter,
  TableProps,
} from "../src/adapter/SpeelUIAdapter.js";
import { fakeAdapter } from "./fakeAdapter.js";
import { makeFakeProvider } from "./fakeProvider.js";

/**
 * A table inside a surface (#81): the surfaces' scrolling bodies are Fluent scroll
 * parents, and `virtualize: false` renders every row.
 */

const noop = (): void => {};
const rows = Array.from({ length: 60 }, (_, i) => ({
  id: i + 1,
  name: `Row ${i + 1}`,
}));
const columns: TableProps["columns"] = [
  { key: "name", header: "Name", render: (r) => (r as { name: string }).name },
];

describe("surfaces are scroll parents", () => {
  it("modal body is a scroll parent", () => {
    render(
      <V8Dialog open onOpenChange={noop} title="T">
        <span data-testid="content">x</span>
      </V8Dialog>,
    );
    const body = screen.getByTestId("content").parentElement!;
    expect(body).toHaveAttribute("data-is-scrollable", "true");
  });

  it("panel content is a scroll parent", () => {
    render(
      <V8Panel open onOpenChange={noop} title="T">
        <span data-testid="content">x</span>
      </V8Panel>,
    );
    expect(
      screen.getByTestId("content").closest('[data-is-scrollable="true"]'),
    ).not.toBeNull();
  });
});

describe("TableProps.virtualize", () => {
  it("virtualize false renders every row", () => {
    render(
      <V8Table
        columns={columns}
        items={rows}
        getRowKey={(r) => String((r as { id: number }).id)}
        virtualize={false}
        containerWidth={600}
      />,
    );
    expect(screen.getByText("Row 60")).toBeInTheDocument();
  });

  it("SpeelTable forwards virtualize", () => {
    class Thing {
      Id?: number;
      Title?: string;
    }
    class Ctx extends DbContext {
      protected override onModelCreating(mb: ModelBuilder): void {
        mb.entity(Thing, (b) => {
          b.toList("Things");
          b.property((e) => e.Id).isNumber();
          b.property((e) => e.Title).isText();
        });
      }
    }
    let seen: TableProps | undefined;
    const ui: SpeelUIAdapter = {
      ...fakeAdapter,
      Table: (p) => {
        seen = p;
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
        <SpeelTable of={Thing} items={[]} virtualize={false} />
      </SpeelProvider>,
    );
    expect(seen?.virtualize).toBe(false);
  });
});
