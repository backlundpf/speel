import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DbContext, ModelBuilder } from "@speel/core";
import { SpeelProvider } from "../src/SpeelProvider.js";
import { SpeelTable } from "../src/table/SpeelTable.js";
import { fakeAdapter } from "./fakeAdapter.js";
import { makeFakeProvider } from "./fakeProvider.js";

class Org {
  Id?: number;
  Title?: string;
  Notes?: string;
}
class OCtx extends DbContext {
  protected override onModelCreating(mb: ModelBuilder): void {
    mb.entity(Org, (b) => {
      b.toList("Orgs");
      b.property((e) => e.Id).isNumber();
      b.property((e) => e.Title)
        .isText()
        .hasDisplayName("Title");
      b.property((e) => e.Notes)
        .isText()
        .hasDisplayName("Notes");
    });
  }
}
function wrap(node: JSX.Element) {
  const ctx = new OCtx({ provider: makeFakeProvider({ Orgs: [] }) } as never);
  return render(
    <SpeelProvider db={ctx as never} ui={fakeAdapter}>
      {node}
    </SpeelProvider>,
  );
}
const rows = [
  Object.assign(new Org(), { Id: 1, Title: "Contoso Ltd", Notes: "n" }),
];
const cell = (container: HTMLElement, i: number): HTMLElement =>
  container.querySelectorAll<HTMLElement>("tbody td")[i]!;
const head = (container: HTMLElement, i: number): HTMLElement =>
  container.querySelectorAll<HTMLElement>("th")[i]!;

describe("SpeelTable column options", () => {
  it("hands every data column its cell text for a hover title", () => {
    const { container } = wrap(
      <SpeelTable of={Org} items={rows} columns={["Title"]} />,
    );
    expect(cell(container, 0).dataset["cellTitle"]).toBe("Contoso Ltd");
  });

  it("reads a custom render's text, not the element", () => {
    const { container } = wrap(
      <SpeelTable
        of={Org}
        items={rows}
        columns={(p) => [
          p.Title.with({ render: (r) => <a href="#x">{r.Title}</a> }),
        ]}
      />,
    );
    expect(cell(container, 0).dataset["cellTitle"]).toBe("Contoso Ltd");
  });

  it("leaves out the hover title when the column opts out", () => {
    const { container } = wrap(
      <SpeelTable
        of={Org}
        items={rows}
        columns={(p) => [p.Notes.with({ cellTitle: false })]}
      />,
    );
    expect(cell(container, 0).dataset["cellTitle"]).toBeUndefined();
  });

  it("gives the actions column no hover title", () => {
    const { container } = wrap(
      <SpeelTable
        of={Org}
        items={rows}
        columns={["Title"]}
        rowActions={{ onView: () => undefined }}
      />,
    );
    expect(cell(container, 1).dataset["cellTitle"]).toBeUndefined();
  });

  it("carries wrap to the skin", () => {
    const { container } = wrap(
      <SpeelTable
        of={Org}
        items={rows}
        columns={(p) => [p.Title.with({ wrap: true }), p.Notes]}
      />,
    );
    expect(head(container, 0).dataset["wrap"]).toBe("");
    expect(head(container, 1).dataset["wrap"]).toBeUndefined();
  });

  it("renders headerContent in the header while header still names the column", () => {
    const { container } = wrap(
      <SpeelTable
        of={Org}
        items={rows}
        columns={[
          {
            key: "select",
            header: "Select",
            headerContent: (
              <input type="checkbox" aria-label="Select all" readOnly />
            ),
            render: () => (
              <input type="checkbox" aria-label="Select row" readOnly />
            ),
          },
        ]}
      />,
    );
    expect(
      screen.getByRole("checkbox", { name: "Select all" }),
    ).toBeInTheDocument();
    expect(head(container, 0).textContent).not.toContain("Select");
  });
});
