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

class Doc {
  Id?: number;
  Title?: string;
  Secret?: string;
}
class DocsCtx extends DbContext {
  protected override onModelCreating(mb: ModelBuilder): void {
    mb.entity(Doc, (b) => {
      b.toList("Docs");
      b.property((e) => e.Id).isNumber();
      b.property((e) => e.Title)
        .isText()
        .isRequired()
        .hasMinLength(3)
        .hasDisplayName("Title");
      b.property((e) => e.Secret)
        .isText()
        .isReadOnly()
        .hasDisplayName("Secret")
        .hasRender((ctx) =>
          ctx.mode === "view"
            ? `redacted:${String(ctx.value ?? "")}`
            : undefined,
        );
    });
  }
}
function ctxFor() {
  const b = new DbContextOptionsBuilder();
  b.useProvider({} as never);
  return new DocsCtx(b.options);
}

function Inner({
  doc,
  mode,
  name,
}: {
  doc: Doc;
  mode: FormMode;
  name: string;
}) {
  const form = useEntityForm(doc, mode);
  return (
    <EntityFormProvider value={form as never}>
      <SpeelField name={name} />
    </EntityFormProvider>
  );
}
function renderField(doc: Doc, mode: FormMode, name: string) {
  return render(
    <SpeelProvider db={ctxFor() as never} ui={fakeAdapter}>
      <Inner doc={doc} mode={mode} name={name} />
    </SpeelProvider>,
  );
}

describe("SpeelField decision tree", () => {
  it("edit mode renders an input bound to the field", () => {
    renderField(
      Object.assign(new Doc(), { Id: 1, Title: "Hello" }),
      "edit",
      "Title",
    );
    const input = screen.getByLabelText(/Title/);
    expect(input).toHaveValue("Hello");
    fireEvent.change(input, { target: { value: "Hi" } });
    fireEvent.blur(input);
    expect(screen.getByText(/at least 3/)).toBeInTheDocument();
  });
  it("view mode renders a formatted display, not an input", () => {
    renderField(
      Object.assign(new Doc(), { Id: 1, Title: "Hello" }),
      "view",
      "Title",
    );
    expect(screen.queryByLabelText(/Title/)).toBeNull();
    expect(screen.getByTestId("display")).toHaveTextContent("Hello");
  });
  it("render override wins in view mode", () => {
    renderField(
      Object.assign(new Doc(), { Id: 1, Secret: "abc" }),
      "view",
      "Secret",
    );
    expect(screen.getByTestId("display")).toHaveTextContent("redacted:abc");
  });
  it("isReadOnly field renders a display even in edit mode (override returns undefined)", () => {
    renderField(
      Object.assign(new Doc(), { Id: 1, Secret: "abc" }),
      "edit",
      "Secret",
    );
    expect(screen.queryByLabelText(/Secret/)).toBeNull();
    expect(screen.getByTestId("display")).toBeInTheDocument();
  });
});
