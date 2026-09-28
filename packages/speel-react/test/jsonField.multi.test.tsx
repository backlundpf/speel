import { describe, it, expect } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { DbContext, ModelBuilder, type FormMode } from "@speel/core";
import { SpeelProvider } from "../src/SpeelProvider.js";
import { SpeelForm, type SpeelFormProps } from "../src/form/SpeelForm.js";
import { fakeAdapter } from "./fakeAdapter.js";
import { makeFakeProvider } from "./fakeProvider.js";

// A shape reused as the repeater's element, same fluent-idiom note as
// jsonField.single.test.tsx: this package's vitest has no decorator transform, so
// the model is built with mb.shape/mb.entity, never decorators.
class TaskDefinition {
  TaskTitle?: string;
  TaskNotes?: string;
}

class Process {
  Id?: number;
  Steps?: TaskDefinition[];
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
    });
    mb.entity(Process, (b) => {
      b.toList("Processes");
      b.property((e) => e.Id).isNumber();
      b.property((e) => e.Steps)
        .isMultiJson({ of: () => TaskDefinition })
        .hasDisplayName("Steps");
    });
  }
}

function step(title: string, notes = ""): TaskDefinition {
  return Object.assign(new TaskDefinition(), {
    TaskTitle: title,
    TaskNotes: notes,
  });
}

function renderForm(
  mode: FormMode,
  given: TaskDefinition[] | undefined,
): { entity: Process } & ReturnType<typeof render> {
  const ctx = new PCtx({
    provider: makeFakeProvider({ Processes: [] }),
  } as never);
  const entity = Object.assign(new Process(), { Id: 1, Steps: given });
  const props: Partial<SpeelFormProps<Process>> = { mode };
  const utils = render(
    <SpeelProvider db={ctx as never} ui={fakeAdapter}>
      <SpeelForm entity={entity} {...props} />
    </SpeelProvider>,
  );
  return { ...utils, entity };
}

// A second model whose Json property is READ-ONLY. It needs its own entity because
// `readOnly` is a property-level refinement, not a render-time prop — there is no way
// to flip it on `Steps` above for one test.
class Recipe {
  Id?: number;
  Steps?: TaskDefinition[];
}

class RCtx extends DbContext {
  protected override onModelCreating(mb: ModelBuilder): void {
    mb.shape(TaskDefinition, (b) => {
      b.property((e) => e.TaskTitle)
        .isText()
        .hasDisplayName("Task title")
        .isRequired();
      b.property((e) => e.TaskNotes)
        .isText()
        .hasDisplayName("Task notes");
    });
    mb.entity(Recipe, (b) => {
      b.toList("Recipes");
      b.property((e) => e.Id).isNumber();
      b.property((e) => e.Steps)
        .isMultiJson({ of: () => TaskDefinition })
        .hasDisplayName("Steps")
        .isReadOnly();
    });
  }
}

function renderReadOnlyForm(
  given: TaskDefinition[],
): ReturnType<typeof render> {
  const ctx = new RCtx({
    provider: makeFakeProvider({ Recipes: [] }),
  } as never);
  const entity = Object.assign(new Recipe(), { Id: 1, Steps: given });
  const props: Partial<SpeelFormProps<Recipe>> = { mode: "edit" };
  return render(
    <SpeelProvider db={ctx as never} ui={fakeAdapter}>
      <SpeelForm entity={entity} {...props} />
    </SpeelProvider>,
  );
}

/** Each repeater row is a `<fieldset>` with a `<legend>` naming its position, so a
 *  test can scope into one row's inputs without the same-named-field ambiguity a
 *  flat query would hit (every row declares the same "Task title" label). */
function rowTitleInput(index: number): HTMLInputElement {
  const group = screen.getByRole("group", { name: `Element ${index}` });
  return within(group).getByLabelText("Task title") as HTMLInputElement;
}

