import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DbContext, ModelBuilder, type FormMode } from "@speel/core";
import { SpeelProvider } from "../src/SpeelProvider.js";
import { SpeelForm, type SpeelFormProps } from "../src/form/SpeelForm.js";
import { fakeAdapter } from "./fakeAdapter.js";
import { makeFakeProvider } from "./fakeProvider.js";

// A shape with a hidden property, so "isVisible(false) does not render" has
// something to assert against. Named away from Process's own field names (see
// packages/speel-react/test/jsonFormat.test.tsx's note on the fluent idiom this
// package's vitest — no decorator transform — requires).
class TaskDefinition {
  TaskTitle?: string;
  TaskNotes?: string;
  Hidden?: string;
}

class Process {
  Id?: number;
  Headline?: TaskDefinition;
}

class PCtx extends DbContext {
  protected override onModelCreating(mb: ModelBuilder): void {
    mb.shape(TaskDefinition, (b) => {
      b.property((e) => e.TaskTitle)
        .isText()
        .hasDisplayName("Task title")
        .isRequired();
      b.property((e) => e.TaskNotes)
        .isText()
        .hasDisplayName("Task notes");
      b.property((e) => e.Hidden)
        .isText()
        .hasDisplayName("Hidden")
        .isVisible(false);
    });
    mb.entity(Process, (b) => {
      b.toList("Processes");
      b.property((e) => e.Id).isNumber();
      b.property((e) => e.Headline).isJson({ of: () => TaskDefinition });
    });
  }
}

function headline(overrides: Partial<TaskDefinition> = {}): TaskDefinition {
  return Object.assign(new TaskDefinition(), {
    TaskTitle: "A",
    TaskNotes: "B",
    Hidden: "H",
    ...overrides,
  });
}

function renderForm(
  mode: FormMode = "edit",
  given: TaskDefinition = headline(),
): { entity: Process } & ReturnType<typeof render> {
  const ctx = new PCtx({
    provider: makeFakeProvider({ Processes: [] }),
  } as never);
  const entity = Object.assign(new Process(), { Id: 1, Headline: given });
  const props: Partial<SpeelFormProps<Process>> = { mode };
  const utils = render(
    <SpeelProvider db={ctx as never} ui={fakeAdapter}>
      <SpeelForm entity={entity} {...props} />
    </SpeelProvider>,
  );
  return { ...utils, entity };
}

describe("JsonFieldBody: single shape", () => {
  it("renders each visible property as an input labelled by its display name", () => {
    renderForm();
    expect(
      (screen.getByLabelText("Task title") as HTMLInputElement).value,
    ).toBe("A");
    expect(
      (screen.getByLabelText("Task notes") as HTMLInputElement).value,
    ).toBe("B");
  });

  it("typing into one property leaves the others intact (the patch path)", () => {
    renderForm();
    fireEvent.change(screen.getByLabelText("Task title"), {
      target: { value: "Z" },
    });
    expect(
      (screen.getByLabelText("Task title") as HTMLInputElement).value,
    ).toBe("Z");
    // A naive `setValue({ [name]: v })` (replacing the whole instance with only the
    // edited key) would lose this — patchShapeInstance carries the rest forward.
    expect(
      (screen.getByLabelText("Task notes") as HTMLInputElement).value,
    ).toBe("B");
  });

  it("does not mutate the original instance the form was given", () => {
    const original = headline();
    renderForm("edit", original);
    fireEvent.change(screen.getByLabelText("Task title"), {
      target: { value: "Z" },
    });
    expect(original.TaskTitle).toBe("A");
  });

  it("does not render a property the shape marks isVisible(false)", () => {
    renderForm();
    expect(screen.queryByLabelText("Hidden")).not.toBeInTheDocument();
  });

  it("renders as display text, not inputs, in view mode", () => {
    renderForm("view");
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
  });

  describe("the shape-level error message", () => {
    // A nested ShapeFieldRow is a standalone field (useStandaloneField), whose
    // markTouched is a no-op — there is no parent form to notify on its own blur.
    // So the parent Json field's own `touched` (the same signal chromeOf gates
    // `chrome.error` on) never flips from interacting with a nested row; it only
    // flips from EntityForm's markAllTouched(), which runs on a submit attempt
    // (see FormFooter's "Save stays enabled while invalid" comment). That's the
    // genuine "the user has engaged with this field" signal here, so these tests
    // touch the field the same way emptySubmit.test.tsx does: by clicking Save.

    it("shows no error on first paint, even with a blank required nested property", () => {
      renderForm("create", headline({ TaskTitle: "" }));
      expect(
        screen.queryByText("Some fields need attention."),
      ).not.toBeInTheDocument();
    });

    it("shows the message once a submit attempt touches the field", async () => {
      renderForm("create", headline({ TaskTitle: "" }));
      expect(
        screen.queryByText("Some fields need attention."),
      ).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      expect(
        await screen.findByText("Some fields need attention."),
      ).toBeInTheDocument();
    });
  });
});
