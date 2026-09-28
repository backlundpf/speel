import { describe, it, expect, vi } from "vitest";
import { useContext, useLayoutEffect, useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { DbContext, ModelBuilder } from "@speel/core";
import { SpeelProvider } from "../src/SpeelProvider.js";
import { SpeelTable } from "../src/table/SpeelTable.js";
import { ColumnChooserContext } from "../src/table/chooserContext.js";
import { ColumnChooserPanel } from "../src/table/ColumnChooser.js";
import { fakeAdapter } from "./fakeAdapter.js";
import { makeFakeProvider } from "./fakeProvider.js";

class Task {
  Id?: number;
  Title?: string;
  Status?: string;
}
class TCtx extends DbContext {
  protected override onModelCreating(mb: ModelBuilder): void {
    mb.entity(Task, (b) => {
      b.toList("Tasks");
      b.property((e) => e.Id).isNumber();
      b.property((e) => e.Title)
        .isText()
        .hasDisplayName("Title");
      b.property((e) => e.Status)
        .isChoice()
        .hasOptions(["Open", "Closed"])
        .hasDisplayName("Status");
    });
  }
}
function wrap(node: JSX.Element) {
  const ctx = new TCtx({ provider: makeFakeProvider({ Tasks: [] }) } as never);
  return render(
    <SpeelProvider db={ctx as never} ui={fakeAdapter}>
      {node}
    </SpeelProvider>,
  );
}
const rows = [Object.assign(new Task(), { Id: 1, Title: "A", Status: "Open" })];
const headers = (): string[] =>
  screen
    .getAllByRole("columnheader")
    .map((h) => h.textContent?.replace(/[▲▼▽]/g, "").trim() ?? "");
const openChooser = (): void => {
  fireEvent.click(screen.getByRole("button", { name: "Choose columns" }));
};
// The chooser's own checkboxes are labelled by column header; Choice *filter* checkboxes are
// labelled by option text, so these names never collide.
const chooserRow = (header: string): HTMLElement =>
  screen
    .getByRole("checkbox", { name: header })
    .closest("[data-column]") as HTMLElement;

const twoCols = [{ key: "Title" }, { key: "Status" }];

describe("SpeelTable column chooser", () => {
  it("is absent unless asked for", () => {
    wrap(<SpeelTable of={Task} items={rows} columns={twoCols} />);
    expect(screen.queryByRole("button", { name: "Choose columns" })).toBeNull();
  });

  it("hides a column when its checkbox is cleared", () => {
    wrap(<SpeelTable of={Task} items={rows} columns={twoCols} columnChooser />);
    openChooser();
    fireEvent.click(screen.getByRole("checkbox", { name: "Status" }));
    expect(headers()).toEqual(["Title"]);
  });

  it("disables the last visible column so a table cannot be emptied", () => {
    wrap(
      <SpeelTable
        of={Task}
        items={rows}
        columns={twoCols}
        columnChooser
        defaultTableState={{
          columns: [{ key: "Title" }, { key: "Status", hidden: true }],
        }}
      />,
    );
    openChooser();
    expect(screen.getByRole("checkbox", { name: "Title" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Status" })).not.toBeDisabled();
  });

  it("reorders with the move buttons, which disable at the ends", () => {
    wrap(<SpeelTable of={Task} items={rows} columns={twoCols} columnChooser />);
    openChooser();
    expect(
      screen.getByRole("button", { name: "Move Title up" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Move Title down" }));
    expect(headers()).toEqual(["Status", "Title"]);
  });

  it("reorders by dragging one row onto another", () => {
    wrap(<SpeelTable of={Task} items={rows} columns={twoCols} columnChooser />);
    openChooser();
    fireEvent.dragStart(chooserRow("Status"));
    fireEvent.dragOver(chooserRow("Title"));
    fireEvent.drop(chooserRow("Title"));
    expect(headers()).toEqual(["Status", "Title"]);
  });

  it("reset emits the empty overlay", () => {
    const onTableStateChange = vi.fn();
    wrap(
      <SpeelTable
        of={Task}
        items={rows}
        columns={twoCols}
        columnChooser
        onTableStateChange={onTableStateChange}
      />,
    );
    openChooser();
    fireEvent.click(screen.getByRole("checkbox", { name: "Status" }));
    expect(headers()).toEqual(["Title"]);
    fireEvent.click(screen.getByRole("button", { name: "Reset columns" }));
    expect(onTableStateChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ columns: [] }),
    );
    expect(headers()).toEqual(["Title", "Status"]);
  });

  it("adoption: a toolbar consumer takes over and the standalone button yields", () => {
    // Stands in for the ViewPicker: consumes the context, adopts, renders the panel itself.
    function AdoptingChooser(): JSX.Element | null {
      const ctx = useContext(ColumnChooserContext);
      const [open, setOpen] = useState(false);
      useLayoutEffect(() => (ctx ? ctx.adopt() : undefined), [ctx]);
      if (!ctx) return null;
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Columns via menu
          </button>
          {open ? (
            <ColumnChooserPanel
              ui={fakeAdapter}
              arranged={ctx.arranged}
              onChange={ctx.onChange}
            />
          ) : null}
        </>
      );
    }
    wrap(
      <SpeelTable
        of={Task}
        items={rows}
        columns={twoCols}
        columnChooser
        toolbar={<AdoptingChooser />}
      />,
    );
    expect(screen.queryByRole("button", { name: "Choose columns" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Columns via menu" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Status" }));
    expect(headers()).toEqual(["Title"]);
  });

  it("adoption: no context is provided without the columnChooser prop", () => {
    function Probe(): JSX.Element {
      const ctx = useContext(ColumnChooserContext);
      return <span data-testid="probe">{ctx ? "yes" : "no"}</span>;
    }
    wrap(
      <SpeelTable
        of={Task}
        items={rows}
        columns={twoCols}
        toolbar={<Probe />}
      />,
    );
    expect(screen.getByTestId("probe").textContent).toBe("no");
  });

  it("lists hidden columns too, so they can be brought back", () => {
    wrap(
      <SpeelTable
        of={Task}
        items={rows}
        columns={twoCols}
        columnChooser
        defaultTableState={{
          columns: [{ key: "Title" }, { key: "Status", hidden: true }],
        }}
      />,
    );
    openChooser();
    fireEvent.click(screen.getByRole("checkbox", { name: "Status" }));
    expect(headers()).toEqual(["Title", "Status"]);
  });
});
