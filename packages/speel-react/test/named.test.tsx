import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DbContext, ModelBuilder, DbContextOptionsBuilder } from "@speel/core";
import { SpeelProvider } from "../src/SpeelProvider.js";
import {
  useEntityForm,
  EntityFormProvider,
} from "../src/form/useEntityForm.js";
import { SpeelTextField } from "../src/fields/named.js";
import { fakeAdapter } from "./fakeAdapter.js";

class Doc {
  Id?: number;
  Title?: string;
}
class DocsCtx extends DbContext {
  protected override onModelCreating(mb: ModelBuilder): void {
    mb.entity(Doc, (b) => {
      b.toList("Docs");
      b.property((e) => e.Id).isNumber();
      b.property((e) => e.Title)
        .isText()
        .hasDisplayName("Title");
    });
  }
}
function ctxFor() {
  const b = new DbContextOptionsBuilder();
  b.useProvider({} as never);
  return new DocsCtx(b.options);
}

describe("named wrappers", () => {
  it("SpeelTextField binds by name like SpeelField", () => {
    const doc = Object.assign(new Doc(), { Id: 1, Title: "X" });
    function Inner() {
      const form = useEntityForm(doc, "edit");
      return (
        <EntityFormProvider value={form as never}>
          <SpeelTextField name="Title" />
        </EntityFormProvider>
      );
    }
    render(
      <SpeelProvider db={ctxFor() as never} ui={fakeAdapter}>
        <Inner />
      </SpeelProvider>,
    );
    expect(screen.getByLabelText(/Title/)).toHaveValue("X");
  });
});
