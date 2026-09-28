import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  DbContext,
  ModelBuilder,
  DbContextOptionsBuilder,
  type FormMode,
} from "@speel/core";
import { SpeelProvider } from "../src/SpeelProvider.js";
import {
  useEntityForm,
  EntityFormProvider,
} from "../src/form/useEntityForm.js";
import { SpeelField } from "../src/fields/SpeelField.js";
import { fakeAdapter } from "./fakeAdapter.js";

class M {
  Id?: number;
  Qty?: number;
  Price?: number;
  Active?: boolean;
  When?: Date;
  Status?: string;
}
class MCtx extends DbContext {
  protected override onModelCreating(mb: ModelBuilder): void {
    mb.entity(M, (b) => {
      b.toList("M");
      b.property((e) => e.Id).isNumber();
      b.property((e) => e.Qty)
        .isNumber()
        .hasMin(0)
        .hasMax(100)
        .hasDisplayName("Qty");
      b.property((e) => e.Price)
        .isCurrency()
        .hasCurrencyCode("USD")
        .hasDisplayName("Price");
      b.property((e) => e.Active)
        .isBoolean()
        .hasDisplayName("Active");
      b.property((e) => e.When)
        .isDateTime()
        .asDateOnly()
        .hasDisplayName("When");
      b.property((e) => e.Status)
        .isChoice()
        .hasOptions(["Open", "Closed"])
        .hasDisplayName("Status");
    });
  }
}
function ctxFor() {
  const b = new DbContextOptionsBuilder();
  b.useProvider({} as never);
  return new MCtx(b.options);
}
function renderField(m: M, name: string, mode: FormMode = "edit") {
  function Inner() {
    const form = useEntityForm(m, mode);
    return (
      <EntityFormProvider value={form as never}>
        <SpeelField name={name} />
      </EntityFormProvider>
    );
  }
  return render(
    <SpeelProvider db={ctxFor() as never} ui={fakeAdapter}>
      <Inner />
    </SpeelProvider>,
  );
}

describe("SpeelField kinds", () => {
  it("Number input edits a numeric value", () => {
    renderField(Object.assign(new M(), { Id: 1, Qty: 5 }), "Qty");
    const input = screen.getByLabelText(/Qty/);
    expect(input).toHaveValue(5);
    fireEvent.change(input, { target: { value: "7" } });
    expect(input).toHaveValue(7);
  });
  it("Currency renders a numeric input", () => {
    renderField(Object.assign(new M(), { Id: 1, Price: 12 }), "Price");
    expect(screen.getByLabelText(/Price/)).toHaveValue(12);
  });
  it("Boolean checkbox toggles", () => {
    renderField(Object.assign(new M(), { Id: 1, Active: false }), "Active");
    const box = screen.getByLabelText(/Active/);
    expect(box).not.toBeChecked();
    fireEvent.click(box);
    expect(box).toBeChecked();
  });
  it("DateTime input edits a date", () => {
    renderField(
      Object.assign(new M(), { Id: 1, When: new Date("2026-06-03T00:00:00Z") }),
      "When",
    );
    const input = screen.getByLabelText(/When/);
    expect(input).toHaveValue("2026-06-03");
    fireEvent.change(input, { target: { value: "2026-07-01" } });
    expect(input).toHaveValue("2026-07-01");
  });
  it("Choice combobox selects an option", async () => {
    renderField(Object.assign(new M(), { Id: 1, Status: "Open" }), "Status");
    // The fake combobox shows the value as a <span> beside its text input.
    expect(screen.getByText("Open").tagName).toBe("SPAN");
    fireEvent.change(screen.getByLabelText(/Status/), {
      target: { value: "clo" },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Closed" }));
    expect(screen.getByText("Closed").tagName).toBe("SPAN");
    expect(screen.queryByText("Open")).toBeNull();
  });
});
