import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DbContext, ModelBuilder } from "@speel/core";
import { SpeelProvider } from "../src/SpeelProvider.js";
import { SpeelTable } from "../src/table/SpeelTable.js";
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
const rows = [
  Object.assign(new Task(), { Id: 1, Title: "A", Status: "Open" }),
  Object.assign(new Task(), { Id: 2, Title: "B", Status: "Closed" }),
];
const titleHeader = (): HTMLElement =>
  screen
    .getAllByRole("columnheader")
    .find((h) => h.textContent?.includes("Title"))!;

describe("SpeelTable column widths", () => {
  it("applies the descriptor width until the user resizes", () => {
    wrap(
      <SpeelTable
        of={Task}
        items={rows}
        columns={[{ key: "Title", width: 120 }, { key: "Status" }]}
      />,
    );
    expect(titleHeader().getAttribute("data-width")).toBe("120");

    fireEvent.click(screen.getByRole("button", { name: "Resize Title" }));
    expect(titleHeader().getAttribute("data-width")).toBe("250");
  });

  it("keeps the resized width through a sort", () => {
    wrap(
      <SpeelTable
        of={Task}
        items={rows}
        columns={[{ key: "Title" }, { key: "Status" }]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Resize Title" }));
    fireEvent.click(screen.getByRole("button", { name: /^Title/ }));
    expect(titleHeader().getAttribute("data-width")).toBe("250");
  });
});
