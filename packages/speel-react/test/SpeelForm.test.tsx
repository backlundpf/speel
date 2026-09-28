import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DbContext, ModelBuilder } from "@speel/core";
import { SpeelProvider } from "../src/SpeelProvider.js";
import { SpeelForm, type SpeelFormProps } from "../src/form/SpeelForm.js";
import { fakeAdapter } from "./fakeAdapter.js";
import { makeFakeProvider } from "./fakeProvider.js";

class Task {
  Id?: number;
  Title?: string;
}
class TCtx extends DbContext {
  protected override onModelCreating(mb: ModelBuilder): void {
    mb.entity(Task, (b) => {
      b.toList("Tasks");
      b.property((e) => e.Id).isNumber();
      b.property((e) => e.Title)
        .isText()
        .hasDisplayName("Title");
    });
  }
}
function renderForm(props: Partial<SpeelFormProps<Task>> = {}) {
  const ctx = new TCtx({ provider: makeFakeProvider({ Tasks: [] }) } as never);
  const entity = Object.assign(new Task(), { Id: 1, Title: "T" });
  return render(
    <SpeelProvider db={ctx as never} ui={fakeAdapter}>
      <SpeelForm entity={entity} {...props} />
    </SpeelProvider>,
  );
}

describe("SpeelForm", () => {
  it("shows Save + Cancel in edit mode", () => {
    renderForm({ mode: "edit" });
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });
  it("shows Edit in view mode and flips to edit", () => {
    renderForm({ mode: "view" });
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });
  it("Cancel resets the draft and then invokes onCancel (create)", () => {
    const onCancel = vi.fn();
    renderForm({ mode: "create", onCancel });
    const input = screen.getByLabelText(/Title/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "edited" } });
    expect(input.value).toBe("edited");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(input.value).toBe("T"); // reset still runs
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
  it("Cancel in edit mode returns to view and still invokes onCancel", () => {
    const onCancel = vi.fn();
    renderForm({ mode: "edit", onCancel });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
  it("renders custom actions when provided", () => {
    const onClick = vi.fn();
    renderForm({
      mode: "edit",
      actions: [{ key: "x", text: "Do X", onClick }],
    });
    expect(
      screen.queryByRole("button", { name: "Save" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Do X" }));
    expect(onClick).toHaveBeenCalled();
  });
});
