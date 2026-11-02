import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { DbContext, ModelBuilder } from "@speel/core";
import { SpeelProvider } from "../src/SpeelProvider.js";
import { SpeelTable } from "../src/table/SpeelTable.js";
import type {
  SpeelUIAdapter,
  TableProps,
} from "../src/adapter/SpeelUIAdapter.js";
import { fakeAdapter } from "./fakeAdapter.js";
import { makeFakeProvider } from "./fakeProvider.js";

/** Row actions can vary by row and carry per-row names (#79). */

class Item {
  Id?: number;
  Title?: string;
  CanDelete?: boolean;
}
class ICtx extends DbContext {
  protected override onModelCreating(mb: ModelBuilder): void {
    mb.entity(Item, (b) => {
      b.toList("Items");
      b.property((e) => e.Id).isNumber();
      b.property((e) => e.Title)
        .isText()
        .hasDisplayName("Title");
      b.property((e) => e.CanDelete).isBoolean();
    });
  }
}

const items = [
  Object.assign(new Item(), { Id: 7, Title: "Seven", CanDelete: true }),
  Object.assign(new Item(), { Id: 8, Title: "Eight", CanDelete: false }),
];

let tableProps: TableProps | undefined;
const capturing: SpeelUIAdapter = {
  ...fakeAdapter,
  Table: (p) => {
    tableProps = p;
    const Fake = fakeAdapter.Table;
    return <Fake {...p} />;
  },
};

function wrap(node: JSX.Element) {
  const ctx = new ICtx({ provider: makeFakeProvider({ Items: [] }) } as never);
  return render(
    <SpeelProvider db={ctx as never} ui={capturing}>
      {node}
    </SpeelProvider>,
  );
}

const row = (title: string): HTMLElement =>
  screen.getByText(title).closest("tr") as HTMLElement;

describe("SpeelTable rowActions per row", () => {
  it("available hides an action on rows where it returns false", () => {
    wrap(
      <SpeelTable
        of={Item}
        items={items}
        columns={[{ key: "Title" }]}
        rowActions={{
          onEdit: vi.fn(),
          onDelete: vi.fn(),
          available: (a, r) => a !== "delete" || !!r.CanDelete,
        }}
      />,
    );
    expect(
      within(row("Seven")).getByRole("button", { name: "Delete" }),
    ).toBeInTheDocument();
    expect(
      within(row("Eight")).queryByRole("button", { name: "Delete" }),
    ).toBeNull();
    expect(
      within(row("Eight")).getByRole("button", { name: "Edit" }),
    ).toBeInTheDocument();
  });

  it("custom actions are keyed by RowAction.key", () => {
    const onClick = vi.fn();
    wrap(
      <SpeelTable
        of={Item}
        items={items}
        columns={[{ key: "Title" }]}
        rowActions={{
          custom: [
            { key: "archive", iconName: "Archive", title: "Archive", onClick },
          ],
          available: (a, r) => a !== "archive" || r.Id === 8,
        }}
      />,
    );
    expect(
      within(row("Seven")).queryByRole("button", { name: "Archive" }),
    ).toBeNull();
    fireEvent.click(
      within(row("Eight")).getByRole("button", { name: "Archive" }),
    );
    expect(onClick).toHaveBeenCalledWith(items[1]);
  });

  it("ariaLabel names each row's button", () => {
    wrap(
      <SpeelTable
        of={Item}
        items={items}
        columns={[{ key: "Title" }]}
        rowActions={{
          onEdit: vi.fn(),
          custom: [
            {
              key: "archive",
              iconName: "Archive",
              title: "Archive",
              onClick: vi.fn(),
            },
          ],
          ariaLabel: (a, r) => `${a} item ${r.Id}`,
        }}
      />,
    );
    expect(screen.getByRole("button", { name: "edit item 7" })).toHaveAttribute(
      "title",
      "Edit",
    );
    expect(
      screen.getByRole("button", { name: "archive item 8" }),
    ).toBeInTheDocument();
  });

  it("all actions hidden on a row keeps column width", () => {
    wrap(
      <SpeelTable
        of={Item}
        items={items}
        columns={[{ key: "Title" }]}
        rowActions={{
          onView: vi.fn(),
          onEdit: vi.fn(),
          onDelete: vi.fn(),
          available: (_a, r) => r.Id === 7,
        }}
      />,
    );
    const actions = tableProps!.columns.find((c) => c.key === "__actions")!;
    expect(actions.defaultWidth).toBe(3 * 32 + 2 * 4);
    expect(within(row("Eight")).queryAllByRole("button")).toHaveLength(0);
    // Each action owns a fixed slot, so a hidden one leaves a gap, not a shift.
    const slots = (title: string) =>
      row(title).querySelectorAll("[data-row-action-slot]");
    expect(slots("Seven")).toHaveLength(3);
    expect(slots("Eight")).toHaveLength(3);
  });

  describe("export", () => {
    let captured = "";
    const RealBlob = globalThis.Blob;
    beforeEach(() => {
      globalThis.Blob = class {
        constructor(parts: BlobPart[]) {
          captured = parts.map(String).join("");
        }
      } as unknown as typeof Blob;
      URL.createObjectURL = vi.fn(() => "blob:x");
      URL.revokeObjectURL = vi.fn();
    });
    afterEach(() => {
      globalThis.Blob = RealBlob;
    });

    it("actions column is still excluded from export", () => {
      wrap(
        <SpeelTable
          of={Item}
          items={items}
          exportCsv
          columns={[{ key: "Title" }]}
          rowActions={{ onEdit: vi.fn(), available: () => true }}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
      expect(captured.replace("﻿", "").split("\r\n")[0]).toBe("Title");
    });
  });
});
