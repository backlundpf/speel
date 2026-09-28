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
  Body?: string;
  Notes?: string;
}
class MCtx extends DbContext {
  protected override onModelCreating(mb: ModelBuilder): void {
    mb.entity(M, (b) => {
      b.toList("M");
      b.property((e) => e.Id).isNumber();
      b.property((e) => e.Body)
        .isNote()
        .asRichText()
        .hasDisplayName("Body");
      b.property((e) => e.Notes)
        .isNote()
        .hasDisplayName("Notes");
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

describe("SpeelField rich text dispatch", () => {
  it("renders RichTextInput for a richText note field", () => {
    const m = new M();
    m.Body = "<p>Hello</p>";
    renderField(m, "Body");
    const input = screen.getByTestId("rich-text-input");
    expect(input).toHaveValue("<p>Hello</p>");
  });

  it("routes edits through the form value", () => {
    const m = new M();
    renderField(m, "Body");
    fireEvent.change(screen.getByTestId("rich-text-input"), {
      target: { value: "<p>Edited</p>" },
    });
    expect(
      (screen.getByTestId("rich-text-input") as HTMLTextAreaElement).value,
    ).toBe("<p>Edited</p>");
  });

  it("keeps the plain TextInput for a non-rich note field", () => {
    const m = new M();
    m.Notes = "plain";
    renderField(m, "Notes");
    expect(screen.queryByTestId("rich-text-input")).toBeNull();
    expect(screen.getByLabelText("Notes")).toHaveValue("plain");
  });
});

describe("rich text view mode", () => {
  it("renders stored HTML as elements", () => {
    const m = new M();
    m.Body = "<p>Hi <strong>bold</strong></p>";
    const { container } = renderField(m, "Body", "view");
    const strong = container.querySelector("strong");
    expect(strong?.textContent).toBe("bold");
    // Not shown as literal markup:
    expect(container.textContent).not.toContain("<strong>");
  });

  it("strips scriptable payloads", () => {
    const m = new M();
    m.Body = '<p>ok</p><script>evil()</script><img src="x" onerror="evil()">';
    const { container } = renderField(m, "Body", "view");
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")?.getAttribute("onerror")).toBeNull();
    expect(container.textContent).toContain("ok");
  });

  it("shows the empty marker when sanitization leaves nothing", () => {
    const m = new M();
    m.Body = "<script>evil()</script>";
    const { container } = renderField(m, "Body", "view");
    expect(container.textContent).toContain("—");
  });

  it("keeps plain-note view mode as literal text", () => {
    const m = new M();
    m.Notes = "<p>not html</p>";
    const { container } = renderField(m, "Notes", "view");
    expect(container.querySelector("p")).toBeNull();
    expect(container.textContent).toContain("<p>not html</p>");
  });
});
