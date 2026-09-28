import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DbContext, ModelBuilder, DbContextOptionsBuilder } from "@speel/core";
import { SpeelProvider } from "../src/SpeelProvider.js";
import {
  useEntityForm,
  EntityFormProvider,
} from "../src/form/useEntityForm.js";
import { useField } from "../src/form/useField.js";
import { fakeAdapter } from "./fakeAdapter.js";

class Note {
  Id?: number;
  Title?: string;
}
class NotesCtx extends DbContext {
  protected override onModelCreating(mb: ModelBuilder): void {
    mb.entity(Note, (b) => {
      b.toList("Notes");
      b.property((e) => e.Id).isNumber();
      b.property((e) => e.Title)
        .isText()
        .isRequired()
        .hasMinLength(3);
    });
  }
}

function TitleField() {
  const f = useField<string>("Title");
  return (
    <fakeAdapter.TextInput
      label="Title"
      value={f.value ?? ""}
      required={f.required}
      onChange={f.setValue}
      onBlur={f.markTouched}
      error={f.touched ? f.errors[0] : undefined}
    />
  );
}
function Harness({ note }: { note: Note }) {
  const form = useEntityForm(note, "edit");
  return (
    <EntityFormProvider value={form}>
      <TitleField />
    </EntityFormProvider>
  );
}

function makeCtx(): NotesCtx {
  const b = new DbContextOptionsBuilder();
  b.useProvider({} as never); // stub provider — no I/O is exercised in this test
  return new NotesCtx(b.options);
}

describe("useEntityForm + useField", () => {
  it("binds a field, edits the draft, and surfaces validation on touch", async () => {
    const note = Object.assign(new Note(), { Id: 1, Title: "" });
    render(
      <SpeelProvider db={makeCtx()} ui={fakeAdapter}>
        <Harness note={note} />
      </SpeelProvider>,
    );
    const input = screen.getByLabelText(/Title/);
    fireEvent.change(input, { target: { value: "ab" } });
    fireEvent.blur(input);
    await waitFor(() =>
      expect(screen.getByText(/at least 3/)).toBeInTheDocument(),
    );
    fireEvent.change(input, { target: { value: "abc" } });
    await waitFor(() => expect(screen.queryByText(/at least 3/)).toBeNull());
  });
});
