import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { DbContext, ModelBuilder } from "@speel/core";
import { SpeelProvider } from "../src/SpeelProvider.js";
import { SpeelTable } from "../src/table/SpeelTable.js";
import type { SpeelTableProps } from "../src/table/SpeelTable.js";
import { fakeAdapter } from "./fakeAdapter.js";
import { makeFakeProvider } from "./fakeProvider.js";

class Task {
  Id?: number;
  Title?: string;
  Status?: string;
  Done?: boolean;
}
class TCtx extends DbContext {
  protected override onModelCreating(mb: ModelBuilder): void {
    mb.entity(Task, (b) => {
      b.toList("Tasks");
      b.property((e) => e.Id).isNumber();
      b.property((e) => e.Title).isText();
      b.property((e) => e.Status)
        .isChoice()
        .hasOptions(["Open", "Closed"]);
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
  Object.assign(new Task(), { Id: 1, Title: "A", Status: "Open", Done: true }),
];
const th = (container: HTMLElement, i: number): HTMLElement =>
  container.querySelectorAll<HTMLElement>("th")[i]!;
const noop = (): void => undefined;

describe("SpeelTable width hints", () => {
  it("hands each column its field kind's default as a hint, not a width", () => {
    const { container } = wrap(
      <SpeelTable
        of={Task}
        items={rows}
        columns={["Title", "Status", "Done"]}
      />,
    );
    expect(th(container, 0).dataset["defaultWidth"]).toBe("180");
    expect(th(container, 1).dataset["defaultWidth"]).toBe("120");
    expect(th(container, 2).dataset["defaultWidth"]).toBe("70");
    expect(th(container, 0).dataset["width"]).toBeUndefined();
  });

  it("passes an authored width alongside the hint", () => {
    const { container } = wrap(
      <SpeelTable
        of={Task}
        items={rows}
        columns={(p) => [p.Title.with({ width: 300 })]}
      />,
    );
    expect(th(container, 0).dataset["width"]).toBe("300");
    expect(th(container, 0).dataset["defaultWidth"]).toBe("180");
  });

  it("gives a custom column the custom default", () => {
    const { container } = wrap(
      <SpeelTable
        of={Task}
        items={rows}
        columns={[{ key: "x", header: "X", render: () => "x" }]}
      />,
    );
    expect(th(container, 0).dataset["defaultWidth"]).toBe("100");
  });

  it.each<[string, NonNullable<SpeelTableProps<Task>["rowActions"]>, number]>([
    ["one built-in", { onView: noop }, 32],
    ["three built-ins", { onView: noop, onEdit: noop, onDelete: noop }, 104],
    [
      "three built-ins + one custom",
      {
        onView: noop,
        onEdit: noop,
        onDelete: noop,
        custom: [{ key: "u", iconName: "Upload", title: "Up", onClick: noop }],
      },
      140,
    ],
  ])("sizes the actions column for %s", (_name, rowActions, expected) => {
    const { container } = wrap(
      <SpeelTable
        of={Task}
        items={rows}
        columns={["Title"]}
        rowActions={rowActions}
      />,
    );
    const actions = th(container, 1);
    expect(actions.dataset["defaultWidth"]).toBe(String(expected));
    expect(actions.dataset["width"]).toBeUndefined();
  });
});
