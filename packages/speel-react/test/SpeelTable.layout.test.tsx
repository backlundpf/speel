import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { DbContext, ModelBuilder } from "@speel/core";
import { SpeelProvider } from "../src/SpeelProvider.js";
import { SpeelTable } from "../src/table/SpeelTable.js";
import { fakeAdapter } from "./fakeAdapter.js";
import { makeFakeProvider } from "./fakeProvider.js";

class Task {
  Id?: number;
  Title?: string;
  Notes?: string;
  Done?: boolean;
}
class TCtx extends DbContext {
  protected override onModelCreating(mb: ModelBuilder): void {
    mb.entity(Task, (b) => {
      b.toList("Tasks");
      b.property((e) => e.Id).isNumber();
      b.property((e) => e.Title).isText();
      b.property((e) => e.Notes).isNote();
      b.property((e) => e.Done).isBoolean();
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
  Object.assign(new Task(), { Id: 1, Title: "A", Notes: "n", Done: true }),
];
const th = (c: HTMLElement, i: number): HTMLElement =>
  c.querySelectorAll<HTMLElement>("th")[i]!;

describe("SpeelTable column layout", () => {
  it("hands each column its kind's grow and shrink", () => {
    const { container } = wrap(
      <SpeelTable
        of={Task}
        items={rows}
        columns={["Title", "Notes", "Done"]}
      />,
    );
    expect([
      th(container, 0).dataset["grow"],
      th(container, 0).dataset["shrink"],
    ]).toEqual(["1", "1"]);
    expect([
      th(container, 1).dataset["grow"],
      th(container, 1).dataset["shrink"],
    ]).toEqual(["2", "1"]);
    expect([
      th(container, 2).dataset["grow"],
      th(container, 2).dataset["shrink"],
    ]).toEqual(["0", "0"]);
  });

  it("lets a column override grow, shrink, minWidth and maxWidth", () => {
    const { container } = wrap(
      <SpeelTable
        of={Task}
        items={rows}
        columns={(p) => [
          p.Title.with({ grow: 0, shrink: 3, minWidth: 90, maxWidth: 160 }),
        ]}
      />,
    );
    const h = th(container, 0);
    expect([
      h.dataset["grow"],
      h.dataset["shrink"],
      h.dataset["minWidth"],
      h.dataset["maxWidth"],
    ]).toEqual(["0", "3", "90", "160"]);
  });

  it("keeps custom and actions columns fixed", () => {
    const { container } = wrap(
      <SpeelTable
        of={Task}
        items={rows}
        columns={[{ key: "x", header: "X", render: () => "x" }]}
        rowActions={{ onView: () => undefined }}
      />,
    );
    expect(th(container, 0).dataset["grow"]).toBe("0");
    expect(th(container, 1).dataset["grow"]).toBe("0");
    expect(th(container, 1).dataset["shrink"]).toBe("0");
  });

  it("passes the table's bounds to the skin", () => {
    const { container } = wrap(
      <SpeelTable
        of={Task}
        items={rows}
        columns={["Title"]}
        minWidth="100%"
        width={900}
        maxWidth={1200}
      />,
    );
    const table = container.querySelector<HTMLElement>("table")!;
    expect([
      table.dataset["minWidth"],
      table.dataset["width"],
      table.dataset["maxWidth"],
    ]).toEqual(["100%", "900", "1200"]);
  });

  it("freezes a column the user has dragged", () => {
    const { container, getByRole } = wrap(
      <SpeelTable of={Task} items={rows} columns={["Title", "Notes"]} />,
    );
    fireEvent.click(getByRole("button", { name: "Resize Title" }));
    expect(th(container, 0).dataset["width"]).toBe("250");
    expect([
      th(container, 0).dataset["grow"],
      th(container, 0).dataset["shrink"],
    ]).toEqual(["0", "0"]);
    expect(th(container, 1).dataset["grow"]).toBe("2");
  });
});