describe("JsonFieldBody: multi shape (repeater)", () => {
  it("renders each element as its own fieldset, and editing element 2 leaves element 1 alone", () => {
    renderForm("edit", [step("A"), step("B")]);
    expect(screen.getAllByRole("group")).toHaveLength(2);
    expect(rowTitleInput(1).value).toBe("A");
    expect(rowTitleInput(2).value).toBe("B");

    fireEvent.change(rowTitleInput(2), { target: { value: "Z" } });

    expect(rowTitleInput(1).value).toBe("A");
    expect(rowTitleInput(2).value).toBe("Z");
  });

  it("Add appends an empty element, whose inputs start blank", () => {
    renderForm("edit", [step("A")]);
    expect(screen.getAllByRole("group")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(screen.getAllByRole("group")).toHaveLength(2);
    expect(rowTitleInput(1).value).toBe("A");
    expect(rowTitleInput(2).value).toBe("");
    const newNotes = within(
      screen.getByRole("group", { name: "Element 2" }),
    ).getByLabelText("Task notes") as HTMLInputElement;
    expect(newNotes.value).toBe("");
  });

  it("Remove on element 1 of three leaves the other two, values intact and in order", () => {
    renderForm("edit", [step("A"), step("B"), step("C")]);

    fireEvent.click(screen.getByRole("button", { name: "Remove element 1" }));

    expect(screen.getAllByRole("group")).toHaveLength(2);
    expect(rowTitleInput(1).value).toBe("B");
    expect(rowTitleInput(2).value).toBe("C");
  });

  it("Move down on element 1 swaps it with element 2, and the moved row keeps its subtree (fails if rows are keyed by index)", () => {
    renderForm("edit", [step("A"), step("B"), step("C")]);
    const originalNode = rowTitleInput(1);
    expect(originalNode.value).toBe("A");

    fireEvent.click(
      screen.getByRole("button", { name: "Move element 1 down" }),
    );

    expect(rowTitleInput(1).value).toBe("B");
    expect(rowTitleInput(2).value).toBe("A");
    expect(rowTitleInput(3).value).toBe("C");
    // The DOM node that used to be "Element 1" (holding A) must be the SAME node
    // now rendering as "Element 2" — proof the row's React subtree travelled with
    // its data instead of being remounted in place. An index-keyed implementation
    // would instead leave this exact node showing "B" (whatever now sits at
    // position 1), and A would appear in a freshly mounted node — this assertion
    // is the one that catches that.
    expect(rowTitleInput(2)).toBe(originalNode);
  });

  it("does not render Add, Remove or Move in view mode", () => {
    renderForm("view", [step("A"), step("B")]);
    expect(
      screen.queryByRole("button", { name: "Add" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /move element/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /remove element/i }),
    ).not.toBeInTheDocument();
  });

  it("renders the label and Add for an empty value, with no fieldsets", () => {
    renderForm("edit", undefined);
    expect(screen.getByText("Steps")).toBeInTheDocument();
    // Not getByRole("button", { name: "Add" }): fakeAdapter's FieldDisplay wraps
    // its children in a bare <label>, and with no rows rendered the Add button is
    // the only labelable descendant, so jsdom's accessible-name computation
    // credits it with the outer field's own label text instead of its own "Add".
    // The real v8 skin's FieldDisplay (V8FieldDisplay) does not have this
    // problem — it wraps content in a role="group" div, not a <label> — so this
    // is a fakeAdapter test-harness quirk, not a JsonFieldBody bug.
    expect(screen.getByText("Add").closest("button")).toBeInTheDocument();
    expect(screen.queryAllByRole("group")).toHaveLength(0);
  });

  // A read-only field is the one case where the form's own mode says "edit" but the
  // field must still read as text. Every other field kind in speel honours that
  // through SpeelField's `mode === "view" || readOnly` branch; a Json field is
  // dispatched AHEAD of that branch, so its nested rows have to be told.
  it("a read-only field reads as text, with no inputs and no management controls", () => {
    renderReadOnlyForm([step("A", "first"), step("B", "second")]);

    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("first")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(
      screen.queryByRole("button", { name: "Add" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /remove element/i }),
    ).not.toBeInTheDocument();
  });

  // The row-level half of what commit ce401f8 fixed at the parent level: a nested
  // required property must not accuse the user before they have had a chance to fill
  // it in. A nested row is a standalone field whose own `markTouched` is a no-op, so
  // the only honest "the user has engaged with this" signal is the PARENT field's
  // `touched` — which flips on the form's markAllTouched(), i.e. a submit attempt.
  it("a freshly added row shows no required error until a submit attempt", async () => {
    renderForm("create", [step("A")]);

    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    const added = (): HTMLElement =>
      screen.getByRole("group", { name: "Element 2" });
    expect(
      within(added()).queryByText("Task title is required."),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await within(added()).findByText("Task title is required."),
    ).toBeInTheDocument();
  });
});
