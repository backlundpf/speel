import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DbContext, ModelBuilder } from "@speel/core";
import { SpeelProvider } from "../src/SpeelProvider.js";
import { SpeelForm } from "../src/form/SpeelForm.js";
import { fakeAdapter } from "./fakeAdapter.js";
import { makeFakeProvider } from "./fakeProvider.js";

class Item {
  Id?: number;
  Title?: string;
  Note?: string;
}
class ICtx extends DbContext {
  protected override onModelCreating(mb: ModelBuilder): void {
    mb.entity(Item, (b) => {
      b.toList("Items");
      b.property((e) => e.Id).isNumber();
      b.property((e) => e.Title)
        .isText()
        .hasDisplayName("Title");
      b.property((e) => e.Note)
        .isText()
        .hasDisplayName("Note");
    });
  }
}
const ctx = () =>
  new ICtx({ provider: makeFakeProvider({ Items: [] }) } as never);

describe("EntityFormBody sections", () => {
  it("renders a heading per section and only that section’s fields", () => {
    const entity = Object.assign(new Item(), { Id: 1, Title: "T", Note: "N" });
    render(
      <SpeelProvider db={ctx() as never} ui={fakeAdapter}>
        <SpeelForm
          entity={entity}
          mode="edit"
          sections={[
            { title: "First", fields: ["Title"] },
            { title: "Second", fields: ["Note"] },
          ]}
        />
      </SpeelProvider>,
    );
    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
    expect(screen.getByLabelText(/Title/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Note/)).toBeInTheDocument();
  });
});
