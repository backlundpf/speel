import { describe, it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { DbContext, ModelBuilder, type FieldConfig } from "@speel/core";
import { SpeelProvider } from "../src/SpeelProvider.js";
import { SpeelUIProvider } from "../src/SpeelUIProvider.js";
import {
  useEntityForm,
  EntityFormProvider,
} from "../src/form/useEntityForm.js";
import { useStandaloneField } from "../src/form/useStandaloneField.js";
import { SpeelField } from "../src/fields/SpeelField.js";
import { fluentV8Adapter } from "../src/fluent-v8/index.js";
import { makeFakeProvider } from "./fakeProvider.js";

/**
 * A property's `description` is help text: under the input in edit mode (#99). These
 * run through the real v8 skin, whose field chrome draws the description and wires
 * `aria-describedby` — the gap was that SpeelField never handed it over.
 */

class Program {
  Id?: number;
  Title?: string;
}
class Gift {
  Id?: number;
  DonorName?: string;
  Amount?: number;
  DonorType?: string;
  Refunded?: boolean;
  Program?: Program;
  ProgramId?: number;
  Code?: string;
}
class Ctx extends DbContext {
  protected override onModelCreating(mb: ModelBuilder): void {
    mb.entity(Program, (b) => {
      b.toList("Programs");
      b.property((e) => e.Id).isNumber();
      b.property((e) => e.Title).isText();
    });
    mb.entity(Gift, (b) => {
      b.toList("Gifts");
      b.property((e) => e.Id).isNumber();
      b.property((e) => e.DonorName)
        .isText()
        .hasDisplayName("Donor Name")
        .hasDescription("Last name as printed on the check")
        .isRequired();
      b.property((e) => e.Amount)
        .isNumber()
        .hasDisplayName("Amount")
        .hasDescription("Whole dollars");
      b.property((e) => e.DonorType)
        .isChoice()
        .hasOptions(["Person", "Company"])
        .hasDisplayName("Donor Type")
        .hasDescription("Who gave the gift");
      b.property((e) => e.Refunded)
        .isBoolean()
        .hasDisplayName("Refunded")
        .hasDescription("Funds were returned");
      b.hasOne(Program, (e) => e.Program)
        .withMany()
        .hasForeignKey((e) => e.ProgramId)
        .hasDisplayField((p) => p.Title)
        .hasDisplayName("Program")
        .hasDescription("The program it supports");
      b.property((e) => e.Code)
        .isText()
        .hasDisplayName("Code")
        .hasDescription("Assigned on receipt")
        .isReadOnly();
    });
  }
}

function renderGift(mode: "edit" | "view" = "edit"): {
  markTouched: (name: string) => void;
} {
  const ctx = new Ctx({
    provider: makeFakeProvider({ Programs: [] }),
  } as never);
  const gift = Object.assign(new Gift(), { Id: 1 });
  let touch: (name: string) => void = () => {};
  function Inner() {
    const form = useEntityForm(gift, mode);
    touch = (n) => form.markTouched(n);
    return (
      <EntityFormProvider value={form as never}>
        {[
          "DonorName",
          "Amount",
          "DonorType",
          "Refunded",
          "Program",
          "Code",
        ].map((n) => (
          <SpeelField key={n} name={n} />
        ))}
      </EntityFormProvider>
    );
  }
  render(
    <SpeelProvider db={ctx as never} ui={fluentV8Adapter}>
      <Inner />
    </SpeelProvider>,
  );
  return { markTouched: (n) => act(() => touch(n)) };
}

const describedBy = (el: HTMLElement): string[] =>
  (el.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);

describe("a property's description in edit mode", () => {
  it("renders each property's description under its input", () => {
    renderGift();
    for (const text of [
      "Last name as printed on the check",
      "Whole dollars",
      "Who gave the gift",
      "Funds were returned",
      "The program it supports",
    ])
      expect(screen.getByText(text)).toBeInTheDocument();
  });

  it("the input is described by it", () => {
    renderGift();
    const desc = screen.getByText("Last name as printed on the check");
    const input = screen.getByRole("textbox", { name: /Donor Name/ });
    expect(describedBy(input)).toContain(desc.id);
  });

  it("describedby carries error and description", () => {
    const { markTouched } = renderGift();
    markTouched("DonorName");
    const input = screen.getByRole("textbox", { name: /Donor Name/ });
    const desc = screen.getByText("Last name as printed on the check");
    const err = screen.getByRole("alert");
    expect(describedBy(input)).toEqual(
      expect.arrayContaining([desc.id, err.id]),
    );
  });
});

describe("a property's description on a display", () => {
  it("view mode shows the description as text", () => {
    renderGift("view");
    expect(screen.getByText("Last name as printed on the check")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /More information/ }),
    ).not.toBeInTheDocument();
  });

  it("a read-only field shows the description as text", () => {
    renderGift("edit");
    expect(screen.getByText("Assigned on receipt")).toBeVisible();
  });
});

describe("a standalone field's description", () => {
  it("standalone field forwards description", () => {
    function Lone() {
      const field = useStandaloneField({
        config: { kind: "Text" } as FieldConfig,
        displayName: "Search",
        value: "",
        onChange: () => {},
        description: "Hint",
      });
      return <SpeelField field={field} />;
    }
    render(
      <SpeelUIProvider ui={fluentV8Adapter}>
        <Lone />
      </SpeelUIProvider>,
    );
    expect(screen.getByText("Hint")).toBeInTheDocument();
  });
});

class Step {
  StepTitle?: string;
}
class Flow {
  Id?: number;
  First?: Step;
}
class FlowCtx extends DbContext {
  protected override onModelCreating(mb: ModelBuilder): void {
    mb.shape(Step, (b) => {
      b.property((e) => e.StepTitle)
        .isText()
        .hasDisplayName("Step title")
        .hasDescription("What the step is called");
    });
    mb.entity(Flow, (b) => {
      b.toList("Flows");
      b.property((e) => e.Id).isNumber();
      b.property((e) => e.First).isJson({ of: () => Step });
    });
  }
}

describe("a shape's property descriptions", () => {
  it("shape rows show their property descriptions", () => {
    const ctx = new FlowCtx({
      provider: makeFakeProvider({ Flows: [] }),
    } as never);
    const flow = Object.assign(new Flow(), {
      Id: 1,
      First: Object.assign(new Step(), { StepTitle: "A" }),
    });
    function Inner() {
      const form = useEntityForm(flow, "edit");
      return (
        <EntityFormProvider value={form as never}>
          <SpeelField name="First" />
        </EntityFormProvider>
      );
    }
    render(
      <SpeelProvider db={ctx as never} ui={fluentV8Adapter}>
        <Inner />
      </SpeelProvider>,
    );
    expect(screen.getByText("What the step is called")).toBeInTheDocument();
  });
});
