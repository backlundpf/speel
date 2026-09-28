import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
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
const bodyRows = (): HTMLElement[] => screen.getAllByRole("row").slice(1); // drop the header row

describe("SpeelTable row styling", () => {
  it("marks rows with an intent from the predicate", () => {
    wrap(
      <SpeelTable
        of={Task}
        items={rows}
        rowIntent={(r) => (r.Status === "Open" ? "warning" : undefined)}
      />,
    );
    const [first, second] = bodyRows();
    expect(first!.getAttribute("data-intent")).toBe("warning");
    expect(second!.hasAttribute("data-intent")).toBe(false);
  });

  it("applies a row class name from the predicate", () => {
    wrap(
      <SpeelTable
        of={Task}
        items={rows}
        rowClassName={(r) => (r.Id === 2 ? "overdue" : undefined)}
      />,
    );
    const [first, second] = bodyRows();
    expect(first!.className).toBe("");
    expect(second!.className).toBe("overdue");
  });

  it("leaves rows unmarked when neither prop is given", () => {
    wrap(<SpeelTable of={Task} items={rows} />);
    for (const row of bodyRows()) {
      expect(row.hasAttribute("data-intent")).toBe(false);
      expect(row.className).toBe("");
    }
  });
});
